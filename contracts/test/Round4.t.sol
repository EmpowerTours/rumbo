// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { Venues } from "../src/Venues.sol";
import { Tickets } from "../src/Tickets.sol";
import { Bookings } from "../src/Bookings.sol";
import { IVenues } from "../src/interfaces/IVenues.sol";

/// Round 4 (Rumbo partner flows): listing metadata/edit/pause/delete, host & artist profiles, venue
/// profile in one tx, an artist's direct date request + `openSales`, and the no-show claim from a
/// request that went through the new path.
contract Round4Test is Base {
    string constant META = "local:sha256:1111111111111111111111111111111111111111111111111111111111111111";
    string constant META2 = "local:sha256:2222222222222222222222222222222222222222222222222222222222222222";

    function _newListing() internal returns (uint256 id) {
        vm.prank(hostA);
        id = bookings.createListingWithMeta(Bookings.Kind.Stay, address(usdc), 40e6, 2, 1 days, "Casa Nueva", "Jalatlaco, Oaxaca", META);
    }

    function _book(uint256 id, uint32 units, uint256 amt) internal returns (uint256 b) {
        vm.startPrank(traveler);
        usdc.approve(address(bookings), amt);
        b = bookings.book(id, units, uint64(block.timestamp + 2 days), amt);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ listings
    function test_CreateWithMeta_StoresUriAndIsBookable() public {
        uint256 id = _newListing();
        assertEq(bookings.listingMeta(id), META);
        Bookings.Listing memory l = bookings.getListing(id);
        assertEq(l.host, hostA);
        assertTrue(l.active);
        uint256 b = _book(id, 2, 80e6);
        assertEq(bookings.getBooking(b).amount, 80e6);
    }

    function test_Edit_OnlyHost_AppliesToFutureBookingsOnly() public {
        uint256 id = _newListing();
        uint256 b0 = _book(id, 1, 40e6);
        vm.prank(stranger);
        vm.expectRevert(Bookings.NotHost.selector);
        bookings.editListing(id, 50e6, 3, 2 days, "x", "y", META2);
        vm.startPrank(hostA);
        vm.expectRevert(Bookings.BadConfig.selector);
        bookings.editListing(id, 0, 3, 2 days, "Casa Nueva", "Jalatlaco, Oaxaca", META2);
        vm.expectRevert(Bookings.BadConfig.selector);
        bookings.editListing(id, 50e6, 0, 2 days, "Casa Nueva", "Jalatlaco, Oaxaca", META2);
        bookings.editListing(id, 50e6, 3, 2 days, "Casa Nueva II", "Jalatlaco, Oaxaca", META2);
        vm.stopPrank();
        Bookings.Listing memory l = bookings.getListing(id);
        assertEq(l.pricePerUnit, 50e6);
        assertEq(l.maxUnits, 3);
        assertEq(l.title, "Casa Nueva II");
        assertEq(bookings.listingMeta(id), META2);
        // the earlier booking keeps its snapshot (40 USDC, 1-day window)
        assertEq(bookings.getBooking(b0).amount, 40e6);
        assertEq(bookings.getBooking(b0).cancelWindow, 1 days);
        _book(id, 3, 150e6);
    }

    function test_Pause_BlocksBooking_ResumeReopens() public {
        uint256 id = _newListing();
        vm.prank(hostA);
        bookings.updateListing(id, 40e6, false);
        vm.startPrank(traveler);
        usdc.approve(address(bookings), 40e6);
        vm.expectRevert(Bookings.Inactive.selector);
        bookings.book(id, 1, uint64(block.timestamp + 1 days), 40e6);
        vm.stopPrank();
        vm.prank(hostA);
        bookings.updateListing(id, 40e6, true);
        _book(id, 1, 40e6);
    }

    function test_Remove_IsPermanent_ButEscrowStillResolves() public {
        uint256 id = _newListing();
        uint256 b = _book(id, 1, 40e6);
        vm.prank(stranger);
        vm.expectRevert(Bookings.NotHost.selector);
        bookings.removeListing(id);
        vm.startPrank(hostA);
        bookings.removeListing(id);
        assertTrue(bookings.removed(id));
        vm.expectRevert(Bookings.Removed.selector);
        bookings.updateListing(id, 40e6, true);
        vm.expectRevert(Bookings.Removed.selector);
        bookings.editListing(id, 40e6, 1, 0, "a", "b", META);
        vm.expectRevert(Bookings.Removed.selector);
        bookings.removeListing(id);
        vm.stopPrank();
        vm.expectRevert(Bookings.Inactive.selector);
        bookings.quote(id, 1);
        // the held booking still resolves: the host can refund it
        uint256 before = usdc.balanceOf(traveler);
        vm.prank(hostA);
        bookings.hostCancel(b);
        assertEq(usdc.balanceOf(traveler), before + 40e6);
    }

    function test_HostProfile() public {
        vm.prank(guide);
        bookings.setHostProfile(META);
        assertEq(bookings.hostProfile(guide), META);
    }

    // ------------------------------------------------------------ venues & artists
    function _venueWithMeta(bool manual) internal returns (uint256 id) {
        vm.startPrank(venueCdmx);
        id = venues.listVenueWithMeta(address(usdc), 150, 3000, 40e6, 15e6, "Foro Nuevo", "Ciudad de Mexico", "Roma Norte", manual, META);
        uint32[] memory d = new uint32[](10);
        for (uint256 i; i < 10; ++i) d[i] = uint32(block.timestamp / 1 days + i);
        venues.setOpenDates(id, d, true);
        venues.setScanner(id, attester, true);
        vm.stopPrank();
    }

    function test_VenueWithMeta_OneTx_ManualAndMeta() public {
        uint256 id = _venueWithMeta(true);
        assertTrue(venues.manualApproval(id));
        assertEq(venues.venueMeta(id), META);
        vm.expectRevert(Venues.BadConfig.selector);
        vm.prank(venueCdmx);
        venues.listVenueWithMeta(address(usdc), 0, 3000, 40e6, 15e6, "x", "y", "z", false, META);
        vm.prank(stranger);
        vm.expectRevert(Venues.NotVenueOwner.selector);
        venues.setVenueMeta(id, META2);
    }

    function _request(uint256 vid, uint64 at) internal returns (uint256 show) {
        vm.startPrank(artist);
        usdc.approve(address(venues), 40e6);
        show = venues.bookShow(vid, at, 0, 0, "Lumbre (date request)", 40e6); // no ticket terms yet
        vm.stopPrank();
    }

    function test_ArtistDirectRequest_ThenOpenSales_ThenFullCycle() public {
        vm.prank(artist);
        venues.setArtistProfile(META);
        assertEq(venues.artistProfile(artist), META);
        uint256 vid = _venueWithMeta(true);
        uint64 at = uint64(block.timestamp + 2 days);
        uint256 show = _request(vid, at);
        assertEq(usdc.balanceOf(address(venues)), 40e6); // deposit escrowed from the artist's own wallet
        // no tickets before terms; no terms while pending
        vm.startPrank(fan);
        usdc.approve(address(tickets), 100e6);
        vm.expectRevert(Tickets.NotOnSale.selector);
        tickets.buy(show, 1, 100e6);
        vm.stopPrank();
        vm.prank(artist);
        vm.expectRevert(Venues.AwaitingApproval.selector);
        venues.openSales(show, 10e6, 100, "Lumbre live");
        vm.prank(venueCdmx);
        venues.acceptShow(show);
        // only the artist; within capacity; non-zero
        vm.prank(stranger);
        vm.expectRevert(Venues.NotArtist.selector);
        venues.openSales(show, 10e6, 100, "Lumbre live");
        vm.startPrank(artist);
        vm.expectRevert(Venues.TooManyTickets.selector);
        venues.openSales(show, 10e6, 151, "Lumbre live");
        vm.expectRevert(Venues.BadConfig.selector);
        venues.openSales(show, 0, 100, "Lumbre live");
        venues.openSales(show, 10e6, 100, "Lumbre live");
        vm.expectRevert(Venues.AlreadyOnSale.selector);
        venues.openSales(show, 1e6, 100, "cheaper");
        vm.stopPrank();
        Venues.Show memory sh = venues.getShow(show);
        assertEq(sh.ticketPrice, 10e6);
        assertEq(sh.maxTickets, 100);
        assertEq(sh.title, "Lumbre live");
        // buy, door scan, confirm, settle
        vm.prank(fan);
        uint256 t = tickets.buy(show, 2, 20e6);
        vm.warp(at);
        tickets.scan(t, at, _signScan(t, fan, at));
        venues.confirmShow(show, at, _signShow(show, 1, at));
        uint256 a0 = usdc.balanceOf(artist);
        tickets.settle(show);
        (uint256 fee, uint256 toVenue, uint256 toArtist) = tickets.splitOf(20e6, 400, 3000);
        assertEq(usdc.balanceOf(artist) - a0, toArtist);
        assertEq(fee + toVenue + toArtist, 20e6);
    }

    function test_OpenSales_RefusedAfterShowtimeOrWhenClosed() public {
        uint256 vid = _venueWithMeta(false);
        uint64 at = uint64(block.timestamp + 1 days);
        uint256 show = _request(vid, at);
        vm.warp(at);
        vm.prank(artist);
        vm.expectRevert(Venues.TooLate.selector);
        venues.openSales(show, 10e6, 10, "late");
        uint256 show2 = _request(vid, at + 1 days);
        vm.prank(venueCdmx);
        venues.venueCancel(show2);
        vm.prank(artist);
        vm.expectRevert(Venues.NotBooked.selector);
        venues.openSales(show2, 10e6, 10, "closed");
    }

    function test_NoShowClaim_OnDirectRequest_VenueKeepsCancelFee() public {
        uint256 vid = _venueWithMeta(false);
        uint64 at = uint64(block.timestamp + 1 days);
        uint256 show = _request(vid, at);
        vm.prank(artist);
        venues.openSales(show, 10e6, 10, "Lumbre live");
        vm.prank(fan);
        usdc.approve(address(tickets), 10e6);
        vm.prank(fan);
        uint256 t = tickets.buy(show, 1, 10e6);
        // too early: before showtime
        bytes memory early = _signShow(show, 2, at);
        vm.expectRevert(Venues.TooEarly.selector);
        venues.claimArtistNoShow(show, at, early);
        vm.warp(at + 1 hours);
        uint256 v0 = usdc.balanceOf(venueCdmx);
        uint256 a0 = usdc.balanceOf(artist);
        bytes memory sig = _signShow(show, 2, at + 1 hours);
        venues.claimArtistNoShow(show, at + 1 hours, sig);
        assertEq(uint8(venues.showInfo(show).status), uint8(IVenues.ShowStatus.ArtistNoShow));
        assertEq(usdc.balanceOf(venueCdmx) - v0, 15e6);
        assertEq(usdc.balanceOf(artist) - a0, 25e6);
        assertEq(venues.artistNoShowCount(artist), 1);
        // fans get their money back
        uint256 f0 = usdc.balanceOf(fan);
        tickets.refund(t);
        assertEq(usdc.balanceOf(fan) - f0, 10e6);
    }
}
