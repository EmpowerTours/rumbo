// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IVenues } from "./interfaces/IVenues.sol";
import { TourRewards } from "./TourRewards.sol";

/// @title  Tickets: fans buy show tickets into escrow; after the show the money splits automatically
/// @notice - `buy` while the show is Booked and before showtime (up to the show's ticket cap).
///         - `scan` (attester-signed door scan) marks a ticket used ONCE and counts as a check-in in
///           TourRewards: $TOURS plus the daily streak.
///         - `settle` (anyone) once the show is Played: gross -> EmpowerTours fee (snapshotted at the
///           first sale), venue share (show's venueTicketBps), artist gets the rest. Exact conservation:
///           fee + venue + artist == gross.
///         - If the show ends cancelled/no-show/expired, every ticket is refundable at the price paid,
///           pull (`refund`) or pushed in batches by anyone (`refundAll`).
///         Escrow always resolves because Venues guarantees every show reaches Played or a cancelled
///         state (the Expired path is permissionless).
contract Tickets is Ownable2Step, ReentrancyGuardTransient, EIP712 {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 1_000;
    uint32 public constant MAX_PER_BUY = 20;
    bytes32 public constant SCAN_TYPEHASH = keccak256("TicketScan(uint256 ticketId,address holder,uint64 at)");

    struct Ticket {
        uint64 showId;
        bool used;
        bool refunded;
        address holder;
        uint128 price;
    }

    struct Sales {
        uint128 gross;         // collected and not refunded
        uint32 sold;
        uint32 refundCursor;
        uint16 feeBps;         // snapshotted at first sale
        bool settled;
        uint128 toArtist;
        uint128 toVenue;
        uint128 fee;
    }

    IVenues public immutable venues;
    TourRewards public immutable rewards;
    address public treasury;
    uint16 public feeBps;
    uint128 public toursPerScan;
    mapping(address => bool) public isAttester;

    Ticket[] internal _tickets;
    mapping(uint256 => Sales) public sales;
    mapping(uint256 => uint256[]) internal _ticketsOfShow;
    mapping(address => uint256[]) internal _ticketsOf;
    uint256 public feesCollected;

    event TicketsBought(uint256 indexed showId, address indexed buyer, uint256 firstTicketId, uint32 qty, uint256 paid);
    event TicketScanned(uint256 indexed ticketId, uint256 indexed showId, address indexed holder, uint256 tours);
    event ShowSettled(uint256 indexed showId, uint256 gross, uint256 toArtist, uint256 toVenue, uint256 fee);
    event TicketRefunded(uint256 indexed ticketId, uint256 indexed showId, address holder, uint256 amount);
    event ConfigSet(address treasury, uint16 feeBps, uint128 toursPerScan);
    event AttesterSet(address indexed attester, bool allowed);

    error ZeroAddress();
    error BadConfig();
    error NotOnSale();
    error SoldOut();
    error BadQty();
    error PriceAboveMax(uint256 total, uint256 maxTotal);
    error AlreadyUsed();
    error Refunded();
    error BadScan();
    error BadAttestation();
    error NotPlayed();
    error AlreadySettled();
    error NotCancelled();
    error UnsupportedToken(uint256 expected, uint256 received);
    error Unknown();

    constructor(address owner_, IVenues venues_, TourRewards rewards_, address treasury_, uint16 feeBps_, uint128 toursPerScan_)
        Ownable(owner_)
        EIP712("EmpowerTours Tickets", "1")
    {
        if (address(venues_).code.length == 0 || address(rewards_).code.length == 0) revert BadConfig();
        venues = venues_;
        rewards = rewards_;
        _setConfig(treasury_, feeBps_, toursPerScan_);
    }

    function setConfig(address treasury_, uint16 feeBps_, uint128 toursPerScan_) external onlyOwner {
        _setConfig(treasury_, feeBps_, toursPerScan_);
    }

    function _setConfig(address treasury_, uint16 feeBps_, uint128 toursPerScan_) internal {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert BadConfig();
        treasury = treasury_;
        feeBps = feeBps_;
        toursPerScan = toursPerScan_;
        emit ConfigSet(treasury_, feeBps_, toursPerScan_);
    }

    function setAttester(address a, bool allowed) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        isAttester[a] = allowed;
        emit AttesterSet(a, allowed);
    }

    // ------------------------------------------------------------ fans

    function buy(uint256 showId, uint32 qty, uint256 maxTotal) external nonReentrant returns (uint256 firstId) {
        IVenues.ShowInfo memory s = venues.showInfo(showId);
        if (s.status != IVenues.ShowStatus.Booked || block.timestamp >= s.showTime || s.ticketPrice == 0) revert NotOnSale();
        if (qty == 0 || qty > MAX_PER_BUY) revert BadQty();
        Sales storage sa = sales[showId];
        if (uint256(sa.sold) + qty > s.maxTickets) revert SoldOut();
        uint256 total = uint256(s.ticketPrice) * qty;
        if (total > maxTotal) revert PriceAboveMax(total, maxTotal);
        uint256 b0 = IERC20(s.asset).balanceOf(address(this));
        IERC20(s.asset).safeTransferFrom(msg.sender, address(this), total);
        uint256 got = IERC20(s.asset).balanceOf(address(this)) - b0;
        if (got != total) revert UnsupportedToken(total, got);
        if (sa.sold == 0) sa.feeBps = feeBps;
        sa.sold += qty;
        sa.gross += SafeCast.toUint128(total);
        firstId = _tickets.length;
        for (uint256 i; i < qty; ++i) {
            uint256 id = _tickets.length;
            _tickets.push(Ticket({ showId: uint64(showId), used: false, refunded: false, holder: msg.sender, price: s.ticketPrice }));
            _ticketsOfShow[showId].push(id);
            _ticketsOf[msg.sender].push(id);
        }
        emit TicketsBought(showId, msg.sender, firstId, qty, total);
    }

    /// @notice Door scan, attested. One use per ticket; counts as a check-in (streak + $TOURS).
    function scan(uint256 ticketId, uint64 at, bytes calldata sig) external nonReentrant returns (uint256 toursMinted) {
        Ticket storage t = _ticket(ticketId);
        if (t.used) revert AlreadyUsed();
        if (t.refunded) revert Refunded();
        IVenues.ShowInfo memory s = venues.showInfo(t.showId);
        if (s.status != IVenues.ShowStatus.Booked && s.status != IVenues.ShowStatus.Played) revert BadScan();
        if (at + 6 hours < s.showTime || at > s.showTime + 1 days || at > block.timestamp) revert BadScan();
        bytes32 d = _hashTypedDataV4(keccak256(abi.encode(SCAN_TYPEHASH, ticketId, t.holder, at)));
        if (!isAttester[ECDSA.recover(d, sig)]) revert BadAttestation();
        t.used = true;
        toursMinted = rewards.sourceCheckIn(t.holder, at, toursPerScan);
        emit TicketScanned(ticketId, t.showId, t.holder, toursMinted);
    }

    /// @notice After the show is Played: split the escrow (anyone can call).
    function settle(uint256 showId) external nonReentrant {
        IVenues.ShowInfo memory s = venues.showInfo(showId);
        if (s.status != IVenues.ShowStatus.Played) revert NotPlayed();
        Sales storage sa = sales[showId];
        if (sa.settled) revert AlreadySettled();
        sa.settled = true;
        (uint256 fee, uint256 toVenue, uint256 toArtist) = splitOf(sa.gross, sa.feeBps, s.venueTicketBps);
        sa.fee = uint128(fee);
        sa.toVenue = uint128(toVenue);
        sa.toArtist = uint128(toArtist);
        feesCollected += fee;
        IERC20 a = IERC20(s.asset);
        if (fee != 0) a.safeTransfer(treasury, fee);
        if (toVenue != 0) a.safeTransfer(s.venueOwner, toVenue);
        if (toArtist != 0) a.safeTransfer(s.artist, toArtist);
        emit ShowSettled(showId, sa.gross, toArtist, toVenue, fee);
    }

    /// @notice The split rule, exposed for UIs/tests: fee first, then the venue's share of the rest.
    function splitOf(uint256 gross, uint16 fBps, uint16 venueBps) public pure returns (uint256 fee, uint256 toVenue, uint256 toArtist) {
        fee = gross * fBps / 10_000;
        toVenue = (gross - fee) * venueBps / 10_000;
        toArtist = gross - fee - toVenue;
    }

    function refund(uint256 ticketId) external nonReentrant {
        Ticket storage t = _ticket(ticketId);
        if (!_cancelled(t.showId)) revert NotCancelled();
        if (t.refunded) revert Refunded();
        _refund(ticketId, t);
    }

    /// @notice Push refunds for a cancelled show, `max` tickets at a time (anyone can call).
    function refundAll(uint256 showId, uint256 max) external nonReentrant returns (uint256 done) {
        if (!_cancelled(showId)) revert NotCancelled();
        uint256[] storage ids = _ticketsOfShow[showId];
        Sales storage sa = sales[showId];
        uint256 i = sa.refundCursor;
        for (; i < ids.length && done < max; ++i) {
            Ticket storage t = _tickets[ids[i]];
            if (!t.refunded) {
                _refund(ids[i], t);
                ++done;
            }
        }
        sa.refundCursor = uint32(i);
    }

    function _refund(uint256 ticketId, Ticket storage t) internal {
        t.refunded = true;
        sales[t.showId].gross -= t.price;
        IERC20(venues.showInfo(t.showId).asset).safeTransfer(t.holder, t.price);
        emit TicketRefunded(ticketId, t.showId, t.holder, t.price);
    }

    function _cancelled(uint256 showId) internal view returns (bool) {
        return uint8(venues.showInfo(showId).status) >= uint8(IVenues.ShowStatus.VenueCancelled);
    }

    function _ticket(uint256 id) internal view returns (Ticket storage) {
        if (id >= _tickets.length) revert Unknown();
        return _tickets[id];
    }

    // ------------------------------------------------------------ views
    function getTicket(uint256 id) external view returns (Ticket memory) { return _ticket(id); }
    function ticketCount() external view returns (uint256) { return _tickets.length; }
    function ticketsOfShow(uint256 showId) external view returns (uint256[] memory) { return _ticketsOfShow[showId]; }
    function ticketsOf(address holder) external view returns (uint256[] memory) { return _ticketsOf[holder]; }
    function domainSeparator() external view returns (bytes32) { return _domainSeparatorV4(); }
}
