// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IYieldAdapter } from "./interfaces/IYieldAdapter.sol";
import { ITripVault, ITripVaultFactory, IBookings } from "./interfaces/ITripVault.sol";
import { IVenues } from "./interfaces/IVenues.sol";

/// @title  TripVault: a savings pot for one trip (or one artist tour), on a Cota-style leash
/// @notice Lifecycle
///         1. SAVING  (now < startTime): the owner, friends (if `open`) and TourRewards (proved visits)
///            deposit `asset`. Each depositor gets internal shares; idle money sits in the yield adapter.
///            Non-owner contributors may exit at any time before the trip starts.
///         2. TRIP    (startTime <= now < endTime): the owner or its delegated `agent` may spend, but
///            ONLY through the leash: approved vendors, per-vendor caps, a total cap. Spends go either
///            straight to a vendor (`payVendor`) or into Bookings escrow (`book`), where a host
///            cancellation/no-show refunds the vault automatically and gives the leash cap back.
///         3. CLOSED  (cancelled, or now >= endTime with no open bookings): every contributor redeems
///            their shares for their pro-rata part of what is left, including yield.
///         Spending is shared pro-rata: a booking is paid by everyone's money in proportion to shares,
///         which is the deal a contributor accepts when chipping in to someone's trip.
///
///         Leash changes: tightening is immediate; loosening (raising a cap / adding a vendor) is
///         queued for LEASH_DELAY, and anyone who contributed before a loosening may exit even during
///         the trip, so nobody's money is ever spent under rules they did not see.
///         Accounting uses ERC4626-style virtual shares (offset 1e6) against inflation/donation attacks.
contract TripVault is ITripVault, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    uint256 public constant LEASH_DELAY = 1 days;
    uint256 internal constant VIRTUAL_SHARES = 1e6;
    uint256 internal constant VIRTUAL_ASSETS = 1;
    uint256 public constant MAX_VENDORS = 32;

    struct Config {
        address owner;
        address agent;            // optional delegate (e.g. a Cota agent); leashed exactly like the owner
        address asset;
        address adapter;          // optional yield adapter (address(0) = keep idle)
        Kind kind;
        bool open;                // anyone may contribute (group trip / fan-funded tour)
        uint64 startTime;         // spending allowed from here
        uint64 endTime;           // spending stops; vault closes
        uint256 goal;
        uint256 totalCap;         // leash: max net spend
        string destination;       // e.g. "Oaxaca, MX"
        address[] vendors;        // leash: initially approved vendors
        uint256[] vendorCaps;
    }

    // ------------------------------------------------------------ config
    address public factory;
    address public override owner;
    address public override agent;
    address public override asset;
    IYieldAdapter public adapter;
    Kind public override kind;
    bool public open;
    bool public override cancelled;
    uint64 public startTime;
    uint64 public endTime;
    uint256 public goal;
    string public destination;
    bool private _initialized;

    // ------------------------------------------------------------ accounting
    uint256 public totalShares;
    uint256 public override totalPrincipal;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public override principalOf;
    mapping(address => uint64) public lastDepositAt;
    address[] internal _contributors;
    mapping(address => bool) internal _isContributor;

    // ------------------------------------------------------------ leash
    uint256 public totalCap;
    uint256 public override totalSpent;
    mapping(address => uint256) public vendorCap;
    mapping(address => uint256) public vendorSpent;
    address[] internal _vendors;
    mapping(address => bool) internal _isVendor;
    struct Pending { uint256 cap; uint64 eta; }
    mapping(address => Pending) public pendingVendorCap;
    Pending public pendingTotalCap;
    uint64 public lastLoosenAt;

    // ------------------------------------------------------------ bookings
    mapping(uint256 => address) public bookingVendor;
    mapping(uint256 => uint256) public bookingAmount;
    mapping(uint256 => bool) public bookingOpen;
    uint256 public openBookings;      // open escrows of either kind (tours/stays AND venue shows)

    // ------------------------------------------------------------ venue shows (artist tour funds)
    mapping(uint256 => address) public showVendor;
    mapping(uint256 => uint256) public showAmount;
    mapping(uint256 => bool) public showOpen;

    event Deposited(address indexed from, address indexed beneficiary, uint256 assets, uint256 shares);
    event Withdrawn(address indexed contributor, uint256 shares, uint256 assets);
    event VendorPaid(address indexed vendor, uint256 amount, bytes32 memo, address by);
    event Booked(uint256 indexed bookingId, address indexed vendor, uint256 amount, address by);
    event BookingSettled(uint256 indexed bookingId, bool refunded, uint256 amount);
    event VenueBooked(uint256 indexed showId, address indexed venueOwner, uint256 deposit, address by);
    event ShowSettled(uint256 indexed showId, uint256 refunded);
    event LeashTightened(address indexed vendor, uint256 cap);
    event TotalCapTightened(uint256 cap);
    event LeashLoosenQueued(address indexed vendor, uint256 cap, uint64 eta);
    event LeashLoosened(address indexed vendor, uint256 cap);
    event TotalCapLoosenQueued(uint256 cap, uint64 eta);
    event TotalCapLoosened(uint256 cap);
    event AgentSet(address indexed agent);
    event Cancelled();
    event SweptToYield(uint256 amount);

    error AlreadyInitialized();
    error BadConfig();
    error NotOwner();
    error NotSpender();
    error NotBookings();
    error NotVenues();
    error Closed();
    error NotOpen();
    error TripNotStarted();
    error TripOver();
    error NotApprovedVendor(address vendor);
    error VendorCapExceeded(address vendor, uint256 spent, uint256 cap);
    error TotalCapExceeded(uint256 spent, uint256 cap);
    error WrongAsset();
    error OpenBookings(uint256 count);
    error CannotWithdrawYet();
    error ZeroAmount();
    error NoPending();
    error PendingNotReady(uint64 eta);
    error NotLoosening();
    error TooManyVendors();
    error UnsupportedToken(uint256 expected, uint256 received);
    error PriceMismatch(uint256 expected, uint256 paid);

    // ------------------------------------------------------------ init

    /// @dev lock the implementation; clones start uninitialized
    constructor() {
        _initialized = true;
    }

    function initialize(address factory_, Config calldata c) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        if (
            c.owner == address(0) || c.asset == address(0) || c.endTime <= c.startTime || c.endTime <= block.timestamp
                || c.goal == 0 || c.vendors.length != c.vendorCaps.length || c.vendors.length > MAX_VENDORS
        ) revert BadConfig();
        if (c.adapter != address(0) && IYieldAdapter(c.adapter).asset() != c.asset) revert BadConfig();
        factory = factory_;
        owner = c.owner;
        agent = c.agent;
        asset = c.asset;
        adapter = IYieldAdapter(c.adapter);
        kind = c.kind;
        open = c.open;
        startTime = c.startTime;
        endTime = c.endTime;
        goal = c.goal;
        totalCap = c.totalCap;
        destination = c.destination;
        for (uint256 i; i < c.vendors.length; ++i) {
            address v = c.vendors[i];
            if (v == address(0)) revert BadConfig();
            _addVendor(v);
            vendorCap[v] = c.vendorCaps[i];
        }
    }

    // ------------------------------------------------------------ modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlySpender() {
        if (msg.sender != owner && (msg.sender != agent || agent == address(0))) revert NotSpender();
        if (cancelled) revert Closed();
        if (block.timestamp < startTime) revert TripNotStarted();
        if (block.timestamp >= endTime) revert TripOver();
        _;
    }

    // ------------------------------------------------------------ views

    function totalAssets() public view returns (uint256) {
        uint256 bal = IERC20(asset).balanceOf(address(this));
        if (address(adapter) != address(0)) bal += adapter.balanceOf(address(this));
        return bal;
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, totalAssets() + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
    }

    function balanceOfContributor(address c) external view returns (uint256) {
        return previewRedeem(sharesOf[c]);
    }

    /// @notice Funding progress in basis points of `goal`, counting money already spent on the trip.
    function progressBps() external view returns (uint256) {
        uint256 funded = totalAssets() + totalSpent;
        return funded >= goal ? 10_000 : funded * 10_000 / goal;
    }

    /// @notice Yield earned so far: assets + net spend - net principal.
    function yieldEarned() external view returns (uint256) {
        uint256 a = totalAssets() + totalSpent;
        return a > totalPrincipal ? a - totalPrincipal : 0;
    }

    function contributors() external view returns (address[] memory) { return _contributors; }
    function vendors() external view returns (address[] memory) { return _vendors; }

    /// @notice Whether `deposit(_, beneficiary)` would be accepted right now.
    function acceptsDeposits(address beneficiary) external view override returns (bool) {
        return !cancelled && block.timestamp < endTime && (open || beneficiary == owner);
    }

    function isClosed() public view returns (bool) {
        return cancelled || (block.timestamp >= endTime && openBookings == 0);
    }

    // ------------------------------------------------------------ saving

    /// @notice Deposit `amount` of `asset` from msg.sender, credited to `beneficiary`.
    ///         Closed vaults and (for solo vaults) third-party beneficiaries are rejected.
    function deposit(uint256 amount, address beneficiary) external override nonReentrant returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();
        if (cancelled || block.timestamp >= endTime) revert Closed();
        if (!open && beneficiary != owner) revert NotOpen();
        uint256 assetsBefore = totalAssets();
        uint256 received = _pullExact(msg.sender, amount);
        shares = Math.mulDiv(received, totalShares + VIRTUAL_SHARES, assetsBefore + VIRTUAL_ASSETS);
        if (shares == 0) revert ZeroAmount();
        totalShares += shares;
        sharesOf[beneficiary] += shares;
        principalOf[beneficiary] += received;
        totalPrincipal += received;
        lastDepositAt[beneficiary] = uint64(block.timestamp);
        if (!_isContributor[beneficiary]) {
            _isContributor[beneficiary] = true;
            _contributors.push(beneficiary);
        }
        emit Deposited(msg.sender, beneficiary, received, shares);
        _sweep();
    }

    /// @notice Move idle balance into the yield adapter (also done on each deposit/refund).
    function sweepToYield() external nonReentrant {
        _sweep();
    }

    function canWithdraw(address c) public view returns (bool) {
        if (isClosed()) return true;
        if (c == owner) return false;
        if (block.timestamp < startTime) return true;
        // a loosening was queued after this contributor's last deposit: they did not sign up for it
        return lastLoosenAt > lastDepositAt[c];
    }

    /// @notice Redeem `shares` (type(uint256).max = all) for the pro-rata share of current assets.
    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (!canWithdraw(msg.sender)) revert CannotWithdrawYet();
        if (!cancelled && block.timestamp >= endTime && openBookings != 0) revert OpenBookings(openBookings);
        uint256 have = sharesOf[msg.sender];
        if (shares == type(uint256).max) shares = have;
        if (shares == 0 || shares > have) revert ZeroAmount();
        assets = previewRedeem(shares);
        uint256 p = principalOf[msg.sender];
        uint256 pOut = Math.mulDiv(p, shares, have);
        principalOf[msg.sender] = p - pOut;
        totalPrincipal -= pOut;
        sharesOf[msg.sender] = have - shares;
        totalShares -= shares;
        _ensureIdle(assets);
        IERC20(asset).safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, shares, assets);
    }

    // ------------------------------------------------------------ spending (leashed)

    function _checkLeash(address vendor, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (!_isVendor[vendor] || vendorCap[vendor] == 0) revert NotApprovedVendor(vendor);
        uint256 vs = vendorSpent[vendor] + amount;
        if (vs > vendorCap[vendor]) revert VendorCapExceeded(vendor, vs, vendorCap[vendor]);
        uint256 ts = totalSpent + amount;
        if (ts > totalCap) revert TotalCapExceeded(ts, totalCap);
        vendorSpent[vendor] = vs;
        totalSpent = ts;
    }

    /// @notice Pay an approved vendor directly (e.g. a bus ticket), within the leash.
    function payVendor(address vendor, uint256 amount, bytes32 memo) external onlySpender nonReentrant {
        _checkLeash(vendor, amount);
        _ensureIdle(amount);
        IERC20(asset).safeTransfer(vendor, amount);
        emit VendorPaid(vendor, amount, memo, msg.sender);
    }

    /// @notice Book a tour/stay into escrow. The leash is checked against the listing's host.
    function book(uint256 listingId, uint32 units, uint64 startAt) external onlySpender nonReentrant returns (uint256 bookingId) {
        IBookings b = IBookings(ITripVaultFactory(factory).bookings());
        (address host, address a, uint256 amount) = b.quote(listingId, units);
        if (a != asset) revert WrongAsset();
        _checkLeash(host, amount);
        _ensureIdle(amount);
        uint256 before = IERC20(asset).balanceOf(address(this));
        IERC20(asset).forceApprove(address(b), amount);
        bookingId = b.book(listingId, units, startAt, amount);
        IERC20(asset).forceApprove(address(b), 0);
        uint256 paid = before - IERC20(asset).balanceOf(address(this));
        if (paid != amount) revert PriceMismatch(amount, paid);
        bookingVendor[bookingId] = host;
        bookingAmount[bookingId] = amount;
        bookingOpen[bookingId] = true;
        ++openBookings;
        emit Booked(bookingId, host, amount, msg.sender);
    }

    /// @notice Book a venue for a show (artist tour funds). The leash is checked against the venue's
    ///         owner address, so only approved venues, within their caps, inside the tour window.
    function bookVenue(uint256 venueId, uint64 showTime, uint128 ticketPrice, uint32 maxTickets, string calldata title)
        external
        onlySpender
        nonReentrant
        returns (uint256 showId)
    {
        IVenues ven = IVenues(ITripVaultFactory(factory).venues());
        (address venueOwner, address a, uint256 dep) = ven.quote(venueId);
        if (a != asset) revert WrongAsset();
        _checkLeash(venueOwner, dep);
        _ensureIdle(dep);
        uint256 before = IERC20(asset).balanceOf(address(this));
        IERC20(asset).forceApprove(address(ven), dep);
        showId = ven.bookShow(venueId, showTime, ticketPrice, maxTickets, title, dep);
        IERC20(asset).forceApprove(address(ven), 0);
        uint256 paid = before - IERC20(asset).balanceOf(address(this));
        if (paid != dep) revert PriceMismatch(dep, paid);
        showVendor[showId] = venueOwner;
        showAmount[showId] = dep;
        showOpen[showId] = true;
        ++openBookings;
        emit VenueBooked(showId, venueOwner, dep, msg.sender);
    }

    /// @notice Artist-side cancellation before showtime (the venue keeps its agreed cancellation fee).
    function cancelShow(uint256 showId) external nonReentrant {
        if (msg.sender != owner && (msg.sender != agent || agent == address(0))) revert NotSpender();
        IVenues(ITripVaultFactory(factory).venues()).artistCancel(showId);
    }

    /// @inheritdoc ITripVault
    function onShowSettled(uint256 showId, uint256 refunded) external override {
        if (msg.sender != ITripVaultFactory(factory).venues()) revert NotVenues();
        _settleShow(showId, refunded);
    }

    /// @notice Backstop if the Venues callback ever failed.
    function syncShow(uint256 showId) external nonReentrant {
        if (!showOpen[showId]) return;
        (uint8 status, address payer, uint256 refunded) = IVenues(ITripVaultFactory(factory).venues()).showStatus(showId);
        if (payer != address(this) || status < 2) return;
        _settleShow(showId, refunded);
    }

    function _settleShow(uint256 showId, uint256 refunded) internal {
        if (!showOpen[showId]) return;
        showOpen[showId] = false;
        --openBookings;
        if (refunded != 0) {
            address v = showVendor[showId];
            uint256 amt = Math.min(refunded, showAmount[showId]);
            vendorSpent[v] -= Math.min(amt, vendorSpent[v]);
            totalSpent -= Math.min(amt, totalSpent);
        }
        emit ShowSettled(showId, refunded);
    }

    /// @notice Confirm arrival so escrow releases to the host (the owner or agent, any time once open).
    function confirmCheckIn(uint256 bookingId) external nonReentrant {
        if (msg.sender != owner && (msg.sender != agent || agent == address(0))) revert NotSpender();
        IBookings(ITripVaultFactory(factory).bookings()).confirmCheckIn(bookingId);
    }

    /// @notice Traveler-side cancellation (only inside the listing's free-cancellation window).
    function cancelBooking(uint256 bookingId) external nonReentrant {
        if (msg.sender != owner && (msg.sender != agent || agent == address(0))) revert NotSpender();
        IBookings(ITripVaultFactory(factory).bookings()).travelerCancel(bookingId);
    }

    /// @inheritdoc ITripVault
    /// @dev Must never revert for a known booking (escrow liveness); Bookings also wraps it in try/catch.
    function onBookingSettled(uint256 bookingId, bool refunded, uint256 amount) external override {
        if (msg.sender != ITripVaultFactory(factory).bookings()) revert NotBookings();
        _settle(bookingId, refunded, amount);
    }

    /// @notice Backstop if the escrow callback ever failed: anyone can sync a resolved booking.
    function syncBooking(uint256 bookingId) external nonReentrant {
        if (!bookingOpen[bookingId]) return;
        (uint8 status, address payer, uint256 amount) = IBookings(ITripVaultFactory(factory).bookings()).bookingStatus(bookingId);
        if (payer != address(this) || status < 2) return;
        _settle(bookingId, status == 3, amount);
    }

    function _settle(uint256 bookingId, bool refunded, uint256 amount) internal {
        if (!bookingOpen[bookingId]) return;
        bookingOpen[bookingId] = false;
        --openBookings;
        if (refunded) {
            // money is back: give the leash allowance back too (bounded, never underflows)
            address v = bookingVendor[bookingId];
            uint256 amt = bookingAmount[bookingId];
            if (amount < amt) amt = amount;
            vendorSpent[v] -= Math.min(amt, vendorSpent[v]);
            totalSpent -= Math.min(amt, totalSpent);
        }
        emit BookingSettled(bookingId, refunded, amount);
    }

    // ------------------------------------------------------------ leash management

    /// @notice Lower a vendor cap (0 = revoke) immediately. Raising goes through `queueVendorCap`.
    function tightenVendorCap(address vendor, uint256 cap) external onlyOwner {
        if (cap > vendorCap[vendor]) revert NotLoosening();
        vendorCap[vendor] = cap;
        delete pendingVendorCap[vendor];
        emit LeashTightened(vendor, cap);
    }

    function tightenTotalCap(uint256 cap) external onlyOwner {
        if (cap > totalCap) revert NotLoosening();
        totalCap = cap;
        delete pendingTotalCap;
        emit TotalCapTightened(cap);
    }

    function queueVendorCap(address vendor, uint256 cap) external onlyOwner {
        if (vendor == address(0) || cap <= vendorCap[vendor]) revert NotLoosening();
        if (!_isVendor[vendor]) {
            if (_vendors.length >= MAX_VENDORS) revert TooManyVendors();
        }
        uint64 eta = uint64(block.timestamp + LEASH_DELAY);
        pendingVendorCap[vendor] = Pending(cap, eta);
        lastLoosenAt = uint64(block.timestamp);
        emit LeashLoosenQueued(vendor, cap, eta);
    }

    function applyVendorCap(address vendor) external onlyOwner {
        Pending memory p = pendingVendorCap[vendor];
        if (p.eta == 0) revert NoPending();
        if (block.timestamp < p.eta) revert PendingNotReady(p.eta);
        delete pendingVendorCap[vendor];
        if (!_isVendor[vendor]) _addVendor(vendor);
        vendorCap[vendor] = p.cap;
        emit LeashLoosened(vendor, p.cap);
    }

    function queueTotalCap(uint256 cap) external onlyOwner {
        if (cap <= totalCap) revert NotLoosening();
        uint64 eta = uint64(block.timestamp + LEASH_DELAY);
        pendingTotalCap = Pending(cap, eta);
        lastLoosenAt = uint64(block.timestamp);
        emit TotalCapLoosenQueued(cap, eta);
    }

    function applyTotalCap() external onlyOwner {
        Pending memory p = pendingTotalCap;
        if (p.eta == 0) revert NoPending();
        if (block.timestamp < p.eta) revert PendingNotReady(p.eta);
        delete pendingTotalCap;
        totalCap = p.cap;
        emit TotalCapLoosened(p.cap);
    }

    function setAgent(address a) external onlyOwner {
        agent = a;
        emit AgentSet(a);
    }

    /// @notice Cancel the trip: everyone can withdraw their share plus yield. Needs no open bookings
    ///         (cancel them first; host-side they resolve on their own via cancel/no-show timeout).
    function cancel() external onlyOwner {
        if (cancelled) revert Closed();
        if (openBookings != 0) revert OpenBookings(openBookings);
        cancelled = true;
        emit Cancelled();
    }

    // ------------------------------------------------------------ internals

    function _addVendor(address v) internal {
        if (_isVendor[v]) return;
        if (_vendors.length >= MAX_VENDORS) revert TooManyVendors();
        _isVendor[v] = true;
        _vendors.push(v);
    }

    /// @dev audit L-02 pattern: reject fee-on-transfer / rebasing tokens
    function _pullExact(address from, uint256 amount) internal returns (uint256) {
        uint256 b0 = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(from, address(this), amount);
        uint256 got = IERC20(asset).balanceOf(address(this)) - b0;
        if (got != amount) revert UnsupportedToken(amount, got);
        return got;
    }

    function _ensureIdle(uint256 amount) internal {
        uint256 idle = IERC20(asset).balanceOf(address(this));
        if (idle >= amount || address(adapter) == address(0)) return;
        adapter.withdraw(amount - idle, address(this));
    }

    function _sweep() internal {
        if (address(adapter) == address(0)) return;
        uint256 idle = IERC20(asset).balanceOf(address(this));
        if (idle == 0) return;
        IERC20(asset).forceApprove(address(adapter), idle);
        adapter.deposit(idle);
        emit SweptToYield(idle);
    }
}
