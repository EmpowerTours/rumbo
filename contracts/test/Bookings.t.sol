// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { Bookings } from "../src/Bookings.sol";

contract BookingsTest is Base {
    uint256 tour;
    uint256 stay;

    function setUp() public override {
        super.setUp();
        tour = _listing(guide, Bookings.Kind.Tour, 45e6);
        stay = _listing(hostA, Bookings.Kind.Stay, 60e6);
    }

    function _bookDirect(address payer, uint256 listing, uint32 units, uint64 startAt) internal returns (uint256 id) {
        (,, uint256 amt) = bookings.quote(listing, units);
        vm.startPrank(payer);
        usdc.approve(address(bookings), amt);
        id = bookings.book(listing, units, startAt, amt);
        vm.stopPrank();
    }

    function test_Listing_CreateQuoteUpdate() public {
        (address h, address a, uint256 amt) = bookings.quote(stay, 3);
        assertEq(h, hostA);
        assertEq(a, address(usdc));
        assertEq(amt, 180e6);
        vm.expectRevert(Bookings.BadUnits.selector);
        bookings.quote(stay, 5);
        vm.prank(stranger);
        vm.expectRevert(Bookings.NotHost.selector);
        bookings.updateListing(stay, 1, true);
        vm.prank(hostA);
        bookings.updateListing(stay, 70e6, false);
        vm.expectRevert(Bookings.Inactive.selector);
        bookings.quote(stay, 1);
    }

    function test_Book_PriceProtection() public {
        vm.startPrank(traveler);
        usdc.approve(address(bookings), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(Bookings.PriceAboveMax.selector, 120e6, 100e6));
        bookings.book(stay, 2, uint64(block.timestamp + 1 days), 100e6);
        vm.expectRevert(Bookings.BadStart.selector);
        bookings.book(stay, 1, uint64(block.timestamp + 401 days), 60e6);
        vm.stopPrank();
    }

    function test_Release_ByPayer_PaysHostAndFee() public {
        uint64 s = uint64(block.timestamp + 1 days);
        uint256 id = _bookDirect(traveler, stay, 2, s);
        assertEq(usdc.balanceOf(address(bookings)), 120e6);
        vm.prank(traveler);
        vm.expectRevert(Bookings.TooEarly.selector);
        bookings.confirmCheckIn(id);
        vm.warp(s);
        vm.prank(stranger);
        vm.expectRevert(Bookings.NotPayer.selector);
        bookings.confirmCheckIn(id);
        uint256 h0 = usdc.balanceOf(hostA);
        vm.prank(traveler);
        bookings.confirmCheckIn(id);
        assertEq(usdc.balanceOf(hostA) - h0, 116.4e6); // 3% fee
        assertEq(usdc.balanceOf(treasury), 3.6e6);
        assertEq(usdc.balanceOf(address(bookings)), 0);
        assertEq(uint8(bookings.getBooking(id).status), uint8(Bookings.Status.Released));
        vm.prank(traveler);
        vm.expectRevert(Bookings.NotHeld.selector);
        bookings.confirmCheckIn(id);
    }

    function test_Release_ByAttestation() public {
        uint64 s = uint64(block.timestamp + 1 days);
        uint256 id = _bookDirect(traveler, tour, 1, s);
        vm.warp(s + 1 hours);
        bytes memory bad = _signCheckIn(id, traveler, s + 10, 0xBAD);
        vm.expectRevert(Bookings.BadAttestation.selector);
        bookings.confirmWithAttestation(id, s + 10, bad);
        bytes memory sig = _signCheckIn(id, traveler, s + 10, attesterPk);
        vm.prank(guide); // host can submit the proof itself
        bookings.confirmWithAttestation(id, s + 10, sig);
        assertEq(uint8(bookings.getBooking(id).status), uint8(Bookings.Status.Released));
    }

    function test_FeeSnapshot_AdminCannotRaiseAfterBooking() public {
        uint64 s = uint64(block.timestamp + 1 days);
        uint256 id = _bookDirect(traveler, stay, 1, s);
        vm.prank(admin);
        bookings.setConfig(treasury, 500, 2 days);
        vm.warp(s);
        vm.prank(traveler);
        bookings.confirmCheckIn(id);
        assertEq(usdc.balanceOf(treasury), 1.8e6); // still 3%
        vm.prank(admin);
        vm.expectRevert(Bookings.BadConfig.selector);
        bookings.setConfig(treasury, 501, 2 days);
    }

    function test_HostCancel_RefundsFull() public {
        uint256 id = _bookDirect(traveler, stay, 2, uint64(block.timestamp + 3 days));
        uint256 b0 = usdc.balanceOf(traveler);
        vm.prank(stranger);
        vm.expectRevert(Bookings.NotHost.selector);
        bookings.hostCancel(id);
        vm.prank(hostA);
        bookings.hostCancel(id);
        assertEq(usdc.balanceOf(traveler) - b0, 120e6);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_TravelerCancel_OnlyInsideWindow() public {
        uint64 s = uint64(block.timestamp + 3 days);
        uint256 id = _bookDirect(traveler, stay, 1, s);
        vm.warp(s - 2 days + 1);
        vm.prank(traveler);
        vm.expectRevert(Bookings.WindowClosed.selector);
        bookings.travelerCancel(id);
        uint256 id2 = _bookDirect(traveler, stay, 1, uint64(block.timestamp + 5 days));
        vm.prank(traveler);
        bookings.travelerCancel(id2);
        assertEq(uint8(bookings.getBooking(id2).status), uint8(Bookings.Status.Refunded));
    }

    function test_NoShow_AnyoneRefundsAfterTimeout() public {
        uint64 s = uint64(block.timestamp + 1 days);
        uint256 id = _bookDirect(traveler, tour, 2, s);
        vm.warp(s + 2 days);
        vm.expectRevert(Bookings.TooEarly.selector);
        bookings.claimNoShowRefund(id);
        vm.warp(s + 2 days + 1);
        uint256 b0 = usdc.balanceOf(traveler);
        vm.prank(stranger);
        bookings.claimNoShowRefund(id);
        assertEq(usdc.balanceOf(traveler) - b0, 90e6);
        // terminal: nothing else can happen
        vm.prank(guide);
        vm.expectRevert(Bookings.NotHeld.selector);
        bookings.hostCancel(id);
    }

    function test_Review_OnlyAfterReleaseOnceByPayer() public {
        uint64 s = uint64(block.timestamp + 1 days);
        uint256 id = _bookDirect(traveler, tour, 1, s);
        bytes32 h = keccak256("Great guide, knew every mezcal spot");
        vm.prank(traveler);
        vm.expectRevert(Bookings.NotReleased.selector);
        bookings.anchorReview(id, 5, h);
        vm.warp(s);
        vm.prank(traveler);
        bookings.confirmCheckIn(id);
        vm.prank(stranger);
        vm.expectRevert(Bookings.NotReviewer.selector);
        bookings.anchorReview(id, 5, h);
        vm.prank(traveler);
        vm.expectRevert(Bookings.BadRating.selector);
        bookings.anchorReview(id, 6, h);
        vm.prank(traveler);
        bookings.anchorReview(id, 5, h);
        vm.prank(traveler);
        vm.expectRevert(Bookings.AlreadyReviewed.selector);
        bookings.anchorReview(id, 1, h);
        Bookings.Listing memory l = bookings.getListing(tour);
        assertEq(l.reviewCount, 1);
        assertEq(l.ratingSum, 5);
        assertEq(l.completed, 1);
        assertEq(bookings.getBooking(id).reviewHash, h);
    }

    function test_VaultFlow_BookConfirmReviewByOwner() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 400e6, traveler);
        vm.warp(START);
        vm.prank(traveler);
        uint256 id = v.book(tour, 2, uint64(block.timestamp));
        vm.prank(traveler);
        v.confirmCheckIn(id);
        assertEq(v.openBookings(), 0);
        assertEq(v.totalSpent(), 90e6); // released: spend stays counted
        vm.prank(traveler);
        bookings.anchorReview(id, 4, keccak256("solid"));
        assertEq(usdc.balanceOf(guide), 10_000e6 + 87.3e6);
    }

    function test_CallbackGasGriefing_Reverts() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 400e6, traveler);
        vm.warp(START);
        vm.prank(traveler);
        uint256 id = v.book(stay, 1, uint64(block.timestamp));
        vm.prank(hostA);
        (bool ok,) = address(bookings).call{ gas: 150_000 }(abi.encodeCall(Bookings.hostCancel, (id)));
        assertFalse(ok);
        assertEq(uint8(bookings.getBooking(id).status), uint8(Bookings.Status.Held));
        assertEq(v.openBookings(), 1);
    }

    function testFuzz_EscrowAlwaysResolves(uint8 action, uint32 dt, uint8 units) public {
        units = uint8(bound(units, 1, 4));
        uint64 s = uint64(block.timestamp + 1 days);
        uint256 id = _bookDirect(traveler, stay, units, s);
        uint256 amt = uint256(units) * 60e6;
        vm.warp(block.timestamp + bound(dt, 0, 10 days));
        uint256 a = action % 4;
        if (a == 0) { vm.prank(hostA); bookings.hostCancel(id); }
        else if (a == 1 && block.timestamp >= s) { vm.prank(traveler); bookings.confirmCheckIn(id); }
        else if (a == 2 && block.timestamp + 2 days <= s) { vm.prank(traveler); bookings.travelerCancel(id); }
        // whatever happened, after the timeout the booking is terminal or can be made terminal
        vm.warp(s + 2 days + 1);
        if (bookings.getBooking(id).status == Bookings.Status.Held) bookings.claimNoShowRefund(id);
        Bookings.Status st = bookings.getBooking(id).status;
        assertTrue(st == Bookings.Status.Released || st == Bookings.Status.Refunded);
        assertEq(usdc.balanceOf(address(bookings)), 0);
        // value conserved: traveler + host + treasury
        assertEq(usdc.balanceOf(traveler) + usdc.balanceOf(hostA) + usdc.balanceOf(treasury), 10_000e6);
        amt;
    }
}
