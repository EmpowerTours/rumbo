// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { ITripVault, ITripVaultFactory } from "./interfaces/ITripVault.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ToursToken } from "./ToursToken.sol";

/// @title  TourRewards: proof-of-visit campaigns, daily streaks, artist-backing points
/// @notice Sponsors (guides, hosts, artists, Hunt cache sponsors) fund a campaign for one place: a
///         per-visit reward in an ERC20 (USDC, or WMON for "MON" campaigns), a budget, and a daily cap.
///         A platform fee (`sponsorFeeBps`) of each funding goes to the EmpowerTours treasury: that is
///         what being a "daily stop" costs.
///
///         A visit is proved by an EIP-712 signature from an allowlisted attester (stand-in for Hunt's
///         server-side GPS check). Anyone may relay the claim. The reward goes STRAIGHT into the user's
///         chosen TripVault (must be a factory vault the user owns, in the reward asset), or to the
///         user's wallet if they named no vault / the vault no longer accepts deposits.
///
///         Double-claim protection: each signed visitId is single-use AND each user can claim each
///         campaign at most once per UTC day. Visits may be claimed up to `maxClaimDelay` after they
///         happened (offline check-ins sync later), never in the future.
///
///         $TOURS (this contract is its only minter): `toursPerVisit` (capped by the owner, since the
///         protocol, not the sponsor, issues points) plus a streak bonus on the first visit of each
///         consecutive day: `streakBonus * min(streak - 1, maxBonusDays)`.
///         Backers of an ArtistTour vault earn `backingRate` $TOURS per unit of asset, unlocked in
///         proportion to how much of the tour money has actually been spent on the tour (so deposit-
///         and-cancel farming earns nothing).
contract TourRewards is Ownable2Step, ReentrancyGuardTransient, EIP712 {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_SPONSOR_FEE_BPS = 2_000;
    bytes32 public constant VISIT_TYPEHASH =
        keccak256("Visit(address user,uint256 campaignId,address vault,uint64 visitedAt,bytes32 visitId)");

    bytes32 public constant BATCH_TYPEHASH =
        keccak256("VisitBatch(address user,address vault,uint256[] campaignIds,uint64[] visitedAts,bytes32 batchId)");
    uint256 public constant MAX_BATCH = 64;

    enum StopKind { HuntCache, GuideSpot, ArtistMural, ArtistShow }

    struct Campaign {
        address sponsor;
        address rewardToken;
        uint128 rewardPerVisit;
        uint128 toursPerVisit;
        uint128 budget;           // remaining, net of platform fee
        uint32 dailyCap;          // max claims per UTC day across all users
        uint32 totalVisits;
        StopKind kind;
        bool active;
        bytes32 locationId;       // e.g. keccak of a geohash / Hunt cache id
        string name;
    }

    struct Visit {
        address user;
        uint256 campaignId;
        address vault;
        uint64 visitedAt;
        bytes32 visitId;
    }

    struct VisitBatch {
        address user;
        address vault;
        uint256[] campaignIds;
        uint64[] visitedAts;
        bytes32 batchId;
    }

    struct Streak {
        uint32 lastDay;
        uint32 current;
        uint32 best;
        uint32 daysVisited;
    }

    ITripVaultFactory public immutable factory;
    ToursToken public immutable tours;
    address public treasury;
    uint16 public sponsorFeeBps;
    uint64 public maxClaimDelay;
    uint128 public maxToursPerVisit;
    uint128 public streakBonus;
    uint32 public maxBonusDays;
    mapping(address => bool) public isAttester;
    mapping(address => bool) public rewardTokenAllowed;
    mapping(address asset => uint256) public backingRate;      // $TOURS wei per asset base unit

    Campaign[] internal _campaigns;
    mapping(uint256 => mapping(uint256 => uint32)) public visitsOnDay;           // campaign => day => count
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) internal _claimedBits; // user => campaign => day/256 => bits
    mapping(address => bool) public isCheckInSource;
    mapping(bytes32 => bool) public visitUsed;
    mapping(address => Streak) public streakOf;
    mapping(address => mapping(address => uint256)) public backingClaimed;  // vault => backer => $TOURS
    mapping(address => uint256) public feesCollected;                       // token => total

    event CampaignCreated(uint256 indexed id, address indexed sponsor, StopKind kind, string name, uint256 budget, uint256 fee);
    event CampaignFunded(uint256 indexed id, uint256 amount, uint256 fee);
    event CampaignClosed(uint256 indexed id, uint256 refunded);
    event VisitRewarded(
        uint256 indexed campaignId, address indexed user, address indexed vault, uint256 reward, uint256 tours,
        uint32 streak, bytes32 visitId
    );
    event AttesterSet(address indexed attester, bool allowed);
    event RewardTokenSet(address indexed token, bool allowed, uint256 backingRate);
    event BatchClaimed(bytes32 indexed batchId, address indexed user, uint256 visits, uint256 reward, uint256 tours);
    event SourceCheckIn(address indexed source, address indexed user, uint64 at, uint256 tours, uint32 streak);
    event CheckInSourceSet(address indexed source, bool allowed);
    event BackingRewarded(address indexed vault, address indexed backer, uint256 tours);
    event ConfigSet(address treasury, uint16 sponsorFeeBps, uint64 maxClaimDelay, uint128 maxToursPerVisit, uint128 streakBonus, uint32 maxBonusDays);

    error ZeroAddress();
    error BadConfig();
    error NotSponsor();
    error Inactive();
    error BadAttestation();
    error VisitReused(bytes32 visitId);
    error AlreadyClaimedToday(uint256 day);
    error DailyCapReached(uint256 day);
    error FutureVisit();
    error StaleVisit();
    error BudgetExhausted();
    error BadVault();
    error TokenNotAllowed();
    error UnsupportedToken(uint256 expected, uint256 received);
    error NothingToClaim();
    error UnknownCampaign();
    error BadBatch();
    error NotSource();

    constructor(address owner_, ITripVaultFactory factory_, ToursToken tours_, address treasury_) Ownable(owner_) EIP712("EmpowerTours Rewards", "1") {
        if (address(factory_).code.length == 0 || address(tours_).code.length == 0) revert BadConfig();
        factory = factory_;
        tours = tours_;
        _setConfig(treasury_, 1_000, 14 days, 50e18, 5e18, 10);
    }

    // ------------------------------------------------------------ admin

    function setConfig(address treasury_, uint16 feeBps, uint64 claimDelay, uint128 maxTours, uint128 bonus, uint32 bonusDays)
        external
        onlyOwner
    {
        _setConfig(treasury_, feeBps, claimDelay, maxTours, bonus, bonusDays);
    }

    function _setConfig(address treasury_, uint16 feeBps, uint64 claimDelay, uint128 maxTours, uint128 bonus, uint32 bonusDays) internal {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps > MAX_SPONSOR_FEE_BPS || claimDelay == 0 || claimDelay > 30 days || bonusDays > 365) revert BadConfig();
        treasury = treasury_;
        sponsorFeeBps = feeBps;
        maxClaimDelay = claimDelay;
        maxToursPerVisit = maxTours;
        streakBonus = bonus;
        maxBonusDays = bonusDays;
        emit ConfigSet(treasury_, feeBps, claimDelay, maxTours, bonus, bonusDays);
    }

    function setAttester(address a, bool allowed) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        isAttester[a] = allowed;
        emit AttesterSet(a, allowed);
    }

    function setCheckInSource(address src, bool allowed) external onlyOwner {
        if (src == address(0)) revert ZeroAddress();
        isCheckInSource[src] = allowed;
        emit CheckInSourceSet(src, allowed);
    }

    function setRewardToken(address t, bool allowed, uint256 backingRate_) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        rewardTokenAllowed[t] = allowed;
        backingRate[t] = backingRate_;
        emit RewardTokenSet(t, allowed, backingRate_);
    }

    // ------------------------------------------------------------ sponsors

    function createCampaign(
        address rewardToken,
        uint128 rewardPerVisit,
        uint128 toursPerVisit,
        uint32 dailyCap,
        StopKind kind,
        bytes32 locationId,
        string calldata name,
        uint256 budget
    ) external nonReentrant returns (uint256 id) {
        if (!rewardTokenAllowed[rewardToken]) revert TokenNotAllowed();
        if (dailyCap == 0 || toursPerVisit > maxToursPerVisit || (rewardPerVisit == 0 && toursPerVisit == 0)) revert BadConfig();
        (uint256 net, uint256 fee) = _fund(rewardToken, budget);
        id = _campaigns.length;
        _campaigns.push(Campaign({
            sponsor: msg.sender, rewardToken: rewardToken, rewardPerVisit: rewardPerVisit, toursPerVisit: toursPerVisit,
            budget: SafeCast.toUint128(net), dailyCap: dailyCap, totalVisits: 0, kind: kind, active: true, locationId: locationId, name: name
        }));
        emit CampaignCreated(id, msg.sender, kind, name, net, fee);
    }

    function fundCampaign(uint256 id, uint256 amount) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (!c.active) revert Inactive();
        (uint256 net, uint256 fee) = _fund(c.rewardToken, amount);
        c.budget += SafeCast.toUint128(net);
        emit CampaignFunded(id, net, fee);
    }

    function closeCampaign(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (msg.sender != c.sponsor) revert NotSponsor();
        if (!c.active) revert Inactive();
        c.active = false;
        uint256 left = c.budget;
        c.budget = 0;
        if (left != 0) IERC20(c.rewardToken).safeTransfer(c.sponsor, left);
        emit CampaignClosed(id, left);
    }

    function _fund(address token, uint256 amount) internal returns (uint256 net, uint256 fee) {
        if (amount == 0) return (0, 0);
        uint256 b0 = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = IERC20(token).balanceOf(address(this)) - b0;
        if (got != amount) revert UnsupportedToken(amount, got);
        fee = amount * sponsorFeeBps / 10_000;
        net = amount - fee;
        if (net > type(uint128).max) revert BadConfig();
        if (fee != 0) {
            feesCollected[token] += fee;
            IERC20(token).safeTransfer(treasury, fee);
        }
    }

    // ------------------------------------------------------------ visits

    function visitDigest(Visit calldata v) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VISIT_TYPEHASH, v.user, v.campaignId, v.vault, v.visitedAt, v.visitId)));
    }

    function batchDigest(VisitBatch calldata b) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            BATCH_TYPEHASH, b.user, b.vault, keccak256(abi.encodePacked(b.campaignIds)), keccak256(abi.encodePacked(b.visitedAts)), b.batchId
        )));
    }

    /// @notice Whether `user` already claimed `campaignId` on UTC `day` (bitmap: one slot per 256 days).
    function claimedDay(address user, uint256 campaignId, uint256 day) public view returns (bool) {
        return _claimedBits[user][campaignId][day >> 8] & (uint256(1) << (day & 255)) != 0;
    }

    /// @notice One attested visit per transaction (kept for single check-ins and for gas comparison).
    function claim(Visit calldata v, bytes calldata sig) external nonReentrant returns (uint256 reward, uint256 toursOut) {
        if (!isAttester[ECDSA.recover(visitDigest(v), sig)]) revert BadAttestation();
        if (visitUsed[v.visitId]) revert VisitReused(v.visitId);
        visitUsed[v.visitId] = true;
        Campaign storage c;
        uint256 day;
        (c, day, reward) = _consumeVisit(v.user, v.campaignId, v.visitedAt);
        Streak memory s = streakOf[v.user];
        uint256 bonus = _advanceStreak(s, day);
        streakOf[v.user] = s;
        _payout(c.rewardToken, v.user, v.vault, reward);
        toursOut = uint256(c.toursPerVisit) + bonus;
        if (toursOut != 0) tours.mint(v.user, toursOut);
        emit VisitRewarded(v.campaignId, v.user, v.vault, reward, toursOut, s.current, v.visitId);
    }

    /// @notice Batched check-ins: ONE attester signature covers a list of visits by one user (a day's
    ///         stops, or a multi-day catch-up). Visits must be in non-decreasing time order and share
    ///         one reward token. Streak is advanced per visit in memory and written once; the reward is
    ///         deposited into the vault once and $TOURS minted once. Same per-visit rules as `claim`
    ///         (one claim per user/campaign/day, daily cap, budget, 14-day window), and the batch id is
    ///         single-use, so a batch can never be replayed or mixed with single claims for a double pay.
    function claimBatch(VisitBatch calldata b, bytes calldata sig) external nonReentrant returns (uint256 reward, uint256 toursOut) {
        uint256 n = b.campaignIds.length;
        if (n == 0 || n > MAX_BATCH || n != b.visitedAts.length) revert BadBatch();
        if (!isAttester[ECDSA.recover(batchDigest(b), sig)]) revert BadAttestation();
        if (visitUsed[b.batchId]) revert VisitReused(b.batchId);
        visitUsed[b.batchId] = true;
        Streak memory s = streakOf[b.user];
        address token;
        uint64 prevAt;
        for (uint256 i; i < n; ++i) {
            uint64 at = b.visitedAts[i];
            if (at < prevAt) revert BadBatch();
            prevAt = at;
            (Campaign storage c, uint256 day, uint256 r) = _consumeVisit(b.user, b.campaignIds[i], at);
            if (i == 0) token = c.rewardToken;
            else if (c.rewardToken != token) revert BadBatch();
            uint256 t = uint256(c.toursPerVisit) + _advanceStreak(s, day);
            reward += r;
            toursOut += t;
            emit VisitRewarded(b.campaignIds[i], b.user, b.vault, r, t, s.current, keccak256(abi.encode(b.batchId, i)));
        }
        streakOf[b.user] = s;
        _payout(token, b.user, b.vault, reward);
        if (toursOut != 0) tours.mint(b.user, toursOut);
        emit BatchClaimed(b.batchId, b.user, n, reward, toursOut);
    }

    /// @notice Check-ins proved by another EmpowerTours contract (e.g. a scanned show ticket). Keeps the
    ///         streak alive and mints `toursAmount` (+ streak bonus). Only allowlisted sources.
    function sourceCheckIn(address user, uint64 at, uint256 toursAmount) external nonReentrant returns (uint256 minted) {
        if (!isCheckInSource[msg.sender]) revert NotSource();
        if (at > block.timestamp) revert FutureVisit();
        if (uint256(at) + maxClaimDelay < block.timestamp) revert StaleVisit();
        if (toursAmount > maxToursPerVisit) revert BadConfig();
        Streak memory s = streakOf[user];
        minted = toursAmount + _advanceStreak(s, at / 1 days);
        streakOf[user] = s;
        if (minted != 0) tours.mint(user, minted);
        emit SourceCheckIn(msg.sender, user, at, minted, s.current);
    }

    function _consumeVisit(address user, uint256 campaignId, uint64 visitedAt)
        internal
        returns (Campaign storage c, uint256 day, uint256 reward)
    {
        if (visitedAt > block.timestamp) revert FutureVisit();
        if (uint256(visitedAt) + maxClaimDelay < block.timestamp) revert StaleVisit();
        c = _campaign(campaignId);
        if (!c.active) revert Inactive();
        day = visitedAt / 1 days;
        mapping(uint256 => uint256) storage bits = _claimedBits[user][campaignId];
        uint256 word = bits[day >> 8];
        uint256 mask = uint256(1) << (day & 255);
        if (word & mask != 0) revert AlreadyClaimedToday(day);
        uint32 onDay = visitsOnDay[campaignId][day];
        if (onDay >= c.dailyCap) revert DailyCapReached(day);
        reward = c.rewardPerVisit;
        if (reward > c.budget) revert BudgetExhausted();
        bits[day >> 8] = word | mask;
        visitsOnDay[campaignId][day] = onDay + 1;
        c.totalVisits += 1;
        c.budget -= uint128(reward);
    }

    /// @dev user-level streak across all stops; older (out-of-order) days don't affect it.
    ///      Returns the streak bonus earned by this visit (first visit of a consecutive day only).
    function _advanceStreak(Streak memory s, uint256 day) internal view returns (uint256 bonus) {
        if (s.current == 0 || day > uint256(s.lastDay) + 1) {
            s.current = 1;
            s.lastDay = uint32(day);
            s.daysVisited += 1;
        } else if (day == uint256(s.lastDay) + 1) {
            s.current += 1;
            s.lastDay = uint32(day);
            s.daysVisited += 1;
            bonus = uint256(streakBonus) * Math.min(s.current - 1, maxBonusDays);
        }
        if (s.current > s.best) s.best = s.current;
    }

    /// @dev money -> the user's own trip vault (or wallet if none / vault closed)
    function _payout(address token, address user, address vault, uint256 reward) internal {
        if (reward == 0) return;
        IERC20 t = IERC20(token);
        if (vault != address(0)) {
            if (!factory.isVault(vault) || ITripVault(vault).owner() != user || ITripVault(vault).asset() != token) {
                revert BadVault();
            }
            if (!ITripVault(vault).acceptsDeposits(user)) vault = address(0);
        }
        if (vault != address(0)) {
            t.forceApprove(vault, reward);
            ITripVault(vault).deposit(reward, user);
        } else {
            t.safeTransfer(user, reward);
        }
    }

    // ------------------------------------------------------------ artist backing

    /// @notice $TOURS a backer has unlocked so far on an ArtistTour vault (not yet claimed).
    function backingClaimable(address vault, address backer) public view returns (uint256) {
        if (!factory.isVault(vault)) return 0;
        ITripVault v = ITripVault(vault);
        if (v.kind() != ITripVault.Kind.ArtistTour || v.cancelled() || backer == v.owner()) return 0;
        uint256 tp = v.totalPrincipal();
        if (tp == 0) return 0;
        uint256 spentShare = Math.min(v.totalSpent(), tp);
        uint256 entitled = Math.mulDiv(v.principalOf(backer) * backingRate[v.asset()], spentShare, tp);
        uint256 done = backingClaimed[vault][backer];
        return entitled > done ? entitled - done : 0;
    }

    function claimBacking(address vault) external nonReentrant returns (uint256 amt) {
        amt = backingClaimable(vault, msg.sender);
        if (amt == 0) revert NothingToClaim();
        backingClaimed[vault][msg.sender] += amt;
        tours.mint(msg.sender, amt);
        emit BackingRewarded(vault, msg.sender, amt);
    }

    // ------------------------------------------------------------ views

    function _campaign(uint256 id) internal view returns (Campaign storage) {
        if (id >= _campaigns.length) revert UnknownCampaign();
        return _campaigns[id];
    }

    function getCampaign(uint256 id) external view returns (Campaign memory) { return _campaign(id); }
    function campaignCount() external view returns (uint256) { return _campaigns.length; }
    function domainSeparator() external view returns (bytes32) { return _domainSeparatorV4(); }
}
