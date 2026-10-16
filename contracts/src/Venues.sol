// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { ITripVault, ITripVaultFactory } from "./interfaces/ITripVault.sol";
import { IVenues } from "./interfaces/IVenues.sol";

/// @title  Venues: the third partner type. Venues list terms and open dates; artists book shows
///         from their tour fund; the deposit waits in escrow until the show happens.
/// @notice Terms (snapshotted per show when it is booked):
///           deposit         paid by the artist into escrow at booking
///           venueTicketBps  venue's share of ticket revenue after the EmpowerTours ticket fee
///                           (3000 = a "70/30" split; 0 = "flat fee" deal where the deposit IS the fee)
///           cancelFee       kept by the venue if the artist cancels or no-shows (<= deposit)
///         Every Booked show ends in exactly one terminal state, and some path is always open:
///           Played          <- attester signs the venue's QR check-in (outcome 1) at/after showtime:
///                              deposit - platform fee -> venue; showsHeld++
///           VenueCancelled  <- venue cancels any time before it is played: 100% back to the artist;
///                              venue cancellations++
///           ArtistCancelled <- artist cancels before showtime: cancelFee -> venue, rest -> artist
///           ArtistNoShow    <- attester signs "artist did not show" (outcome 2) after showtime:
///                              cancelFee -> venue, rest -> artist
///           Expired         <- nobody attested within `resolveTimeout` after showtime: ANYONE can
///                              trigger a 100% refund (counted against the venue's record)
///         When the payer is a TripVault the vault is told how much came back (try/catch + gas guard,
///         plus `TripVault.syncShow` as a backstop), so its leash allowance is restored.
contract Venues is IVenues, Ownable2Step, ReentrancyGuardTransient, EIP712 {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 500;
    uint256 public constant CALLBACK_GAS = 250_000;
    uint64 public constant MAX_ADVANCE = 400 days;
    bytes32 public constant SHOW_TYPEHASH = keccak256("ShowAttestation(uint256 showId,uint8 outcome,uint64 at)");

    struct Venue {
        address owner;
        address asset;
        uint32 capacity;
        uint16 venueTicketBps;
        bool active;
        uint128 deposit;
        uint128 cancelFee;
        uint32 showsHeld;
        uint32 cancellations;   // venue cancels + expired (unattested) shows
        uint32 artistNoShows;   // artist cancels/no-shows at this venue (for context; not the venue's fault)
        string name;
        string city;
        string place;
    }

    struct Show {
        uint64 venueId;
        uint64 showTime;
        uint32 maxTickets;
        uint16 venueTicketBps;
        uint16 feeBps;
        ShowStatus status;
        address payer;          // tour fund vault or artist EOA
        address artist;         // payout wallet
        address venueOwner;
        address asset;
        uint128 deposit;
        uint128 cancelFee;
        uint128 ticketPrice;
        uint128 refunded;
        uint64 resolveTimeout;
        string title;
    }

    ITripVaultFactory public immutable factory;
    address public treasury;
    uint16 public feeBps;
    uint64 public resolveTimeout;
    mapping(address => bool) public isAttester;
    mapping(address => bool) public assetAllowed;
    mapping(address => uint32) public artistNoShowCount;

    Venue[] internal _venues;
    Show[] internal _shows;
    mapping(uint256 => mapping(uint32 => bool)) public openOn;          // venueId => UTC day => open
    mapping(uint256 => mapping(uint32 => uint256)) public bookedOn;     // venueId => day => showId + 1
    mapping(address => uint256[]) internal _venuesOf;
    mapping(uint256 => uint256[]) internal _showsAtVenue;
    mapping(address => uint256[]) internal _showsOfPayer;
    uint256 public feesCollected;

    event VenueListed(uint256 indexed venueId, address indexed owner, string name, string city);
    event TermsSet(uint256 indexed venueId, uint32 capacity, uint16 venueTicketBps, uint128 deposit, uint128 cancelFee, bool active);
    event OpenDatesSet(uint256 indexed venueId, uint32[] days_, bool open);
    event ShowBooked(uint256 indexed showId, uint256 indexed venueId, address indexed payer, uint64 showTime, uint256 deposit);
    event ShowPlayed(uint256 indexed showId, uint256 venueAmount, uint256 fee);
    event ShowCancelled(uint256 indexed showId, ShowStatus status, uint256 toArtist, uint256 toVenue);
    event VaultCallbackFailed(uint256 indexed showId);
    event ConfigSet(address treasury, uint16 feeBps, uint64 resolveTimeout);
    event AttesterSet(address indexed attester, bool allowed);
    event AssetSet(address indexed asset, bool allowed);

    error ZeroAddress();
    error BadConfig();
    error NotVenueOwner();
    error NotPayer();
    error Inactive();
    error NotOpen(uint32 day);
    error AlreadyBooked(uint32 day);
    error BadShowTime();
    error TooManyTickets();
    error DepositAboveMax(uint256 deposit, uint256 maxDeposit);
    error NotBooked();
    error TooEarly();
    error TooLate();
    error BadAttestation();
    error UnsupportedToken(uint256 expected, uint256 received);
    error InsufficientGas();
    error Unknown();

    constructor(address owner_, ITripVaultFactory factory_, address treasury_, uint16 feeBps_, uint64 resolveTimeout_)
        Ownable(owner_)
        EIP712("EmpowerTours Venues", "1")
    {
        if (address(factory_).code.length == 0) revert BadConfig();
        factory = factory_;
        _setConfig(treasury_, feeBps_, resolveTimeout_);
    }

    // ------------------------------------------------------------ admin

    function setConfig(address treasury_, uint16 feeBps_, uint64 resolveTimeout_) external onlyOwner {
        _setConfig(treasury_, feeBps_, resolveTimeout_);
    }

    function _setConfig(address treasury_, uint16 feeBps_, uint64 resolveTimeout_) internal {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS || resolveTimeout_ < 1 hours || resolveTimeout_ > 30 days) revert BadConfig();
        treasury = treasury_;
        feeBps = feeBps_;
        resolveTimeout = resolveTimeout_;
        emit ConfigSet(treasury_, feeBps_, resolveTimeout_);
    }

    function setAttester(address a, bool allowed) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        isAttester[a] = allowed;
        emit AttesterSet(a, allowed);
    }

    function setAsset(address a, bool allowed) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        assetAllowed[a] = allowed;
        emit AssetSet(a, allowed);
    }

    // ------------------------------------------------------------ venues

    function listVenue(
        address asset,
        uint32 capacity,
        uint16 venueTicketBps,
        uint128 deposit,
        uint128 cancelFee,
        string calldata name,
        string calldata city,
        string calldata place
    ) external returns (uint256 id) {
        if (!assetAllowed[asset]) revert BadConfig();
        _checkTerms(capacity, venueTicketBps, deposit, cancelFee);
        id = _venues.length;
        _venues.push(Venue({
            owner: msg.sender, asset: asset, capacity: capacity, venueTicketBps: venueTicketBps, active: true, deposit: deposit,
            cancelFee: cancelFee, showsHeld: 0, cancellations: 0, artistNoShows: 0, name: name, city: city, place: place
        }));
        _venuesOf[msg.sender].push(id);
        emit VenueListed(id, msg.sender, name, city);
        emit TermsSet(id, capacity, venueTicketBps, deposit, cancelFee, true);
    }

    /// @notice Change terms for FUTURE bookings (booked shows keep their snapshot).
    function setTerms(uint256 id, uint32 capacity, uint16 venueTicketBps, uint128 deposit, uint128 cancelFee, bool active) external {
        Venue storage v = _venue(id);
        if (msg.sender != v.owner) revert NotVenueOwner();
        _checkTerms(capacity, venueTicketBps, deposit, cancelFee);
        v.capacity = capacity;
        v.venueTicketBps = venueTicketBps;
        v.deposit = deposit;
        v.cancelFee = cancelFee;
        v.active = active;
        emit TermsSet(id, capacity, venueTicketBps, deposit, cancelFee, active);
    }

    function setOpenDates(uint256 id, uint32[] calldata days_, bool open) external {
        Venue storage v = _venue(id);
        if (msg.sender != v.owner) revert NotVenueOwner();
        for (uint256 i; i < days_.length; ++i) openOn[id][days_[i]] = open;
        emit OpenDatesSet(id, days_, open);
    }

    function _checkTerms(uint32 capacity, uint16 bps, uint128 deposit, uint128 cancelFee) internal pure {
        if (capacity == 0 || bps > 10_000 || cancelFee > deposit) revert BadConfig();
    }

    // ------------------------------------------------------------ artists

    function quote(uint256 venueId) public view override returns (address, address, uint256) {
        Venue storage v = _venue(venueId);
        if (!v.active) revert Inactive();
        return (v.owner, v.asset, v.deposit);
    }

    /// @notice Book a show on an open date; the deposit goes into escrow. `maxDeposit` guards against
    ///         the venue raising its deposit in-flight.
    function bookShow(uint256 venueId, uint64 showTime, uint128 ticketPrice, uint32 maxTickets, string calldata title, uint256 maxDeposit)
        external
        override
        nonReentrant
        returns (uint256 showId)
    {
        Venue storage v = _venue(venueId);
        if (!v.active) revert Inactive();
        if (showTime <= block.timestamp || showTime > block.timestamp + MAX_ADVANCE) revert BadShowTime();
        uint32 day = uint32(showTime / 1 days);
        if (!openOn[venueId][day]) revert NotOpen(day);
        if (bookedOn[venueId][day] != 0) revert AlreadyBooked(day);
        if (maxTickets > v.capacity) revert TooManyTickets();
        uint256 dep = v.deposit;
        if (dep > maxDeposit) revert DepositAboveMax(dep, maxDeposit);
        if (dep != 0) {
            uint256 b0 = IERC20(v.asset).balanceOf(address(this));
            IERC20(v.asset).safeTransferFrom(msg.sender, address(this), dep);
            uint256 got = IERC20(v.asset).balanceOf(address(this)) - b0;
            if (got != dep) revert UnsupportedToken(dep, got);
        }
        address artist = factory.isVault(msg.sender) ? ITripVault(msg.sender).owner() : msg.sender;
        showId = _shows.length;
        _shows.push(Show({
            venueId: uint64(venueId), showTime: showTime, maxTickets: maxTickets, venueTicketBps: v.venueTicketBps, feeBps: feeBps,
            status: ShowStatus.Booked, payer: msg.sender, artist: artist, venueOwner: v.owner, asset: v.asset, deposit: uint128(dep),
            cancelFee: v.cancelFee, ticketPrice: ticketPrice, refunded: 0, resolveTimeout: resolveTimeout, title: title
        }));
        bookedOn[venueId][day] = showId + 1;
        _showsAtVenue[venueId].push(showId);
        _showsOfPayer[msg.sender].push(showId);
        emit ShowBooked(showId, venueId, msg.sender, showTime, dep);
    }

    /// @notice Venue QR check-in (attested): the show happened -> deposit released to the venue.
    function confirmShow(uint256 showId, uint64 at, bytes calldata sig) external nonReentrant {
        Show storage s = _show(showId);
        if (s.status != ShowStatus.Booked) revert NotBooked();
        if (at + 1 hours < s.showTime || at > block.timestamp) revert TooEarly();
        _checkSig(showId, 1, at, sig);
        s.status = ShowStatus.Played;
        _venues[s.venueId].showsHeld += 1;
        uint256 fee = uint256(s.deposit) * s.feeBps / 10_000;
        uint256 toVenue = s.deposit - fee;
        feesCollected += fee;
        if (fee != 0) IERC20(s.asset).safeTransfer(treasury, fee);
        if (toVenue != 0) IERC20(s.asset).safeTransfer(s.venueOwner, toVenue);
        emit ShowPlayed(showId, toVenue, fee);
        _notify(showId, s.payer, 0);
    }

    function venueCancel(uint256 showId) external nonReentrant {
        Show storage s = _show(showId);
        if (msg.sender != s.venueOwner) revert NotVenueOwner();
        if (s.status != ShowStatus.Booked) revert NotBooked();
        _venues[s.venueId].cancellations += 1;
        _close(showId, s, ShowStatus.VenueCancelled, 0);
    }

    function artistCancel(uint256 showId) external override nonReentrant {
        Show storage s = _show(showId);
        if (msg.sender != s.payer) revert NotPayer();
        if (s.status != ShowStatus.Booked) revert NotBooked();
        if (block.timestamp >= s.showTime) revert TooLate();
        _venues[s.venueId].artistNoShows += 1;
        _close(showId, s, ShowStatus.ArtistCancelled, s.cancelFee);
    }

    /// @notice Attested artist no-show: the venue keeps the agreed cancellation fee.
    function claimArtistNoShow(uint256 showId, uint64 at, bytes calldata sig) external nonReentrant {
        Show storage s = _show(showId);
        if (s.status != ShowStatus.Booked) revert NotBooked();
        if (at < s.showTime || at > block.timestamp) revert TooEarly();
        _checkSig(showId, 2, at, sig);
        _venues[s.venueId].artistNoShows += 1;
        artistNoShowCount[s.artist] += 1;
        _close(showId, s, ShowStatus.ArtistNoShow, s.cancelFee);
    }

    /// @notice Nobody attested anything: after the timeout ANYONE can refund the artist in full.
    function expire(uint256 showId) external nonReentrant {
        Show storage s = _show(showId);
        if (s.status != ShowStatus.Booked) revert NotBooked();
        if (block.timestamp <= uint256(s.showTime) + s.resolveTimeout) revert TooEarly();
        _venues[s.venueId].cancellations += 1;
        _close(showId, s, ShowStatus.Expired, 0);
    }

    // ------------------------------------------------------------ internals

    function _close(uint256 showId, Show storage s, ShowStatus st, uint256 toVenue) internal {
        s.status = st;
        bookedOn[s.venueId][uint32(s.showTime / 1 days)] = 0; // date is free again
        uint256 toArtist = s.deposit - toVenue;
        s.refunded = uint128(toArtist);
        if (toVenue != 0) IERC20(s.asset).safeTransfer(s.venueOwner, toVenue);
        if (toArtist != 0) IERC20(s.asset).safeTransfer(s.payer, toArtist);
        emit ShowCancelled(showId, st, toArtist, toVenue);
        _notify(showId, s.payer, toArtist);
    }

    function _checkSig(uint256 showId, uint8 outcome, uint64 at, bytes calldata sig) internal view {
        bytes32 d = _hashTypedDataV4(keccak256(abi.encode(SHOW_TYPEHASH, showId, outcome, at)));
        if (!isAttester[ECDSA.recover(d, sig)]) revert BadAttestation();
    }

    function _notify(uint256 showId, address payer, uint256 refunded) internal {
        if (!factory.isVault(payer)) return;
        if (gasleft() < CALLBACK_GAS + 20_000) revert InsufficientGas();
        try ITripVault(payer).onShowSettled{ gas: CALLBACK_GAS }(showId, refunded) { }
        catch { emit VaultCallbackFailed(showId); }
    }

    function _venue(uint256 id) internal view returns (Venue storage) {
        if (id >= _venues.length) revert Unknown();
        return _venues[id];
    }

    function _show(uint256 id) internal view returns (Show storage) {
        if (id >= _shows.length) revert Unknown();
        return _shows[id];
    }

    // ------------------------------------------------------------ views

    function showInfo(uint256 showId) external view override returns (ShowInfo memory) {
        Show storage s = _show(showId);
        return ShowInfo(s.status, s.showTime, s.maxTickets, s.venueTicketBps, s.ticketPrice, s.artist, s.venueOwner, s.asset);
    }

    /// @notice For TripVault.syncShow: status (1 Booked, 2 Played, >=3 closed), payer, amount refunded.
    function showStatus(uint256 showId) external view override returns (uint8, address, uint256) {
        Show storage s = _show(showId);
        return (uint8(s.status), s.payer, s.refunded);
    }

    function isCancelled(uint256 showId) public view returns (bool) {
        return uint8(_show(showId).status) >= uint8(ShowStatus.VenueCancelled);
    }

    function getVenue(uint256 id) external view returns (Venue memory) { return _venue(id); }
    function getShow(uint256 id) external view returns (Show memory) { return _show(id); }
    function venueCount() external view returns (uint256) { return _venues.length; }
    function showCount() external view returns (uint256) { return _shows.length; }
    function venuesOf(address o) external view returns (uint256[] memory) { return _venuesOf[o]; }
    function showsAtVenue(uint256 id) external view returns (uint256[] memory) { return _showsAtVenue[id]; }
    function showsOf(address payer) external view returns (uint256[] memory) { return _showsOfPayer[payer]; }
    function domainSeparator() external view returns (bytes32) { return _domainSeparatorV4(); }

    /// @notice Reliability record: shows held vs. venue-side cancellations (bps of resolved shows).
    function reliability(uint256 id) external view returns (uint32 held, uint32 cancelled, uint256 reliabilityBps) {
        Venue storage v = _venue(id);
        held = v.showsHeld;
        cancelled = v.cancellations;
        uint256 total = uint256(held) + cancelled;
        reliabilityBps = total == 0 ? 10_000 : uint256(held) * 10_000 / total;
    }
}
