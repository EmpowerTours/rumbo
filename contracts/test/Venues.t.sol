// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { Venues } from "../src/Venues.sol";
import { IVenues } from "../src/interfaces/IVenues.sol";
import { ITripVault } from "../src/interfaces/ITripVault.sol";

contract VenuesTest is Base {
    uint256 oax;
    uint256 cdmx;
    uint256 rogue;
    TripVault fund;
    uint64 showAt;

    function setUp() public override {
        super.setUp();
        oax = _venue(venueOax, 3000, 50e6, 20e6);      // 70/30 split, 50 deposit, 20 cancel fee
        cdmx = _venue(venueCdmx, 0, 80e6, 30e6);       // flat fee 80
        rogue = _venue(stranger, 0, 10e6, 0);          // not on the leash
        fund = _tourFund();
        vm.warp(START);
        showAt = uint64(START + 2 days + 20 hours);
    }

    function _book(uint256 venueId, uint64 at) internal returns (uint256 id) {
        vm.prank(artist);
        id = fund.bookVenue(venueId, at, 12e6, 100, "Lumbre live");
    }

    function test_ListVenue_TermsValidated() public {
        vm.startPrank(venueOax);
        vm.expectRevert(Venues.BadConfig.selector);
        venues.listVenue(address(usdc), 100, 3000, 10e6, 11e6, "x", "x", "x"); // cancel fee > deposit
        vm.expectRevert(Venues.BadConfig.selector);
        venues.listVenue(address(usdc), 0, 3000, 10e6, 1e6, "x", "x", "x");
        vm.expectRevert(Venues.BadConfig.selector);
        venues.listVenue(address(usdc), 100, 10_001, 10e6, 1e6, "x", "x", "x");
        vm.stopPrank();
        uint32[] memory d = new uint32[](1);
        vm.prank(stranger);
        vm.expectRevert(Venues.NotVenueOwner.selector);
        venues.setOpenDates(oax, d, true);
    }

    function test_Book_DepositEscrowedAndLeashCharged() public {
        uint256 id = _book(oax, showAt);
        assertEq(usdc.balanceOf(address(venues)), 50e6);
        assertEq(fund.vendorSpent(venueOax), 50e6);
        assertEq(fund.openBookings(), 1);
        Venues.Show memory s = venues.getShow(id);
        assertEq(s.artist, artist);
        assertEq(s.payer, address(fund));
        assertEq(uint8(s.status), uint8(IVenues.ShowStatus.Booked));
        assertEq(venues.bookedOn(oax, uint32(showAt / 1 days)), id + 1);
    }

    function test_Book_DateRules() public {
        vm.prank(artist);
        vm.expectRevert(abi.encodeWithSelector(Venues.NotOpen.selector, uint32((START + 90 days) / 1 days)));
        fund.bookVenue(oax, uint64(START + 90 days), 12e6, 100, "x");
        _book(oax, showAt);
        vm.prank(artist);
        vm.expectRevert(abi.encodeWithSelector(Venues.AlreadyBooked.selector, uint32(showAt / 1 days)));
        fund.bookVenue(oax, showAt + 1, 12e6, 100, "x");
        vm.prank(artist);
        vm.expectRevert(Venues.TooManyTickets.selector);
        fund.bookVenue(oax, showAt + 1 days, 12e6, 201, "x");
        vm.prank(artist);
        vm.expectRevert(Venues.BadShowTime.selector);
        fund.bookVenue(oax, uint64(block.timestamp), 12e6, 100, "x");
    }

    function test_Leash_OnlyApprovedVenuesWithinCaps() public {
        vm.prank(artist);
        vm.expectRevert(abi.encodeWithSelector(TripVault.NotApprovedVendor.selector, stranger));
        fund.bookVenue(rogue, showAt, 12e6, 100, "x");
        _book(oax, showAt);
        _book(oax, showAt + 1 days);
        _book(oax, showAt + 2 days);
        vm.prank(artist);
        vm.expectRevert(abi.encodeWithSelector(TripVault.VendorCapExceeded.selector, venueOax, 200e6, 150e6));
        fund.bookVenue(oax, showAt + 3 days, 12e6, 100, "x");
        vm.prank(fan);
        vm.expectRevert(TripVault.NotSpender.selector);
        fund.bookVenue(oax, showAt + 4 days, 12e6, 100, "x");
    }

    function test_Leash_NotBeforeTourWindow() public {
        TripVault f2 = _tourFundAt();
        vm.prank(artist);
        vm.expectRevert(TripVault.TripNotStarted.selector);
        f2.bookVenue(oax, showAt, 12e6, 100, "x");
    }

    function _tourFundAt() internal returns (TripVault v) {
        TripVault.Config memory c = _cfg(true, 2_000e6, 1_000e6);
        c.kind = ITripVault.Kind.ArtistTour;
        c.startTime = uint64(block.timestamp + 10 days);
        c.endTime = uint64(block.timestamp + 20 days);
        address[] memory vs = new address[](1);
        uint256[] memory caps = new uint256[](1);
        vs[0] = venueOax; caps[0] = 150e6;
        c.vendors = vs;
        c.vendorCaps = caps;
        vm.prank(artist);
        v = TripVault(factory.createVault(c));
        _deposit(v, artist, 100e6, artist);
    }

    function test_Confirm_ByQrAttestation_PaysVenue() public {
        uint256 id = _book(oax, showAt);
        vm.warp(showAt + 1 hours);
        bytes memory bad = _signCheckIn(id, address(0), showAt, 0xBAD);
        vm.expectRevert(Venues.BadAttestation.selector);
        venues.confirmShow(id, showAt, bad);
        uint256 v0 = usdc.balanceOf(venueOax);
        venues.confirmShow(id, showAt, _signShow(id, 1, showAt));
        assertEq(usdc.balanceOf(venueOax) - v0, 48.5e6);
        assertEq(usdc.balanceOf(treasury), 1.5e6);
        assertEq(fund.openBookings(), 0);
        assertEq(fund.vendorSpent(venueOax), 50e6); // spent stays spent
        (uint32 held, uint32 cancelled, uint256 bps) = venues.reliability(oax);
        assertEq(held, 1);
        assertEq(cancelled, 0);
        assertEq(bps, 10_000);
        bytes memory again = _signShow(id, 1, showAt);
        vm.expectRevert(Venues.NotBooked.selector);
        venues.confirmShow(id, showAt, again);
    }

    function test_Confirm_OutcomeBoundInSignature() public {
        uint256 id = _book(oax, showAt);
        vm.warp(showAt + 1 hours);
        bytes memory noShowSig = _signShow(id, 2, showAt);
        vm.expectRevert(Venues.BadAttestation.selector);
        venues.confirmShow(id, showAt, noShowSig); // a no-show attestation can't release the deposit
    }

    function test_Confirm_TooEarly() public {
        uint256 id = _book(oax, showAt);
        uint64 at = showAt - 2 hours;
        vm.warp(at);
        bytes memory sig = _signShow(id, 1, at);
        vm.expectRevert(Venues.TooEarly.selector);
        venues.confirmShow(id, at, sig);
    }

    function test_VenueCancel_FullRefundLeashRestoredRecordHit() public {
        uint256 id = _book(cdmx, showAt);
        uint256 a0 = fund.totalAssets();
        vm.prank(stranger);
        vm.expectRevert(Venues.NotVenueOwner.selector);
        venues.venueCancel(id);
        vm.prank(venueCdmx);
        venues.venueCancel(id);
        assertEq(fund.totalAssets(), a0 + 80e6);
        assertEq(fund.vendorSpent(venueCdmx), 0);
        assertEq(fund.openBookings(), 0);
        (, uint32 c,) = venues.reliability(cdmx);
        assertEq(c, 1);
        assertEq(venues.bookedOn(cdmx, uint32(showAt / 1 days)), 0); // date free again
        _book(cdmx, showAt);
    }

    function test_ArtistCancel_VenueKeepsCancelFee() public {
        uint256 id = _book(oax, showAt);
        uint256 v0 = usdc.balanceOf(venueOax);
        vm.prank(fan);
        vm.expectRevert(TripVault.NotSpender.selector);
        fund.cancelShow(id);
        vm.prank(artist);
        fund.cancelShow(id);
        assertEq(usdc.balanceOf(venueOax) - v0, 20e6);
        assertEq(fund.vendorSpent(venueOax), 20e6); // only the kept fee stays spent
        assertEq(venues.getShow(id).refunded, 30e6);
        uint256 id2 = _book(oax, showAt + 1 days);
        vm.warp(showAt + 1 days);
        vm.prank(artist);
        vm.expectRevert(Venues.TooLate.selector);
        fund.cancelShow(id2);
        vm.prank(artist);
        vm.expectRevert(Venues.NotBooked.selector);
        fund.cancelShow(id);
    }

    function test_ArtistNoShow_Attested() public {
        uint256 id = _book(oax, showAt);
        vm.warp(showAt + 3 hours);
        uint256 v0 = usdc.balanceOf(venueOax);
        venues.claimArtistNoShow(id, showAt + 2 hours, _signShow(id, 2, showAt + 2 hours));
        assertEq(usdc.balanceOf(venueOax) - v0, 20e6);
        assertEq(venues.artistNoShowCount(artist), 1);
        assertEq(uint8(venues.getShow(id).status), uint8(IVenues.ShowStatus.ArtistNoShow));
        assertEq(fund.openBookings(), 0);
    }

    function test_Expire_AnyoneAfterTimeout() public {
        uint256 id = _book(oax, showAt);
        vm.warp(showAt + 3 days);
        vm.expectRevert(Venues.TooEarly.selector);
        venues.expire(id);
        vm.warp(showAt + 3 days + 1);
        uint256 a0 = fund.totalAssets();
        vm.prank(fan);
        venues.expire(id);
        assertEq(fund.totalAssets(), a0 + 50e6);
        assertEq(fund.vendorSpent(venueOax), 0);
    }

    function test_TermsSnapshot() public {
        uint256 id = _book(oax, showAt);
        vm.prank(venueOax);
        venues.setTerms(oax, 200, 9000, 100e6, 100e6, true);
        Venues.Show memory s = venues.getShow(id);
        assertEq(s.venueTicketBps, 3000);
        assertEq(s.cancelFee, 20e6);
    }

    function test_CallbackGasGriefing_Reverts() public {
        uint256 id = _book(cdmx, showAt);
        vm.prank(venueCdmx);
        (bool ok,) = address(venues).call{ gas: 150_000 }(abi.encodeCall(Venues.venueCancel, (id)));
        assertFalse(ok);
        assertEq(fund.openBookings(), 1);
    }

    function test_SyncShow_Backstop() public {
        uint256 id = _book(cdmx, showAt);
        vm.mockCallRevert(address(fund), abi.encodeWithSelector(ITripVault.onShowSettled.selector), "boom");
        vm.prank(venueCdmx);
        venues.venueCancel(id);
        vm.clearMockedCalls();
        assertEq(fund.openBookings(), 1);
        fund.syncShow(id);
        assertEq(fund.openBookings(), 0);
        assertEq(fund.vendorSpent(venueCdmx), 0);
    }

    function test_OnShowSettled_OnlyVenues() public {
        vm.expectRevert(TripVault.NotVenues.selector);
        fund.onShowSettled(0, 1);
    }

    function testFuzz_ShowEscrowAlwaysResolves(uint8 action, uint32 dt) public {
        uint256 id = _book(oax, showAt);
        vm.warp(block.timestamp + bound(dt, 0, 6 days));
        uint256 a = action % 4;
        uint64 nowTs = uint64(block.timestamp);
        if (a == 0) { vm.prank(venueOax); venues.venueCancel(id); }
        else if (a == 1 && nowTs < showAt) { vm.prank(artist); fund.cancelShow(id); }
        else if (a == 2 && nowTs + 1 hours >= showAt) { venues.confirmShow(id, nowTs, _signShow(id, 1, nowTs)); }
        else if (a == 3 && nowTs >= showAt) { venues.claimArtistNoShow(id, nowTs, _signShow(id, 2, nowTs)); }
        vm.warp(showAt + 3 days + 1);
        if (venues.getShow(id).status == IVenues.ShowStatus.Booked) venues.expire(id);
        assertTrue(venues.getShow(id).status != IVenues.ShowStatus.Booked);
        assertEq(usdc.balanceOf(address(venues)), 0);
        assertEq(fund.openBookings(), 0);
        // conservation: fund + venue + treasury got exactly the 50 deposit back out
        assertEq(fund.totalAssets() + usdc.balanceOf(venueOax) + usdc.balanceOf(treasury) - 50e6, 500e6 - 50e6 + fund.yieldEarned());
    }
}
