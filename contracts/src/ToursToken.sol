// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title  $TOURS: EmpowerTours loyalty points (PROTOTYPE, Solonet only)
/// @notice $TOURS is earned by doing things (proved visits, daily streaks, backing artists' tours) and
///         spent on partner perks (discounts, better spots, backstage access). It is a loyalty/utility
///         point, not an investment: there is no sale, no treasury backing, no revenue share.
///
///         - Minting is restricted to ONE minter: the TourRewards contract. The minter itself is on a
///           leash: at most `mintCapPerDay` can be minted per UTC day, so a bug or compromised attester
///           key cannot print unlimited points.
///         - Transferability is a deployment choice (`transferable`):
///             false (default, "points mode"): wallet-to-wallet transfers revert. Tokens can only be
///                   minted, burned, or moved to/from allowlisted protocol contracts (e.g. PerkMarket).
///                   Safer legally: nothing to trade, so nothing to speculate on.
///             true  ("token mode"): a normal ERC20. Closer to the long-term vision (gift points to a
///                   friend, use them in other apps), but a tradeable token draws regulatory scrutiny.
///           The owner can switch points -> token mode ONCE (`enableTransfers`); it can never be turned
///           back off, so holders are never trapped by a later restriction.
contract ToursToken is ERC20, ERC20Burnable, Ownable2Step {
    address public minter;
    bool public transferable;
    uint256 public mintCapPerDay;
    mapping(uint256 day => uint256) public mintedOnDay;
    mapping(address => bool) public transferAllowlist;

    event MinterSet(address indexed minter);
    event MintCapSet(uint256 capPerDay);
    event TransfersEnabled();
    event TransferAllowlistSet(address indexed account, bool allowed);

    error NotMinter();
    error NonTransferable();
    error MintCapExceeded(uint256 day, uint256 minted, uint256 cap);
    error ZeroAddress();
    error AlreadyTransferable();

    constructor(address owner_, bool transferable_, uint256 mintCapPerDay_)
        ERC20("EmpowerTours Points", "TOURS")
        Ownable(owner_)
    {
        transferable = transferable_;
        mintCapPerDay = mintCapPerDay_;
        emit MintCapSet(mintCapPerDay_);
        if (transferable_) emit TransfersEnabled();
    }

    // ------------------------------------------------------------ admin

    function setMinter(address m) external onlyOwner {
        if (m == address(0)) revert ZeroAddress();
        minter = m;
        emit MinterSet(m);
    }

    function setMintCapPerDay(uint256 cap) external onlyOwner {
        mintCapPerDay = cap;
        emit MintCapSet(cap);
    }

    /// @notice One-way switch from points mode to token mode.
    function enableTransfers() external onlyOwner {
        if (transferable) revert AlreadyTransferable();
        transferable = true;
        emit TransfersEnabled();
    }

    function setTransferAllowlist(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        transferAllowlist[account] = allowed;
        emit TransferAllowlistSet(account, allowed);
    }

    // ------------------------------------------------------------ minting

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        uint256 day = block.timestamp / 1 days;
        uint256 minted = mintedOnDay[day] + amount;
        if (minted > mintCapPerDay) revert MintCapExceeded(day, minted, mintCapPerDay);
        mintedOnDay[day] = minted;
        _mint(to, amount);
    }

    /// @notice How much can still be minted today.
    function mintableToday() external view returns (uint256) {
        uint256 m = mintedOnDay[block.timestamp / 1 days];
        return m >= mintCapPerDay ? 0 : mintCapPerDay - m;
    }

    // ------------------------------------------------------------ transfer policy

    function _update(address from, address to, uint256 value) internal override {
        if (!transferable && from != address(0) && to != address(0)) {
            if (!transferAllowlist[from] && !transferAllowlist[to]) revert NonTransferable();
        }
        super._update(from, to, value);
    }
}
