// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { ITripVault, ITripVaultFactory } from "./interfaces/ITripVault.sol";

/// @title  Bookings: local guides and hosts list tours and stays; payment waits in escrow
/// @notice Every Held booking ends in exactly one of two terminal states, and at least one path to a
///         terminal state is always open to someone:
///           Released  <- traveler confirms check-in (from startAt), or an attester signs that the
///                        traveler checked in at the listing (Hunt-style GPS proof), so a traveler
///                        cannot hold a host's money hostage by never confirming.
///           Refunded  <- host cancels (any time before release), traveler cancels inside the free-
///                        cancellation window, or ANYONE calls `claimNoShowRefund` once
///                        startAt + noShowTimeout has passed without a release.
///         On release, `feeBps` (snapshotted at booking time, max 5%) goes to the EmpowerTours treasury
///         and the rest to the host. Refunds are always 100%. If the payer is a TripVault, the vault is
///         notified so its leash allowance comes back (wrapped in try/catch: escrow resolution never
///         depends on the callback).
///         After a release the traveler may anchor one review: a 1-5 rating plus keccak256 of the full
///         review text (stored off-chain), so reviews cannot be edited, deleted or bought after the fact.
contract Bookings is Ownable2Step, ReentrancyGuardTransient, EIP712 {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 500;
    uint64 public constant MIN_TIMEOUT = 1 hours;
    uint64 public constant MAX_TIMEOUT = 30 days;
    uint64 public constant MAX_ADVANCE = 400 days;
    bytes32 public constant CHECKIN_TYPEHASH = keccak256("CheckIn(uint256 bookingId,address payer,uint64 at)");

    uint256 public constant CALLBACK_GAS = 250_000;

    enum Kind { Tour, Stay }
    enum Status { None, Held, Released, Refunded }

    struct Listing {
        address host;
        address asset;
        uint128 pricePerUnit;     // per person (tour) or per night (stay)
        uint32 maxUnits;
        Kind kind;
        bool active;
        uint64 cancelWindow;      // traveler may cancel until startAt - cancelWindow
        uint32 completed;
        uint32 reviewCount;
        uint32 ratingSum;
        string title;
        string place;
    }

    struct Booking {
        uint64 listingId;
        uint64 startAt;
        uint32 units;
        uint16 feeBps;            // snapshotted (audit L-01 pattern)
        uint64 noShowTimeout;     // snapshotted
        Status status;
        uint8 rating;
        address payer;
        address host;
        address asset;
        uint256 amount;
        uint64 cancelWindow;      // snapshotted
        bytes32 reviewHash;
    }

    ITripVaultFactory public immutable factory;
    address public treasury;
    uint16 public feeBps;
    uint64 public noShowTimeout;
    mapping(address => bool) public isAttester;
    mapping(address => bool) public assetAllowed;

    Listing[] internal _listings;
    Booking[] internal _bookings;
    mapping(address => uint256[]) internal _bookingsOfPayer;
    mapping(address => uint256[]) internal _listingsOfHost;
    uint256 public feesCollected;

    event ListingCreated(uint256 indexed listingId, address indexed host, Kind kind, uint256 pricePerUnit, string title);
    event ListingUpdated(uint256 indexed listingId, uint256 pricePerUnit, bool active);
    event Booked(uint256 indexed bookingId, uint256 indexed listingId, address indexed payer, uint256 amount, uint64 startAt);
    event Released(uint256 indexed bookingId, address host, uint256 hostAmount, uint256 fee, bool byAttestation);
    event Refunded(uint256 indexed bookingId, address payer, uint256 amount, uint8 reason); // 0 host cancel, 1 traveler cancel, 2 no-show
    event ReviewAnchored(uint256 indexed bookingId, uint256 indexed listingId, address reviewer, uint8 rating, bytes32 reviewHash);
    event VaultCallbackFailed(uint256 indexed bookingId);
    event ConfigSet(address treasury, uint16 feeBps, uint64 noShowTimeout);
    event AttesterSet(address indexed attester, bool allowed);
    event AssetSet(address indexed asset, bool allowed);

    error ZeroAddress();
    error BadConfig();
    error NotHost();
    error NotPayer();
    error NotReviewer();
    error Inactive();
    error BadUnits();
    error BadStart();
    error AssetNotAllowed();
    error PriceAboveMax(uint256 amount, uint256 maxAmount);
    error NotHeld();
    error NotReleased();
    error TooEarly();
    error WindowClosed();
    error BadAttestation();
    error AlreadyReviewed();
    error BadRating();
    error UnsupportedToken(uint256 expected, uint256 received);
    error UnknownListing();
    error UnknownBooking();
    error InsufficientGas();

    constructor(address owner_, ITripVaultFactory factory_, address treasury_, uint16 feeBps_, uint64 noShowTimeout_)
        Ownable(owner_)
        EIP712("EmpowerTours Bookings", "1")
    {
        if (address(factory_).code.length == 0) revert BadConfig();
        factory = factory_;
        _setConfig(treasury_, feeBps_, noShowTimeout_);
    }

    // ------------------------------------------------------------ admin

    function setConfig(address treasury_, uint16 feeBps_, uint64 noShowTimeout_) external onlyOwner {
        _setConfig(treasury_, feeBps_, noShowTimeout_);
    }

    function _setConfig(address treasury_, uint16 feeBps_, uint64 noShowTimeout_) internal {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS || noShowTimeout_ < MIN_TIMEOUT || noShowTimeout_ > MAX_TIMEOUT) revert BadConfig();
        treasury = treasury_;
        feeBps = feeBps_;
        noShowTimeout = noShowTimeout_;
        emit ConfigSet(treasury_, feeBps_, noShowTimeout_);
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

    // ------------------------------------------------------------ hosts

    function createListing(
        Kind kind,
        address asset,
        uint128 pricePerUnit,
        uint32 maxUnits,
        uint64 cancelWindow,
        string calldata title,
        string calldata place
    ) external returns (uint256 id) {
        if (!assetAllowed[asset]) revert AssetNotAllowed();
        if (pricePerUnit == 0 || maxUnits == 0 || cancelWindow > MAX_ADVANCE) revert BadConfig();
        id = _listings.length;
        _listings.push(Listing({
            host: msg.sender, asset: asset, pricePerUnit: pricePerUnit, maxUnits: maxUnits, kind: kind, active: true,
            cancelWindow: cancelWindow, completed: 0, reviewCount: 0, ratingSum: 0, title: title, place: place
        }));
        _listingsOfHost[msg.sender].push(id);
        emit ListingCreated(id, msg.sender, kind, pricePerUnit, title);
    }

    function updateListing(uint256 id, uint128 pricePerUnit, bool active) external {
        Listing storage l = _listing(id);
        if (msg.sender != l.host) revert NotHost();
        if (pricePerUnit == 0) revert BadConfig();
        l.pricePerUnit = pricePerUnit;
        l.active = active;
        emit ListingUpdated(id, pricePerUnit, active);
    }

    // ------------------------------------------------------------ travelers

    function quote(uint256 listingId, uint32 units) public view returns (address host, address asset, uint256 amount) {
        Listing storage l = _listing(listingId);
        if (!l.active) revert Inactive();
        if (units == 0 || units > l.maxUnits) revert BadUnits();
        return (l.host, l.asset, uint256(l.pricePerUnit) * units);
    }

    /// @notice Pay `quote` into escrow. `maxAmount` protects against a host raising the price in-flight.
    function book(uint256 listingId, uint32 units, uint64 startAt, uint256 maxAmount)
        external
        nonReentrant
        returns (uint256 id)
    {
        (address host, address asset, uint256 amount) = quote(listingId, units);
        if (amount > maxAmount) revert PriceAboveMax(amount, maxAmount);
        if (startAt + 1 hours < block.timestamp || startAt > block.timestamp + MAX_ADVANCE) revert BadStart();
        uint256 b0 = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = IERC20(asset).balanceOf(address(this)) - b0;
        if (got != amount) revert UnsupportedToken(amount, got);
        id = _bookings.length;
        _bookings.push(Booking({
            listingId: uint64(listingId), startAt: startAt, units: units, feeBps: feeBps, noShowTimeout: noShowTimeout,
            status: Status.Held, rating: 0, payer: msg.sender, host: host, asset: asset, amount: amount,
            cancelWindow: _listings[listingId].cancelWindow, reviewHash: bytes32(0)
        }));
        _bookingsOfPayer[msg.sender].push(id);
        emit Booked(id, listingId, msg.sender, amount, startAt);
    }

    /// @notice Payer confirms arrival -> release to host.
    function confirmCheckIn(uint256 id) external nonReentrant {
        Booking storage b = _booking(id);
        if (msg.sender != b.payer) revert NotPayer();
        if (block.timestamp < b.startAt) revert TooEarly();
        _release(id, b, false);
    }

    /// @notice Anyone may submit an attester's check-in proof -> release to host.
    function confirmWithAttestation(uint256 id, uint64 at, bytes calldata sig) external nonReentrant {
        Booking storage b = _booking(id);
        if (block.timestamp < b.startAt || at < b.startAt || at > block.timestamp) revert TooEarly();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CHECKIN_TYPEHASH, id, b.payer, at)));
        if (!isAttester[ECDSA.recover(digest, sig)]) revert BadAttestation();
        _release(id, b, true);
    }

    function hostCancel(uint256 id) external nonReentrant {
        Booking storage b = _booking(id);
        if (msg.sender != b.host) revert NotHost();
        _refund(id, b, 0);
    }

    function travelerCancel(uint256 id) external nonReentrant {
        Booking storage b = _booking(id);
        if (msg.sender != b.payer) revert NotPayer();
        if (block.timestamp + b.cancelWindow > b.startAt) revert WindowClosed();
        _refund(id, b, 1);
    }

    /// @notice Host never showed / nobody confirmed: after the timeout ANYONE can trigger the refund.
    function claimNoShowRefund(uint256 id) external nonReentrant {
        Booking storage b = _booking(id);
        if (block.timestamp <= uint256(b.startAt) + b.noShowTimeout) revert TooEarly();
        _refund(id, b, 2);
    }

    /// @notice Anchor one review after a released booking: rating 1..5 + hash of the review text.
    function anchorReview(uint256 id, uint8 rating, bytes32 reviewHash) external {
        Booking storage b = _booking(id);
        if (b.status != Status.Released) revert NotReleased();
        if (b.reviewHash != bytes32(0)) revert AlreadyReviewed();
        if (rating == 0 || rating > 5 || reviewHash == bytes32(0)) revert BadRating();
        address p = b.payer;
        bool ok = msg.sender == p;
        if (!ok && factory.isVault(p)) ok = msg.sender == ITripVault(p).owner();
        if (!ok) revert NotReviewer();
        b.reviewHash = reviewHash;
        b.rating = rating;
        Listing storage l = _listings[b.listingId];
        l.reviewCount += 1;
        l.ratingSum += rating;
        emit ReviewAnchored(id, b.listingId, msg.sender, rating, reviewHash);
    }

    // ------------------------------------------------------------ internals

    function _release(uint256 id, Booking storage b, bool byAttestation) internal {
        if (b.status != Status.Held) revert NotHeld();
        b.status = Status.Released;
        uint256 fee = b.amount * b.feeBps / 10_000;
        uint256 hostAmt = b.amount - fee;
        feesCollected += fee;
        _listings[b.listingId].completed += 1;
        if (fee != 0) IERC20(b.asset).safeTransfer(treasury, fee);
        IERC20(b.asset).safeTransfer(b.host, hostAmt);
        emit Released(id, b.host, hostAmt, fee, byAttestation);
        _notify(id, b.payer, false, b.amount);
    }

    function _refund(uint256 id, Booking storage b, uint8 reason) internal {
        if (b.status != Status.Held) revert NotHeld();
        b.status = Status.Refunded;
        IERC20(b.asset).safeTransfer(b.payer, b.amount);
        emit Refunded(id, b.payer, b.amount, reason);
        _notify(id, b.payer, true, b.amount);
    }

    function _notify(uint256 id, address payer, bool refunded, uint256 amount) internal {
        if (!factory.isVault(payer)) return;
        // griefing guard: a caller cannot starve the callback via the 63/64 rule
        if (gasleft() < CALLBACK_GAS + 20_000) revert InsufficientGas();
        try ITripVault(payer).onBookingSettled{ gas: CALLBACK_GAS }(id, refunded, amount) { }
        catch { emit VaultCallbackFailed(id); }
    }

    function _listing(uint256 id) internal view returns (Listing storage) {
        if (id >= _listings.length) revert UnknownListing();
        return _listings[id];
    }

    function _booking(uint256 id) internal view returns (Booking storage) {
        if (id >= _bookings.length) revert UnknownBooking();
        return _bookings[id];
    }

    // ------------------------------------------------------------ views

    function getListing(uint256 id) external view returns (Listing memory) { return _listing(id); }
    /// @notice Compact status for TripVault.syncBooking (1 Held, 2 Released, 3 Refunded).
    function bookingStatus(uint256 id) external view returns (uint8 status, address payer, uint256 amount) {
        Booking storage b = _booking(id);
        return (uint8(b.status), b.payer, b.amount);
    }

    function getBooking(uint256 id) external view returns (Booking memory) { return _booking(id); }
    function listingCount() external view returns (uint256) { return _listings.length; }
    function bookingCount() external view returns (uint256) { return _bookings.length; }
    function bookingsOf(address payer) external view returns (uint256[] memory) { return _bookingsOfPayer[payer]; }
    function listingsOf(address host) external view returns (uint256[] memory) { return _listingsOfHost[host]; }

    function domainSeparator() external view returns (bytes32) { return _domainSeparatorV4(); }
}
