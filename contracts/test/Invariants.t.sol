// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { Bookings } from "../src/Bookings.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { MockToken } from "../src/mocks/MockToken.sol";

contract Handler is Test {
    TripVault public v;
    Bookings public bookings;
    TourRewards public rewards;
    MockToken public usdc;
    uint256 attesterPk;
    address public owner;
    address[] public actors;     // contributors (owner first)
    address[] public vendors;    // approved vendors + a rogue one (last)
    uint256[] public listings;   // one per vendor
    uint256 public campaign;

    // ghosts
    uint256 public deposited;
    uint256 public withdrawn;
    uint256 public paidDirect;
    uint256 public escrowedOut;
    uint256 public refundedIn;
    bool public spentOutsideWindow;
    uint256[] public bookingIds;
    mapping(bytes32 => uint256) public claimsPerVisitId;
    mapping(bytes32 => uint256) public claimsPerUserDay;
    bytes32[] public visitIds;
    bytes32[] public userDays;
    uint256 public rewardsPaid;
    uint256 public now_;
    uint256 public okPays;
    uint256 public okClaims;
    uint256 public okWithdraws;

    constructor(TripVault v_, Bookings b_, TourRewards r_, MockToken u_, uint256 pk, address[] memory actors_, address[] memory vendors_, uint256[] memory listings_, uint256 campaign_) {
        v = v_; bookings = b_; rewards = r_; usdc = u_; attesterPk = pk;
        actors = actors_; vendors = vendors_; listings = listings_; campaign = campaign_;
        owner = v.owner();
        now_ = block.timestamp;
    }

    function _sync() internal { vm.warp(now_); }

    function warp(uint256 dt) external {
        now_ += bound(dt, 1, 2 days);
        _sync();
    }

    function deposit(uint256 who, uint256 amt) external {
        _sync();
        address a = actors[who % actors.length];
        amt = bound(amt, 1, 1_000e6);
        vm.startPrank(a);
        usdc.approve(address(v), amt);
        try v.deposit(amt, a) { deposited += amt; } catch { }
        vm.stopPrank();
    }

    function withdraw(uint256 who, uint256 frac) external {
        _sync();
        address a = actors[who % actors.length];
        uint256 s = v.sharesOf(a);
        if (s == 0) return;
        s = bound(frac, 1, s);
        vm.prank(a);
        try v.withdraw(s) returns (uint256 got) { withdrawn += got; ++okWithdraws; } catch { }
    }

    function payVendor(uint256 vi, uint256 amt, bool asStranger) external {
        _sync();
        address to = vendors[vi % vendors.length];
        amt = bound(amt, 1, 300e6);
        bool inWindow = block.timestamp >= v.startTime() && block.timestamp < v.endTime();
        vm.prank(asStranger ? actors[actors.length - 1] : owner);
        try v.payVendor(to, amt, "inv") {
            paidDirect += amt;
            ++okPays;
            if (!inWindow) spentOutsideWindow = true;
        } catch { }
    }

    function book(uint256 li, uint32 units) external {
        _sync();
        uint256 l = listings[li % listings.length];
        units = uint32(bound(units, 1, 4));
        bool inWindow = block.timestamp >= v.startTime() && block.timestamp < v.endTime();
        vm.prank(owner);
        try v.book(l, units, uint64(block.timestamp + 1 days)) returns (uint256 id) {
            bookingIds.push(id);
            escrowedOut += bookings.getBooking(id).amount;
            if (!inWindow) spentOutsideWindow = true;
        } catch { }
    }

    function _pick(uint256 seed) internal view returns (bool, uint256) {
        if (bookingIds.length == 0) return (false, 0);
        return (true, bookingIds[seed % bookingIds.length]);
    }

    function hostCancel(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        Bookings.Booking memory b = bookings.getBooking(id);
        vm.prank(b.host);
        try bookings.hostCancel(id) { refundedIn += b.amount; } catch { }
    }

    function confirm(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        vm.prank(owner);
        try v.confirmCheckIn(id) { } catch { }
    }

    function noShow(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        uint256 amt = bookings.getBooking(id).amount;
        try bookings.claimNoShowRefund(id) { refundedIn += amt; } catch { }
    }

    function claimVisit(uint256 who, uint256 ago, uint256 idSeed, bool toVault) external {
        _sync();
        address u = actors[who % actors.length];
        ago = bound(ago, 0, 13 days);
        if (ago > block.timestamp) ago = 0;
        uint64 at = uint64(block.timestamp - ago);
        bytes32 vid = keccak256(abi.encode(idSeed % 40)); // small id space -> lots of replay attempts
        address vault = (toVault && u == owner) ? address(v) : address(0);
        TourRewards.Visit memory x = TourRewards.Visit(u, campaign, vault, at, vid);
        bytes32 d = rewards.visitDigest(x);
        (uint8 rv, bytes32 r, bytes32 s) = vm.sign(attesterPk, d);
        bool accepts = vault != address(0) && v.acceptsDeposits(u);
        try rewards.claim(x, abi.encodePacked(r, s, rv)) returns (uint256 reward, uint256) {
            if (claimsPerVisitId[vid] == 0) visitIds.push(vid);
            claimsPerVisitId[vid] += 1;
            bytes32 ud = keccak256(abi.encode(u, uint256(at) / 1 days));
            if (claimsPerUserDay[ud] == 0) userDays.push(ud);
            claimsPerUserDay[ud] += 1;
            rewardsPaid += reward;
            ++okClaims;
            if (accepts) deposited += reward;
        } catch { }
    }

    function bookingCount() external view returns (uint256) { return bookingIds.length; }
    function visitIdCount() external view returns (uint256) { return visitIds.length; }
    function userDayCount() external view returns (uint256) { return userDays.length; }
    function actorCount() external view returns (uint256) { return actors.length; }
    function vendorCount() external view returns (uint256) { return vendors.length; }
}

contract InvariantsTest is Base {
    Handler h;
    TripVault v;
    address rogue = makeAddr("rogue");
    uint256 campaignBudget;
    uint256 cid;

    function setUp() public override {
        super.setUp();
        v = _trip(traveler, true);
        address[] memory actors = new address[](3);
        actors[0] = traveler; actors[1] = friend; actors[2] = stranger;
        address[] memory vendors_ = new address[](4);
        vendors_[0] = guide; vendors_[1] = hostA; vendors_[2] = hostB; vendors_[3] = rogue;
        uint256[] memory ls = new uint256[](4);
        ls[0] = _listing(guide, Bookings.Kind.Tour, 30e6);
        ls[1] = _listing(hostA, Bookings.Kind.Stay, 50e6);
        ls[2] = _listing(hostB, Bookings.Kind.Stay, 45e6);
        ls[3] = _listing(rogue, Bookings.Kind.Stay, 10e6);
        cid = _campaign(artist, 2e6, 10e18, 1_000, 5_000e6);
        campaignBudget = rewards.getCampaign(cid).budget;
        h = new Handler(v, bookings, rewards, usdc, attesterPk, actors, vendors_, ls, cid);
        for (uint256 i; i < 3; ++i) _fund(actors[i], 100_000e6);
        targetContract(address(h));
    }

    function afterInvariant() public view {
        // coverage sanity: the handler must actually exercise the happy paths
        assertGt(h.okClaims(), 0);
        assertGt(h.deposited(), 0);
    }

    /// vault funds conserved: assets >= in - out - spent (+ refunds); the gap is only yield
    function invariant_VaultFundsConserved() public view {
        uint256 net = h.deposited() + h.refundedIn();
        uint256 out = h.withdrawn() + h.paidDirect() + h.escrowedOut();
        assertGe(v.totalAssets() + 2 * (h.bookingCount() + 50), net > out ? net - out : 0);
        assertEq(v.totalSpent(), h.paidDirect() + h.escrowedOut() - h.refundedIn());
    }

    /// no contributor can redeem more than the vault holds
    function invariant_SharesBacked() public view {
        uint256 sum;
        for (uint256 i; i < h.actorCount(); ++i) sum += v.previewRedeem(v.sharesOf(h.actors(i)));
        assertLe(sum, v.totalAssets());
    }

    /// leash cannot be bypassed: caps, approved vendors only, only inside the trip window
    function invariant_LeashHolds() public view {
        assertLe(v.vendorSpent(guide), v.vendorCap(guide));
        assertLe(v.vendorSpent(hostA), v.vendorCap(hostA));
        assertLe(v.vendorSpent(hostB), v.vendorCap(hostB));
        assertLe(v.totalSpent(), v.totalCap());
        assertEq(usdc.balanceOf(rogue), 0);
        assertEq(v.vendorSpent(rogue), 0);
        assertFalse(h.spentOutsideWindow());
        // a vendor never received more from this vault than its cap (direct + released escrow)
        assertLe(usdc.balanceOf(guide) - 10_000e6, v.vendorCap(guide));
    }

    /// no double reward
    function invariant_NoDoubleReward() public view {
        for (uint256 i; i < h.visitIdCount(); ++i) assertEq(h.claimsPerVisitId(h.visitIds(i)), 1);
        for (uint256 i; i < h.userDayCount(); ++i) assertEq(h.claimsPerUserDay(h.userDays(i)), 1);
        assertEq(campaignBudget - rewards.getCampaign(cid).budget, h.rewardsPaid());
    }

    /// escrow holds exactly the Held bookings, and every Held booking can always be resolved
    function invariant_EscrowAlwaysResolves() public {
        uint256 held;
        uint256 n = bookings.bookingCount();
        for (uint256 i; i < n; ++i) {
            Bookings.Booking memory b = bookings.getBooking(i);
            if (b.status == Bookings.Status.Held) held += b.amount;
            assertTrue(b.status != Bookings.Status.None);
        }
        assertEq(usdc.balanceOf(address(bookings)), held);
        uint256 snap = vm.snapshotState();
        vm.warp(block.timestamp + 500 days);
        for (uint256 i; i < n; ++i) {
            if (bookings.getBooking(i).status == Bookings.Status.Held) bookings.claimNoShowRefund(i);
            Bookings.Status st = bookings.getBooking(i).status;
            assertTrue(st == Bookings.Status.Released || st == Bookings.Status.Refunded);
        }
        assertEq(usdc.balanceOf(address(bookings)), 0);
        assertEq(v.openBookings(), 0);
        vm.revertToState(snap);
    }
}

/// Same invariants, but with the vault running a longer life and exercised by a coverage probe.
contract HandlerCoverageTest is InvariantsTest {
    function test_HandlerHappyPathsReachable() public {
        h.deposit(0, 500e6);
        h.deposit(1, 200e6);
        h.claimVisit(0, 0, 1, true);
        for (uint256 i; i < 16; ++i) h.warp(2 days);
        h.payVendor(0, 50e6, false);
        h.book(1, 2);
        h.hostCancel(0);
        h.book(2, 1);
        h.warp(1 days + 1);
        h.confirm(1);
        assertEq(h.okPays(), 1);
        assertEq(h.bookingCount(), 2);
        assertEq(h.refundedIn(), 100e6);
        invariant_VaultFundsConserved();
        invariant_LeashHolds();
        invariant_EscrowAlwaysResolves();
    }
}
