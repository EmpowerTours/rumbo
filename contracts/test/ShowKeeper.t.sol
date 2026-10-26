// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { MockScheduler } from "./helpers/MockScheduler.sol";
import { TripVault } from "../src/TripVault.sol";
import { ShowKeeper, IScheduler } from "../src/ShowKeeper.sol";
import { IVenues } from "../src/interfaces/IVenues.sol";
import { Venues } from "../src/Venues.sol";

contract ShowKeeperTest is Base {
    uint256 oax;
    uint256 cdmx;
    TripVault fund;
    uint64 showAt;
    uint256 showO;   // 3 tickets max
    uint256 showC;   // 100 tickets max
    ShowKeeper k;    // bounty-only (no scheduler)
    address hunter = makeAddr("hunter");

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
        k = new ShowKeeper(venues, tickets, IScheduler(address(0)), 4, 1_500_000);
    }

    function _buy(address who, uint256 show, uint32 qty) internal {
        IVenues.ShowInfo memory s = venues.showInfo(show);
        usdc.faucet(who, uint256(s.ticketPrice) * qty);
        vm.startPrank(who);
        usdc.approve(address(tickets), uint256(s.ticketPrice) * qty);
        tickets.buy(show, qty, uint256(s.ticketPrice) * qty);
        vm.stopPrank();
    }

    function _status(uint256 show) internal view returns (IVenues.ShowStatus) { return venues.showInfo(show).status; }

    function _sold(uint256 show) internal view returns (uint32 sold) { (, sold,,,,,,) = tickets.sales(show); }

    // ---------------------------------------------------------------- happy paths

    function test_Unattested_ExpiresThenRefundsInChunks() public {
        address[10] memory fans;
        for (uint256 i; i < 10; ++i) { fans[i] = makeAddr(string(abi.encode("fan", i))); _buy(fans[i], showC, 1); }
        k.watch(showC);
        assertEq(uint8(k.tick(showC)), uint8(ShowKeeper.Step.Waiting));
        vm.warp(k.deadline(showC) + 1);
        assertEq(uint8(k.tick(showC)), uint8(ShowKeeper.Step.Expired));
        assertEq(uint8(_status(showC)), uint8(IVenues.ShowStatus.Expired));
        assertEq(uint8(k.tick(showC)), uint8(ShowKeeper.Step.Refunded)); // 4
        assertEq(uint8(k.tick(showC)), uint8(ShowKeeper.Step.Refunded)); // 8
        assertEq(uint8(k.tick(showC)), uint8(ShowKeeper.Step.Done));     // 10
        for (uint256 i; i < 10; ++i) assertEq(usdc.balanceOf(fans[i]), 15e6, "each fan refunded once");
        assertEq(uint8(k.tick(showC)), uint8(ShowKeeper.Step.None));
    }

    function test_Played_Settles() public {
        _buy(fan, showO, 2);
        k.watch(showO);
        vm.warp(showAt + 1);
        venues.confirmShow(showO, showAt, _signShow(showO, 1, showAt));
        assertEq(uint8(k.tick(showO)), uint8(ShowKeeper.Step.Done));
        (,,,, bool settled,,,) = tickets.sales(showO);
        assertTrue(settled);
        assertEq(uint8(k.tick(showO)), uint8(ShowKeeper.Step.None));
    }

    function test_VenueCancel_RefundsWithoutWaitingForDeadline() public {
        _buy(fan, showO, 3);
        k.watch(showO);
        uint256 before = usdc.balanceOf(fan);
        vm.prank(venueOax); venues.venueCancel(showO);
        assertEq(uint8(k.tick(showO)), uint8(ShowKeeper.Step.Done));
        assertEq(usdc.balanceOf(fan) - before, 36e6);
    }

    // ---------------------------------------------------------------- adversarial

    function test_Adv_TooEarly_NoExpire_NoBounty() public {
        vm.deal(address(this), 1 ether);
        k.watch{ value: 0.1 ether }(showO);
        vm.warp(k.deadline(showO)); // exactly at deadline: still not expirable
        vm.prank(hunter); vm.expectRevert(ShowKeeper.NothingDue.selector); k.poke(showO);
        assertEq(uint8(_status(showO)), uint8(IVenues.ShowStatus.Booked));
    }

    function test_Adv_Bounty_OnlyLate_OnlyOnce_OnlyForProgress() public {
        vm.deal(address(this), 1 ether);
        _buy(fan, showO, 1);
        k.watch{ value: 0.1 ether }(showO);
        vm.warp(k.deadline(showO) + 1 hours); // late but inside GRACE
        vm.prank(hunter); k.poke(showO);      // expires, no bounty yet
        assertEq(hunter.balance, 0);
        vm.warp(k.deadline(showO) + 7 hours);
        vm.prank(hunter); k.poke(showO);      // refund chunk: real progress, late => bounty
        assertEq(hunter.balance, 0.1 ether);
        vm.prank(hunter); vm.expectRevert(ShowKeeper.NothingDue.selector); k.poke(showO); // done: no free bounty
        assertEq(k.reservedBounties(), 0);
    }

    function test_Adv_AlreadyRefundedByOthers_NoBountyTheft() public {
        vm.deal(address(this), 1 ether);
        _buy(fan, showO, 1);
        k.watch{ value: 0.1 ether }(showO);
        vm.prank(venueOax); venues.venueCancel(showO);
        tickets.refundAll(showO, 10); // someone else did the work directly
        vm.warp(k.deadline(showO) + 7 hours);
        vm.prank(hunter); vm.expectRevert(ShowKeeper.NothingDue.selector); k.poke(showO);
        assertEq(hunter.balance, 0);
        k.tick(showO);          // marks the job done (no progress, no bounty)
        k.reclaimBounty(showO); // funder gets it back
        assertEq(address(this).balance, 1 ether);
    }

    function test_Adv_DoubleRefundImpossible_ManualRefundMidway() public {
        address a = makeAddr("a"); address b = makeAddr("b");
        _buy(a, showC, 3); _buy(b, showC, 3);
        k.watch(showC);
        vm.prank(venueCdmx); venues.venueCancel(showC);
        vm.prank(b); tickets.refund(tickets.ticketsOf(b)[0]); // holder pulls one themselves
        while (uint8(k.tick(showC)) != uint8(ShowKeeper.Step.Done)) {}
        assertEq(usdc.balanceOf(a), 45e6);
        assertEq(usdc.balanceOf(b), 45e6);
        assertEq(usdc.balanceOf(address(tickets)), 0);
    }

    function test_Adv_WatchTwice_UnknownShow_NotWatched() public {
        k.watch(showO);
        vm.expectRevert(ShowKeeper.AlreadyWatched.selector); k.watch(showO);
        vm.expectRevert(Venues.Unknown.selector); k.watch(999);
        vm.expectRevert(ShowKeeper.NotWatched.selector); k.tick(showC);
        vm.prank(hunter); vm.expectRevert(ShowKeeper.NotFunder.selector); k.reclaimBounty(showO);
    }

    function test_Adv_ArtistPaidOncePerSettle() public {
        _buy(fan, showO, 2);
        k.watch(showO);
        vm.warp(showAt + 1);
        venues.confirmShow(showO, showAt, _signShow(showO, 1, showAt));
        k.tick(showO);
        vm.expectRevert(); tickets.settle(showO); // AlreadySettled
        assertEq(uint8(k.tick(showO)), uint8(ShowKeeper.Step.None));
    }

    // ---------------------------------------------------------------- self-scheduling

    function test_SelfScheduled_NoHumanAnywhere() public {
        MockScheduler s = new MockScheduler(2_000_000); // ~7 days of blocks
        ShowKeeper ks = new ShowKeeper(venues, tickets, IScheduler(address(s)), 4, 1_500_000);
        vm.deal(address(ks), 1 ether);
        for (uint256 i; i < 6; ++i) _buy(makeAddr(string(abi.encode("f", i))), showC, 1);
        ks.watch(showC);
        uint64 ab; (,,,,, ab) = ks.jobs(showC);
        assertGt(ab, block.number);
        uint256 bal = address(ks).balance;
        for (uint256 i; i < 25; ++i) ks.tick(showC); // spam: no extra scheduled txs
        assertEq(address(ks).balance, bal);
        // Let the "chain" run: each round is a target block the precompile executes.
        uint256 t0 = vm.getBlockTimestamp(); uint256 b0 = vm.getBlockNumber(); // (via-ir caches block.* reads)
        for (uint256 r; r < 10 && !_done(ks, showC); ++r) {
            (,,,,, ab) = ks.jobs(showC);
            vm.roll(ab);
            vm.warp(t0 + (uint256(ab) - b0) * 3026 / 10_000); // real cadence 0.3026 s/block
            s.process();
        }
        assertTrue(_done(ks, showC), "expired + refunded with no human tx");
        assertEq(uint8(_status(showC)), uint8(IVenues.ShowStatus.Expired));
        assertGe(vm.getBlockTimestamp(), ks.deadline(showC), "never early");
        for (uint256 i; i < 6; ++i) assertEq(usdc.balanceOf(makeAddr(string(abi.encode("f", i)))), 15e6);
    }

    function test_SelfScheduled_Unfunded_FallsBackToBounty() public {
        MockScheduler s = new MockScheduler(2_000_000);
        ShowKeeper ks = new ShowKeeper(venues, tickets, IScheduler(address(s)), 4, 1_500_000);
        vm.deal(address(this), 1 ether);
        ks.watch{ value: 0.05 ether }(showO); // bounty reserved; no fee money => cannot arm
        (,,,,, uint64 ab) = ks.jobs(showO);
        assertEq(ab, 0, "bounty money is never spent on fees");
        vm.warp(ks.deadline(showO) + 7 hours);
        vm.prank(hunter); ks.poke(showO);
        assertEq(hunter.balance, 0.05 ether);
    }

    receive() external payable {}

    function _done(ShowKeeper ks, uint256 id) internal view returns (bool d) { (, d,,,,) = ks.jobs(id); }
}
