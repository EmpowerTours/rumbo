// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { Venues } from "../src/Venues.sol";
import { Tickets } from "../src/Tickets.sol";
import { IVenues } from "../src/interfaces/IVenues.sol";

contract ShowsHandler is Test {
    TripVault public fund;
    Venues public venues;
    Tickets public tickets;
    uint256 pk;
    address[] public venueOwners;    // last one is NOT on the leash
    uint256[] public venueIds;
    address[] public fans;
    address public artist;
    uint256 public now_;
    uint256[] public showIds;
    mapping(uint256 => uint256) public scansOf;      // ticketId => successful scans
    uint256 public okScans;
    uint256 public okBooks;
    uint256 public okSettles;
    bool public rogueBooked;

    constructor(TripVault f, Venues v, Tickets t, uint256 pk_, address[] memory owners, uint256[] memory ids, address[] memory fans_, address artist_) {
        fund = f; venues = v; tickets = t; pk = pk_; venueOwners = owners; venueIds = ids; fans = fans_; artist = artist_;
        now_ = block.timestamp;
    }

    function _sync() internal { vm.warp(now_); }
    function _sig(bytes32 dom, bytes32 h) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", dom, h)));
        return abi.encodePacked(r, s, v);
    }
    function _pick(uint256 seed) internal view returns (bool, uint256) {
        if (showIds.length == 0) return (false, 0);
        return (true, showIds[seed % showIds.length]);
    }

    function warp(uint256 dt) external { now_ += bound(dt, 1, 1 days); _sync(); }

    function book(uint256 vi, uint256 daysAhead, uint256 hour) external {
        _sync();
        uint256 idx = vi % venueIds.length;
        uint64 at = uint64(block.timestamp + bound(daysAhead, 0, 20) * 1 days + bound(hour, 1, 23) * 1 hours);
        vm.prank(artist);
        try fund.bookVenue(venueIds[idx], at, 10e6, 50, "inv") returns (uint256 id) {
            showIds.push(id);
            ++okBooks;
            if (idx == venueIds.length - 1) rogueBooked = true;
        } catch { }
    }

    function buy(uint256 seed, uint256 who, uint32 qty) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        address f = fans[who % fans.length];
        qty = uint32(bound(qty, 1, 5));
        vm.startPrank(f);
        try tickets.buy(id, qty, uint256(qty) * 10e6) { } catch { }
        vm.stopPrank();
    }

    function venueCancel(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        vm.prank(venues.getShow(id).venueOwner);
        try venues.venueCancel(id) { } catch { }
    }

    function artistCancel(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        vm.prank(artist);
        try fund.cancelShow(id) { } catch { }
    }

    function confirm(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        uint64 at = uint64(block.timestamp);
        bytes memory s = _sig(venues.domainSeparator(), keccak256(abi.encode(venues.SHOW_TYPEHASH(), id, uint8(1), at)));
        try venues.confirmShow(id, at, s) { } catch { }
    }

    function noShow(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        uint64 at = uint64(block.timestamp);
        bytes memory s = _sig(venues.domainSeparator(), keccak256(abi.encode(venues.SHOW_TYPEHASH(), id, uint8(2), at)));
        try venues.claimArtistNoShow(id, at, s) { } catch { }
    }

    function expire(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        try venues.expire(id) { } catch { }
    }

    function scan(uint256 tseed) external {
        _sync();
        uint256 n = tickets.ticketCount();
        if (n == 0) return;
        uint256 t = tseed % n;
        Tickets.Ticket memory tk = tickets.getTicket(t);
        uint64 at = uint64(block.timestamp);
        bytes memory s = _sig(tickets.domainSeparator(), keccak256(abi.encode(tickets.SCAN_TYPEHASH(), t, tk.holder, at)));
        try tickets.scan(t, at, s) { scansOf[t] += 1; ++okScans; } catch { }
    }

    function settle(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        try tickets.settle(id) { ++okSettles; } catch { }
    }

    function refundAll(uint256 seed) external {
        _sync();
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        try tickets.refundAll(id, 10) { } catch { }
    }

    // round 3: resale + gifts
    uint256 public okResales;
    bool public lockViolated;

    function resell(uint256 tseed, uint256 buyerSeed, uint256 bump) external {
        _sync();
        uint256 n = tickets.ticketCount();
        if (n == 0) return;
        uint256 t = tseed % n;
        Tickets.Ticket memory tk = tickets.getTicket(t);
        address buyer = fans[buyerSeed % fans.length];
        uint128 price = uint128(uint256(tk.price) * bound(bump, 9_000, 12_000) / 10_000);
        bool started = !tickets.canReceive(tk.showId, address(0xdead)); // started iff a fresh address can't receive
        bool buyerHeld = tickets.heldCount(tk.showId, buyer) > 0;
        vm.prank(tk.holder);
        try tickets.listForResale(t, price) {
            vm.prank(buyer);
            try tickets.buyResale(t, price) {
                ++okResales;
                if (started && !buyerHeld) lockViolated = true;
            } catch { }
        } catch { }
    }

    function gift(uint256 tseed, uint256 toSeed) external {
        _sync();
        uint256 n = tickets.ticketCount();
        if (n == 0) return;
        uint256 t = tseed % n;
        Tickets.Ticket memory tk = tickets.getTicket(t);
        address to = toSeed % 4 == 3 ? address(uint160(0xbeef0000 + toSeed % 7)) : fans[toSeed % fans.length];
        bool started = !tickets.canReceive(tk.showId, address(0xdead));
        bool toHeld = tickets.heldCount(tk.showId, to) > 0;
        vm.prank(tk.holder);
        try tickets.transferTicket(t, to) {
            if (started && !toHeld) lockViolated = true;
        } catch { }
    }

    function showCount() external view returns (uint256) { return showIds.length; }
}

contract ShowsInvariantsTest is Base {
    ShowsHandler h;
    TripVault fund;
    address rogueVenue = makeAddr("rogueVenue");

    function setUp() public override {
        super.setUp();
        fund = _tourFund();
        address[] memory owners = new address[](3);
        owners[0] = venueOax; owners[1] = venueCdmx; owners[2] = rogueVenue;
        uint256[] memory ids = new uint256[](3);
        ids[0] = _venue(venueOax, 3000, 30e6, 10e6);
        ids[1] = _venue(venueCdmx, 0, 40e6, 15e6);
        ids[2] = _venue(rogueVenue, 0, 5e6, 0);
        address[] memory fans_ = new address[](3);
        fans_[0] = traveler; fans_[1] = friend; fans_[2] = fan;
        vm.warp(START);
        h = new ShowsHandler(fund, venues, tickets, attesterPk, owners, ids, fans_, artist);
        for (uint256 i; i < 3; ++i) {
            _fund(fans_[i], 100_000e6);
            vm.prank(fans_[i]);
            usdc.approve(address(tickets), type(uint256).max);
        }
        targetContract(address(h));
    }

    function afterInvariant() public view {
        assertGt(h.okBooks(), 0);
    }

    /// Venues escrow holds exactly the deposits of Booked shows; Tickets escrow holds exactly the
    /// unrefunded gross of unsettled shows; every settled show split conserves its gross.
    function invariant_EscrowsExact() public view {
        uint256 n = venues.showCount();
        uint256 heldDeposits;
        uint256 heldTickets;
        for (uint256 i; i < n; ++i) {
            Venues.Show memory s = venues.getShow(i);
            if (s.status == IVenues.ShowStatus.Booked) heldDeposits += s.deposit;
            (uint128 gross,,,, bool settled, uint128 a, uint128 v, uint128 f) = tickets.sales(i);
            if (!settled) heldTickets += gross;
            else assertEq(uint256(a) + v + f, gross);
        }
        assertEq(usdc.balanceOf(address(venues)), heldDeposits);
        assertEq(usdc.balanceOf(address(tickets)), heldTickets);
    }

    /// no ticket is ever scanned twice
    function invariant_NoDoubleTicketUse() public view {
        uint256 n = tickets.ticketCount();
        for (uint256 i; i < n; ++i) {
            assertLe(h.scansOf(i), 1);
            if (h.scansOf(i) == 1) assertTrue(tickets.getTicket(i).used);
        }
    }

    /// round 3: once check-in starts, no ticket ever moves to someone who held none for that show,
    /// and resale never changes what the escrow owes (covered by EscrowsExact)
    function invariant_NoDoorScalping() public view {
        assertFalse(h.lockViolated());
    }

    /// the tour fund's leash holds: approved venues only, within caps
    function invariant_LeashHolds() public view {
        assertFalse(h.rogueBooked());
        assertEq(usdc.balanceOf(rogueVenue), 0);
        assertLe(fund.vendorSpent(venueOax), fund.vendorCap(venueOax));
        assertLe(fund.vendorSpent(venueCdmx), fund.vendorCap(venueCdmx));
        assertLe(fund.totalSpent(), fund.totalCap());
    }

    /// every show + ticket escrow can always be driven to zero by anyone
    function invariant_AlwaysResolves() public {
        uint256 snap = vm.snapshotState();
        vm.warp(block.timestamp + 60 days);
        uint256 n = venues.showCount();
        for (uint256 i; i < n; ++i) {
            if (venues.getShow(i).status == IVenues.ShowStatus.Booked) venues.expire(i);
            if (venues.getShow(i).status == IVenues.ShowStatus.Played) {
                (,,,, bool settled,,,) = tickets.sales(i);
                if (!settled) tickets.settle(i);
            } else {
                tickets.refundAll(i, 1_000);
            }
        }
        assertEq(usdc.balanceOf(address(venues)), 0);
        assertEq(usdc.balanceOf(address(tickets)), 0);
        assertEq(fund.openBookings(), 0);
        vm.revertToState(snap);
    }
}

contract ShowsHandlerCoverageTest is ShowsInvariantsTest {
    function test_HandlerHappyPathsReachable() public {
        h.book(0, 1, 3);          // Oaxaca show tomorrow 03:00
        h.book(1, 2, 5);          // CDMX
        h.book(2, 3, 5);          // rogue venue -> refused by the leash
        assertEq(h.showCount(), 2);
        h.buy(0, 0, 2);
        h.buy(1, 1, 3);
        h.resell(2, 0, 10_500);   // fan1 resells a CDMX ticket to fan0 at 105%
        h.gift(3, 2);             // before check-in: gifts are free
        assertEq(h.okResales(), 1);
        for (uint256 i; i < 4; ++i) h.warp(8 hours);  // past the Oaxaca showtime
        h.confirm(0);
        h.scan(0);
        h.scan(0);                // second scan of the same ticket fails
        h.settle(0);
        h.venueCancel(1);
        h.refundAll(1);
        assertEq(h.okScans(), 1);
        assertEq(h.okSettles(), 1);
        assertFalse(h.rogueBooked());
        invariant_NoDoorScalping();
        invariant_EscrowsExact();
        invariant_NoDoubleTicketUse();
        invariant_AlwaysResolves();
    }
}
