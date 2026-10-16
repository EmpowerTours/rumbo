// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { Venues } from "../src/Venues.sol";
import { Tickets } from "../src/Tickets.sol";
import { Bookings } from "../src/Bookings.sol";
import { IVenues } from "../src/interfaces/IVenues.sol";

/// Round 3: per-venue / per-host scanner keys, venue accept/decline, host accept, ticket resale.
contract Round3Test is Base {
    uint256 oax;
    uint256 cdmx;
    TripVault fund;
    uint64 showAt;
    uint256 showO;
    uint256 cdmxScannerPk = 0xC0FFEE;
    address cdmxScanner;

    function setUp() public override {
        super.setUp();
        oax = _venue(venueOax, 3000, 50e6, 20e6);
        // CDMX: its OWN scanner key (not the shared test attester), and manual approval
        cdmxScanner = vm.addr(cdmxScannerPk);
        vm.startPrank(venueCdmx);
        cdmx = venues.listVenue(address(usdc), 300, 0, 80e6, 30e6, "Foro Indie", "CDMX", "Roma");
        uint32[] memory d = new uint32[](30);
        for (uint256 i; i < 30; ++i) d[i] = uint32(START / 1 days + i);
        venues.setOpenDates(cdmx, d, true);
        venues.setScanner(cdmx, cdmxScanner, true);
        venues.setManualApproval(cdmx, true);
        vm.stopPrank();
        fund = _tourFund();
        vm.warp(START);
        showAt = uint64(START + 2 days + 20 hours);
        vm.prank(artist);
        showO = fund.bookVenue(oax, showAt, 20e6, 50, "Lumbre live Oaxaca");
    }

    // ------------------------------------------------------------ helpers
    function _signAs(uint256 pk, bytes32 domain, bytes32 structHash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _showSig(uint256 pk, uint256 show, uint8 outcome, uint64 at) internal view returns (bytes memory) {
        return _signAs(pk, venues.domainSeparator(), keccak256(abi.encode(venues.SHOW_TYPEHASH(), show, outcome, at)));
    }

    function _scanSig(uint256 pk, uint256 ticket, address holder, uint64 at) internal view returns (bytes memory) {
        return _signAs(pk, tickets.domainSeparator(), keccak256(abi.encode(tickets.SCAN_TYPEHASH(), ticket, holder, at)));
    }

    function _buy(address who, uint256 show, uint32 qty) internal returns (uint256 first) {
        IVenues.ShowInfo memory s = venues.showInfo(show);
        vm.startPrank(who);
        usdc.approve(address(tickets), uint256(s.ticketPrice) * qty);
        first = tickets.buy(show, qty, uint256(s.ticketPrice) * qty);
        vm.stopPrank();
    }

    function _bookCdmx() internal returns (uint256 show) {
        vm.prank(artist);
        show = fund.bookVenue(cdmx, showAt + 1 days, 15e6, 100, "Lumbre live CDMX");
    }

    // ------------------------------------------------------------ per-venue scanners
    function test_VenueScanner_OnlyThatVenuesKeysSign() public {
        uint256 c = _bookCdmx();
        vm.prank(venueCdmx);
        venues.acceptShow(c);
        uint64 at = showAt + 1 days;
        vm.warp(at + 1);
        // the Oaxaca venue's scanner (the shared test attester) is NOT a CDMX scanner
        bytes memory wrong = _signShow(c, 1, at);
        vm.expectRevert(Venues.BadAttestation.selector);
        venues.confirmShow(c, at, wrong);
        venues.confirmShow(c, at, _showSig(cdmxScannerPk, c, 1, at));
        assertEq(uint8(venues.showInfo(c).status), uint8(IVenues.ShowStatus.Played));
    }

    function test_VenueScanner_OwnerOnlyAndRevocable() public {
        vm.prank(stranger);
        vm.expectRevert(Venues.NotVenueOwner.selector);
        venues.setScanner(oax, stranger, true);
        vm.prank(venueOax);
        venues.setScanner(oax, attester, false);
        assertFalse(venues.isScanner(oax, attester));
        vm.warp(showAt + 1);
        bytes memory sig = _signShow(showO, 1, showAt);
        vm.expectRevert(Venues.BadAttestation.selector);
        venues.confirmShow(showO, showAt, sig);
    }

    function test_TicketScan_RequiresShowsVenueScanner() public {
        uint256 t = _buy(fan, showO, 1);
        vm.warp(showAt);
        bytes memory foreign = _scanSig(cdmxScannerPk, t, fan, showAt);
        vm.expectRevert(Tickets.BadAttestation.selector);
        tickets.scan(t, showAt, foreign);
        tickets.scan(t, showAt, _signScan(t, fan, showAt));
        assertTrue(tickets.getTicket(t).used);
    }

    function test_HostScanner_PerHost() public {
        uint256 l = _listing(guide, Bookings.Kind.Tour, 30e6); // guide registers `attester`
        vm.prank(hostB);
        uint256 l2 = bookings.createListing(Bookings.Kind.Stay, address(usdc), 40e6, 4, 1 days, "Casita", "Oaxaca");
        uint64 s = uint64(block.timestamp + 1 days);
        vm.startPrank(traveler);
        usdc.approve(address(bookings), 70e6);
        bookings.book(l, 1, s, 30e6);
        uint256 b2 = bookings.book(l2, 1, s, 40e6);
        vm.stopPrank();
        vm.warp(s + 1 hours);
        // hostB has registered no scanner: the guide's scanner key cannot release hostB's escrow
        bytes memory sig = _signCheckIn(b2, traveler, s + 10, attesterPk);
        vm.expectRevert(Bookings.BadAttestation.selector);
        bookings.confirmWithAttestation(b2, s + 10, sig);
        vm.prank(hostB);
        bookings.setScanner(attester, true);
        bookings.confirmWithAttestation(b2, s + 10, sig);
        assertEq(uint8(bookings.getBooking(b2).status), uint8(Bookings.Status.Released));
    }

    // ------------------------------------------------------------ venue accept / decline
    function test_ManualApproval_NoSalesUntilAccepted() public {
        uint256 c = _bookCdmx();
        assertTrue(venues.awaitingApproval(c));
        vm.startPrank(fan);
        usdc.approve(address(tickets), 15e6);
        vm.expectRevert(Tickets.AwaitingApproval.selector);
        tickets.buy(c, 1, 15e6);
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert(Venues.NotVenueOwner.selector);
        venues.acceptShow(c);
        vm.prank(venueCdmx);
        venues.acceptShow(c);
        assertFalse(venues.awaitingApproval(c));
        _buy(fan, c, 1);
        vm.prank(venueCdmx);
        vm.expectRevert(Venues.NotPending.selector);
        venues.acceptShow(c);
    }

    function test_Decline_FullRefundNotCountedLeashRestored() public {
        uint256 c = _bookCdmx();
        assertEq(fund.vendorSpent(venueCdmx), 80e6);
        uint256 before = fund.totalAssets();
        vm.prank(venueCdmx);
        venues.declineShow(c);
        assertEq(fund.vendorSpent(venueCdmx), 0);
        assertEq(fund.totalAssets(), before + 80e6);
        (, uint32 cancelled,) = venues.reliability(cdmx);
        assertEq(cancelled, 0);
        assertEq(fund.openBookings(), 1); // only the Oaxaca show remains open
    }

    function test_ArtistWithdrawsPendingRequest_NoFee() public {
        uint256 c = _bookCdmx();
        uint256 venueBal = usdc.balanceOf(venueCdmx);
        vm.prank(artist);
        fund.cancelShow(c);
        assertEq(usdc.balanceOf(venueCdmx), venueBal);
        assertEq(fund.vendorSpent(venueCdmx), 0);
    }

    function test_PendingCannotBeConfirmed_ButExpires() public {
        uint256 c = _bookCdmx();
        uint64 at = showAt + 1 days;
        vm.warp(at + 1);
        bytes memory sig = _showSig(cdmxScannerPk, c, 1, at);
        vm.expectRevert(Venues.AwaitingApproval.selector);
        venues.confirmShow(c, at, sig);
        vm.warp(at + 3 days + 1);
        venues.expire(c);
        assertEq(fund.vendorSpent(venueCdmx), 0);
    }

    // ------------------------------------------------------------ host accept
    function test_HostAccept_RecordedOnCancel() public {
        uint256 l = _listing(hostA, Bookings.Kind.Stay, 50e6);
        uint64 s = uint64(block.timestamp + 2 days);
        vm.startPrank(traveler);
        usdc.approve(address(bookings), 50e6);
        uint256 id = bookings.book(l, 1, s, 50e6);
        vm.stopPrank();
        vm.prank(guide);
        vm.expectRevert(Bookings.NotHost.selector);
        bookings.acceptBooking(id);
        vm.startPrank(hostA);
        bookings.acceptBooking(id);
        vm.expectRevert(Bookings.AlreadyAccepted.selector);
        bookings.acceptBooking(id);
        bookings.hostCancel(id);
        vm.stopPrank();
        assertEq(bookings.cancelsAfterAccept(hostA), 1);
        assertEq(usdc.balanceOf(traveler), 10_000e6);
    }

    // ------------------------------------------------------------ resale
    function test_Resale_CapFeeRoyaltySeller() public {
        uint256 t = _buy(friend, showO, 1); // face 20
        vm.startPrank(friend);
        vm.expectRevert(abi.encodeWithSelector(Tickets.PriceAboveCap.selector, 22e6 + 1, 22e6));
        tickets.listForResale(t, 22e6 + 1);
        tickets.listForResale(t, 22e6);
        vm.stopPrank();
        uint256 escrow = usdc.balanceOf(address(tickets));
        uint256 fBefore = usdc.balanceOf(friend);
        uint256 aBefore = usdc.balanceOf(artist);
        uint256 trBefore = usdc.balanceOf(treasury);
        vm.startPrank(fan);
        usdc.approve(address(tickets), 22e6);
        vm.expectRevert(abi.encodeWithSelector(Tickets.PriceAboveMax.selector, 22e6, 21e6));
        tickets.buyResale(t, 21e6);
        tickets.buyResale(t, 22e6);
        vm.stopPrank();
        uint256 fee = 22e6 * 400 / 10_000;      // 0.88
        uint256 royalty = 22e6 * 500 / 10_000;  // 1.10
        assertEq(usdc.balanceOf(treasury) - trBefore, fee);
        assertEq(usdc.balanceOf(artist) - aBefore, royalty);
        assertEq(usdc.balanceOf(friend) - fBefore, 22e6 - fee - royalty);
        assertEq(usdc.balanceOf(address(tickets)), escrow); // escrow still holds face value
        assertEq(tickets.getTicket(t).holder, fan);
        assertEq(tickets.askPrice(t), 0);
        assertEq(tickets.heldCount(showO, fan), 1);
        assertEq(tickets.heldCount(showO, friend), 0);
    }

    function test_Resale_CancelledShowRefundsFaceToNewHolder() public {
        uint256 t = _buy(friend, showO, 1);
        vm.prank(friend);
        tickets.listForResale(t, 21e6);
        vm.startPrank(fan);
        usdc.approve(address(tickets), 21e6);
        tickets.buyResale(t, 21e6);
        vm.stopPrank();
        vm.prank(venueOax);
        venues.venueCancel(showO);
        uint256 b = usdc.balanceOf(fan);
        tickets.refund(t);
        assertEq(usdc.balanceOf(fan) - b, 20e6);
    }

    function test_Transfer_BlockedToNonHoldersOnceCheckInStarts() public {
        uint256 a = _buy(friend, showO, 2);
        uint256 f = _buy(fan, showO, 1);
        vm.prank(friend);
        tickets.transferTicket(a, stranger); // before check-in: anyone
        assertEq(tickets.getTicket(a).holder, stranger);
        vm.warp(showAt);
        tickets.scan(f, showAt, _signScan(f, fan, showAt)); // check-in starts
        vm.startPrank(friend);
        vm.expectRevert(Tickets.TransferLocked.selector);
        tickets.transferTicket(a + 1, guide);           // non-holder: blocked
        tickets.transferTicket(a + 1, fan);             // fan already holds a ticket: allowed
        vm.stopPrank();
        assertEq(tickets.getTicket(a + 1).holder, fan);
        // resale to a non-holder is blocked the same way
        vm.prank(stranger);
        tickets.listForResale(a, 20e6);
        vm.startPrank(guide);
        usdc.approve(address(tickets), 20e6);
        vm.expectRevert(Tickets.TransferLocked.selector);
        tickets.buyResale(a, 20e6);
        vm.stopPrank();
    }

    function test_Resale_UsedOrPlayedNotTransferable_ScanClearsListing() public {
        uint256 t = _buy(friend, showO, 2);
        vm.prank(friend);
        tickets.listForResale(t, 20e6);
        vm.warp(showAt);
        tickets.scan(t, showAt, _signScan(t, friend, showAt));
        assertEq(tickets.askPrice(t), 0);
        vm.startPrank(friend);
        vm.expectRevert(Tickets.AlreadyUsed.selector);
        tickets.listForResale(t, 20e6);
        vm.stopPrank();
        vm.warp(showAt + 1);
        venues.confirmShow(showO, showAt, _signShow(showO, 1, showAt));
        vm.prank(friend);
        vm.expectRevert(Tickets.NotOnSale.selector);
        tickets.transferTicket(t + 1, fan);
        vm.prank(stranger);
        vm.expectRevert(Tickets.NotHolder.selector);
        tickets.cancelResale(t);
    }

    function test_ResaleConfig_Bounds() public {
        vm.startPrank(admin);
        vm.expectRevert(Tickets.BadConfig.selector);
        tickets.setResaleConfig(9_999, 500);
        vm.expectRevert(Tickets.BadConfig.selector);
        tickets.setResaleConfig(15_001, 500);
        vm.expectRevert(Tickets.BadConfig.selector);
        tickets.setResaleConfig(11_000, 2_001);
        tickets.setResaleConfig(10_000, 0);
        vm.stopPrank();
        uint256 t = _buy(friend, showO, 1);
        vm.prank(friend);
        vm.expectRevert(abi.encodeWithSelector(Tickets.PriceAboveCap.selector, 20e6 + 1, 20e6));
        tickets.listForResale(t, 20e6 + 1);
    }

    function testFuzz_Resale_ConservesAndCaps(uint128 price, uint16 royalty) public {
        royalty = uint16(bound(royalty, 0, 2_000));
        vm.prank(admin);
        tickets.setResaleConfig(11_000, royalty);
        uint256 t = _buy(friend, showO, 1);
        price = uint128(bound(price, 1, 30e6));
        vm.prank(friend);
        if (price > 22e6) {
            vm.expectRevert(abi.encodeWithSelector(Tickets.PriceAboveCap.selector, price, 22e6));
            tickets.listForResale(t, price);
            return;
        }
        tickets.listForResale(t, price);
        uint256 total = usdc.balanceOf(friend) + usdc.balanceOf(artist) + usdc.balanceOf(treasury) + usdc.balanceOf(fan);
        uint256 escrow = usdc.balanceOf(address(tickets));
        vm.startPrank(fan);
        usdc.approve(address(tickets), price);
        tickets.buyResale(t, price);
        vm.stopPrank();
        assertEq(usdc.balanceOf(friend) + usdc.balanceOf(artist) + usdc.balanceOf(treasury) + usdc.balanceOf(fan), total);
        assertEq(usdc.balanceOf(address(tickets)), escrow);
    }
}
