// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { Venues } from "../src/Venues.sol";
import { Tickets } from "../src/Tickets.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { IVenues } from "../src/interfaces/IVenues.sol";

contract TicketsTest is Base {
    uint256 oax;
    uint256 cdmx;
    TripVault fund;
    uint64 showAt;
    uint256 showO;
    uint256 showC;

    function setUp() public override {
        super.setUp();
        oax = _venue(venueOax, 3000, 50e6, 20e6);
        cdmx = _venue(venueCdmx, 0, 80e6, 30e6);
        fund = _tourFund();
        vm.warp(START);
        showAt = uint64(START + 2 days + 20 hours);
        vm.startPrank(artist);
        showO = fund.bookVenue(oax, showAt, 12e6, 3, "Lumbre live Oaxaca");
        showC = fund.bookVenue(cdmx, showAt + 1 days, 15e6, 100, "Lumbre live CDMX");
        vm.stopPrank();
    }

    function _buy(address who, uint256 show, uint32 qty) internal returns (uint256 first) {
        IVenues.ShowInfo memory s = venues.showInfo(show);
        vm.startPrank(who);
        usdc.approve(address(tickets), uint256(s.ticketPrice) * qty);
        first = tickets.buy(show, qty, uint256(s.ticketPrice) * qty);
        vm.stopPrank();
    }

    function _play(uint256 show, uint64 at) internal {
        vm.warp(at + 1);
        venues.confirmShow(show, at, _signShow(show, 1, at));
    }

    function test_Buy_EscrowAndCap() public {
        uint256 t = _buy(traveler, showO, 2);
        assertEq(usdc.balanceOf(address(tickets)), 24e6);
        assertEq(tickets.getTicket(t).holder, traveler);
        assertEq(tickets.getTicket(t + 1).holder, traveler);
        vm.startPrank(fan);
        usdc.approve(address(tickets), 100e6);
        vm.expectRevert(Tickets.SoldOut.selector);
        tickets.buy(showO, 2, 100e6);
        vm.expectRevert(abi.encodeWithSelector(Tickets.PriceAboveMax.selector, 12e6, 11e6));
        tickets.buy(showO, 1, 11e6);
        vm.stopPrank();
    }

    function test_Buy_NotAfterShowtimeOrCancel() public {
        vm.prank(venueCdmx);
        venues.venueCancel(showC);
        vm.startPrank(fan);
        usdc.approve(address(tickets), 100e6);
        vm.expectRevert(Tickets.NotOnSale.selector);
        tickets.buy(showC, 1, 100e6);
        vm.warp(showAt);
        vm.expectRevert(Tickets.NotOnSale.selector);
        tickets.buy(showO, 1, 100e6);
        vm.stopPrank();
    }

    function test_Scan_OnceEarnsToursAndStreak() public {
        uint256 t = _buy(traveler, showO, 1);
        vm.warp(showAt + 10 minutes);
        uint64 at = showAt;
        uint256 minted = tickets.scan(t, at, _signScan(t, traveler, at));
        assertEq(minted, 10e18);
        assertEq(tours.balanceOf(traveler), 10e18);
        (, uint32 cur,,) = rewards.streakOf(traveler);
        assertEq(cur, 1);
        bytes memory sig = _signScan(t, traveler, at);
        vm.expectRevert(Tickets.AlreadyUsed.selector);
        tickets.scan(t, at, sig);
    }

    function test_Scan_ExtendsExistingStreak() public {
        uint256 cid = _campaign(guide, 1e6, 5e18, 50, 100e6);
        TripVault trip = _trip(traveler, false);
        // visits on the 3 days before the show
        vm.warp(showAt - 1 hours); // visits synced late (time never goes backwards)
        for (uint256 d = 3; d > 0; --d) {
            uint64 vAt = uint64(showAt - d * 1 days);
            TourRewards.Visit memory v = TourRewards.Visit(traveler, cid, address(trip), vAt, keccak256(abi.encode(d)));
            rewards.claim(v, _signVisit(v));
        }
        uint256 t = _buy(traveler, showO, 1);
        vm.warp(showAt + 1);
        uint256 minted = tickets.scan(t, showAt, _signScan(t, traveler, showAt));
        (, uint32 cur,,) = rewards.streakOf(traveler);
        assertEq(cur, 4);
        assertEq(minted, 10e18 + 2 * 5e18 / 2 * 3); // base 10 + streak bonus 5 * (4-1)
    }

    function test_Scan_BoundToHolderAndWindow() public {
        uint256 t = _buy(traveler, showO, 1);
        vm.warp(showAt + 1);
        bytes memory wrongHolder = _signScan(t, fan, showAt);
        vm.expectRevert(Tickets.BadAttestation.selector);
        tickets.scan(t, showAt, wrongHolder);
        uint64 early = showAt - 7 hours;
        bytes memory e = _signScan(t, traveler, early);
        vm.expectRevert(Tickets.BadScan.selector);
        tickets.scan(t, early, e);
    }

    function test_Scan_OnlyTicketsContractCanCredit() public {
        vm.expectRevert(TourRewards.NotSource.selector);
        rewards.sourceCheckIn(traveler, uint64(block.timestamp), 1e18);
    }

    function test_Settle_SeventyThirtySplit() public {
        _buy(traveler, showO, 1);
        _buy(fan, showO, 2);
        _play(showO, showAt);
        uint256 a0 = usdc.balanceOf(artist);
        uint256 v0 = usdc.balanceOf(venueOax);
        uint256 t0 = usdc.balanceOf(treasury);
        tickets.settle(showO);
        // gross 36; fee 4% = 1.44; venue 30% of 34.56 = 10.368; artist 24.192
        assertEq(usdc.balanceOf(treasury) - t0, 1.44e6);
        assertEq(usdc.balanceOf(venueOax) - v0, 10.368e6);
        assertEq(usdc.balanceOf(artist) - a0, 24.192e6);
        assertEq(usdc.balanceOf(address(tickets)), 0);
        vm.expectRevert(Tickets.AlreadySettled.selector);
        tickets.settle(showO);
    }

    function test_Settle_FlatFeeAllTicketsToArtist() public {
        _buy(fan, showC, 4);
        _play(showC, showAt + 1 days);
        uint256 a0 = usdc.balanceOf(artist);
        tickets.settle(showC);
        assertEq(usdc.balanceOf(artist) - a0, 57.6e6); // 60 - 4% fee
    }

    function test_Settle_OnlyAfterPlayed() public {
        _buy(fan, showO, 1);
        vm.expectRevert(Tickets.NotPlayed.selector);
        tickets.settle(showO);
    }

    function test_CancelledShow_FullRefunds() public {
        _buy(traveler, showC, 2);
        uint256 t = _buy(fan, showC, 3);
        vm.expectRevert(Tickets.NotCancelled.selector);
        tickets.refund(t);
        vm.prank(venueCdmx);
        venues.venueCancel(showC);
        uint256 f0 = usdc.balanceOf(fan);
        tickets.refund(t); // pull (anyone, paid to holder)
        assertEq(usdc.balanceOf(fan) - f0, 15e6);
        uint256 a0 = usdc.balanceOf(traveler);
        assertEq(tickets.refundAll(showC, 10), 4);
        assertEq(usdc.balanceOf(traveler) - a0, 30e6);
        assertEq(usdc.balanceOf(address(tickets)), 0);
        vm.expectRevert(Tickets.Refunded.selector);
        tickets.refund(t);
        assertEq(tickets.refundAll(showC, 10), 0);
    }

    function test_Refund_AfterExpiry() public {
        uint256 t = _buy(fan, showO, 1);
        vm.warp(showAt + 3 days + 1);
        venues.expire(showO);
        tickets.refund(t);
        assertEq(usdc.balanceOf(address(tickets)), 0);
    }

    function testFuzz_SplitConservesFunds(uint128 gross, uint16 fBps, uint16 vBps) public view {
        fBps = uint16(bound(fBps, 0, 1_000));
        vBps = uint16(bound(vBps, 0, 10_000));
        (uint256 f, uint256 v, uint256 a) = tickets.splitOf(gross, fBps, vBps);
        assertEq(f + v + a, gross);
        assertLe(f, uint256(gross) * fBps / 10_000);
    }

    function testFuzz_TicketEscrowResolves(uint8 action, uint8 qtyA, uint8 qtyB) public {
        uint32 qa = uint32(bound(qtyA, 1, 20));
        uint32 qb = uint32(bound(qtyB, 1, 20));
        _buy(traveler, showC, qa);
        _buy(fan, showC, qb);
        uint256 gross = (uint256(qa) + qb) * 15e6;
        uint256 before = usdc.balanceOf(traveler) + usdc.balanceOf(fan) + usdc.balanceOf(artist) + usdc.balanceOf(venueCdmx) + usdc.balanceOf(treasury);
        if (action % 3 == 0) { vm.prank(venueCdmx); venues.venueCancel(showC); }
        else if (action % 3 == 1) { _play(showC, showAt + 1 days); }
        vm.warp(showAt + 5 days);
        if (venues.getShow(showC).status == IVenues.ShowStatus.Booked) venues.expire(showC);
        if (venues.getShow(showC).status == IVenues.ShowStatus.Played) tickets.settle(showC);
        else tickets.refundAll(showC, 100);
        assertEq(usdc.balanceOf(address(tickets)), 0);
        uint256 afterB = usdc.balanceOf(traveler) + usdc.balanceOf(fan) + usdc.balanceOf(artist) + usdc.balanceOf(venueCdmx) + usdc.balanceOf(treasury);
        // all ticket money landed with fans / artist / venue / treasury (deposit flows go to fund/venue/treasury too)
        assertGe(afterB, before + gross - 80e6 - 1);
    }
}
