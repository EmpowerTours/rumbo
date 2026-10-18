// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title  ToursClaimDistributor: pays the ONE shared $TOURS on Monad mainnet for activity recorded
///         on Rumbo's testnet ledger (a perk while Rumbo runs on testnet).
/// @notice NOT DEPLOYED. Mainnet deployment and funding need EmpowerTours' explicit approval.
///
///         Flow: Rumbo's testnet contracts record earned $TOURS (attested check-ins, streaks, ticket
///         scans, artist backing) as non-transferable ledger points with a per-day mint leash.
///         `scripts/tours-snapshot.mjs` periodically turns that ledger into an epoch: per-wallet
///         CUMULATIVE entitlements (after anti-sybil filters and caps), hashed into a Merkle root. The
///         publisher posts the root here; each wallet claims `cumulative - alreadyClaimed`. The shared
///         passkey wallet is the same address on both chains, so no linking step is needed.
///
///         Every leash is enforced ON CHAIN, so a leaked publisher key or a bad snapshot is bounded:
///           - `maxEpochIncrease` (immutable): a new root may add at most this much to the total.
///           - `minEpochInterval` (immutable): roots can't be published faster than this.
///           - `maxPerWalletPerEpoch` (immutable): a wallet's cumulative entitlement can never exceed
///             `maxPerWalletPerEpoch * epoch`, whatever the root says.
///           - `maxPerWallet` (immutable): lifetime ceiling per wallet.
///           - Fully funded before publishing: a root is refused unless this contract already holds
///             enough $TOURS to pay every entitlement it creates (no IOUs).
///           - `blocked`: the owner can stop a flagged (sybil) wallet from claiming.
///           - `pause`: owner or publisher can pause claims; only the owner unpauses.
///         The owner should be the EmpowerTours 2-of-3 Safe. The publisher can be an ops key.
///
///         Leaves are domain-separated (chain id + this contract), double-hashed (OpenZeppelin
///         StandardMerkleTree style), so a proof for one distributor or chain is useless elsewhere.
///         The token is fixed at construction and is any standard ERC-20 (intended: ToursTokenV2,
///         0x45b76a127167fD7FC7Ed264ad490144300eCfcBF on Monad mainnet).
contract ToursClaimDistributor is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public immutable maxEpochIncrease;
    uint256 public immutable maxPerWalletPerEpoch;
    uint256 public immutable maxPerWallet;
    uint64 public immutable minEpochInterval;

    address public publisher;
    bytes32 public merkleRoot;
    uint256 public epoch;
    uint256 public cumulativeTotal;   // sum of all entitlements in the current root
    uint256 public totalClaimed;
    uint64 public lastPublishedAt;
    mapping(address => uint256) public claimed;
    mapping(address => bool) public blocked;

    event PublisherSet(address indexed publisher);
    event EpochPublished(uint256 indexed epoch, bytes32 root, uint256 cumulativeTotal, uint256 increase, bytes32 snapshotHash);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount, uint256 cumulative);
    event BlockedSet(address indexed account, bool blocked);
    event SurplusWithdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error BadConfig();
    error NotPublisher();
    error TooSoon(uint64 nextAllowedAt);
    error TotalDecreased();
    error EpochIncreaseTooLarge(uint256 increase, uint256 max);
    error Underfunded(uint256 needed, uint256 available);
    error NoRoot();
    error Blocked();
    error InvalidProof();
    error WalletCapExceeded(uint256 cumulative, uint256 cap);
    error NothingToClaim();
    error ExceedsRootTotal();
    error ExceedsSurplus(uint256 amount, uint256 surplus);

    constructor(
        address owner_,
        address publisher_,
        IERC20 token_,
        uint256 maxEpochIncrease_,
        uint256 maxPerWalletPerEpoch_,
        uint256 maxPerWallet_,
        uint64 minEpochInterval_
    ) Ownable(owner_) {
        if (publisher_ == address(0) || address(token_) == address(0)) revert ZeroAddress();
        if (address(token_).code.length == 0) revert BadConfig();
        if (maxEpochIncrease_ == 0 || maxPerWalletPerEpoch_ == 0 || maxPerWallet_ < maxPerWalletPerEpoch_) revert BadConfig();
        token = token_;
        maxEpochIncrease = maxEpochIncrease_;
        maxPerWalletPerEpoch = maxPerWalletPerEpoch_;
        maxPerWallet = maxPerWallet_;
        minEpochInterval = minEpochInterval_;
        publisher = publisher_;
        emit PublisherSet(publisher_);
    }

    // ------------------------------------------------------------ admin

    function setPublisher(address p) external onlyOwner {
        if (p == address(0)) revert ZeroAddress();
        publisher = p;
        emit PublisherSet(p);
    }

    function setBlocked(address account, bool isBlocked) external onlyOwner {
        blocked[account] = isBlocked;
        emit BlockedSet(account, isBlocked);
    }

    function pause() external {
        if (msg.sender != owner() && msg.sender != publisher) revert NotPublisher();
        _pause();
    }

    function unpause() external onlyOwner { _unpause(); }

    /// @notice Tokens not owed to anyone under the current root.
    function surplus() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        uint256 owed = cumulativeTotal - totalClaimed;
        return bal > owed ? bal - owed : 0;
    }

    /// @notice Return unallocated $TOURS (e.g. to the treasury Safe). Never touches what is owed.
    function withdrawSurplus(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 s = surplus();
        if (amount > s) revert ExceedsSurplus(amount, s);
        token.safeTransfer(to, amount);
        emit SurplusWithdrawn(to, amount);
    }

    // ------------------------------------------------------------ epochs

    /// @param root               Merkle root of (chainid, this, account, cumulativeAmount) leaves.
    /// @param newCumulativeTotal Sum of every leaf's cumulativeAmount.
    /// @param snapshotHash       keccak256 of the published snapshot JSON (audit trail).
    function publishEpoch(bytes32 root, uint256 newCumulativeTotal, bytes32 snapshotHash) external {
        if (msg.sender != publisher) revert NotPublisher();
        if (root == bytes32(0)) revert BadConfig();
        if (epoch > 0 && block.timestamp < uint256(lastPublishedAt) + minEpochInterval) {
            revert TooSoon(lastPublishedAt + minEpochInterval);
        }
        if (newCumulativeTotal < cumulativeTotal) revert TotalDecreased();
        uint256 increase = newCumulativeTotal - cumulativeTotal;
        if (increase > maxEpochIncrease) revert EpochIncreaseTooLarge(increase, maxEpochIncrease);
        uint256 available = token.balanceOf(address(this)) + totalClaimed;
        if (available < newCumulativeTotal) revert Underfunded(newCumulativeTotal, available);
        merkleRoot = root;
        cumulativeTotal = newCumulativeTotal;
        lastPublishedAt = uint64(block.timestamp);
        epoch += 1;
        emit EpochPublished(epoch, root, newCumulativeTotal, increase, snapshotHash);
    }

    // ------------------------------------------------------------ claims

    function leaf(address account, uint256 cumulativeAmount) public view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(block.chainid, address(this), account, cumulativeAmount))));
    }

    /// @notice Anyone may relay; the tokens always go to `account`.
    function claim(address account, uint256 cumulativeAmount, bytes32[] calldata proof)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 amount)
    {
        if (merkleRoot == bytes32(0)) revert NoRoot();
        if (blocked[account]) revert Blocked();
        uint256 cap = maxPerWalletPerEpoch * epoch;
        if (cap > maxPerWallet) cap = maxPerWallet;
        if (cumulativeAmount > cap) revert WalletCapExceeded(cumulativeAmount, cap);
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf(account, cumulativeAmount))) revert InvalidProof();
        uint256 already = claimed[account];
        if (cumulativeAmount <= already) revert NothingToClaim();
        amount = cumulativeAmount - already;
        claimed[account] = cumulativeAmount;
        totalClaimed += amount;
        if (totalClaimed > cumulativeTotal) revert ExceedsRootTotal();
        token.safeTransfer(account, amount);
        emit Claimed(epoch, account, amount, cumulativeAmount);
    }
}
