// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { ToursToken } from "../src/ToursToken.sol";
import { ITripVault } from "../src/interfaces/ITripVault.sol";

contract TourRewardsTest is Base {
    TripVault v;
    uint256 cid;

    function setUp() public override {
        super.setUp();
        v = _trip(traveler, false);
        cid = _campaign(guide, 2e6, 10e18, 50, 1_000e6);
    }

    function _visit(address user, uint256 c, address vault, uint64 at, bytes32 id) internal pure returns (TourRewards.Visit memory) {
        return TourRewards.Visit({ user: user, campaignId: c, vault: vault, visitedAt: at, visitId: id });
    }

    function _claim(TourRewards.Visit memory x) internal returns (uint256, uint256) {
        return rewards.claim(x, _signVisit(x));
    }

    function test_Campaign_TakesSponsorFee() public view {
        TourRewards.Campaign memory c = rewards.getCampaign(cid);
        assertEq(c.budget, 900e6); // 10% fee
        assertEq(usdc.balanceOf(treasury), 100e6);
        assertEq(c.sponsor, guide);
    }

    function test_Campaign_ToursPerVisitCapped() public {
        vm.startPrank(guide);
        usdc.approve(address(rewards), 1e6);
        vm.expectRevert(TourRewards.BadConfig.selector);
        rewards.createCampaign(address(usdc), 1, 51e18, 1, TourRewards.StopKind.HuntCache, bytes32(0), "x", 1e6);
        vm.stopPrank();
    }

    function test_Claim_PaysIntoTripVaultAndMintsTours() public {
        (uint256 r, uint256 t) = _claim(_visit(traveler, cid, address(v), uint64(block.timestamp), keccak256("v1")));
        assertEq(r, 2e6);
        assertEq(t, 10e18);
        assertApproxEqAbs(v.totalAssets(), 2e6, 1);
        assertEq(v.principalOf(traveler), 2e6);
        assertEq(tours.balanceOf(traveler), 10e18);
        assertEq(rewards.getCampaign(cid).budget, 898e6);
    }

    function test_Claim_ToWalletWhenNoVault() public {
        uint256 b0 = usdc.balanceOf(traveler);
        _claim(_visit(traveler, cid, address(0), uint64(block.timestamp), keccak256("v1")));
        assertEq(usdc.balanceOf(traveler) - b0, 2e6);
    }

    function test_Claim_FallsBackToWalletWhenVaultClosed() public {
        vm.prank(traveler);
        v.cancel();
        uint256 b0 = usdc.balanceOf(traveler);
        _claim(_visit(traveler, cid, address(v), uint64(block.timestamp), keccak256("v1")));
        assertEq(usdc.balanceOf(traveler) - b0, 2e6);
    }

    function test_Claim_CannotRouteToSomeoneElsesVault() public {
        TripVault other = _trip(friend, true);
        TourRewards.Visit memory x = _visit(traveler, cid, address(other), uint64(block.timestamp), keccak256("v1"));
        bytes memory sig = _signVisit(x);
        vm.expectRevert(TourRewards.BadVault.selector);
        rewards.claim(x, sig);
        x.vault = address(0xBEEF);
        sig = _signVisit(x);
        vm.expectRevert(TourRewards.BadVault.selector);
        rewards.claim(x, sig);
    }

    function test_Claim_BadSignatureOrTampered() public {
        TourRewards.Visit memory x = _visit(traveler, cid, address(v), uint64(block.timestamp), keccak256("v1"));
        bytes memory sig = _signVisit(x);
        x.user = stranger; // tamper
        vm.expectRevert(TourRewards.BadAttestation.selector);
        rewards.claim(x, sig);
    }

    function test_NoDoubleClaim_SameVisitId() public {
        TourRewards.Visit memory x = _visit(traveler, cid, address(v), uint64(block.timestamp), keccak256("v1"));
        bytes memory sig = _signVisit(x);
        rewards.claim(x, sig);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.VisitReused.selector, keccak256("v1")));
        rewards.claim(x, sig);
    }

    function test_NoDoubleClaim_SameDayDifferentVisitId() public {
        _claim(_visit(traveler, cid, address(v), uint64(block.timestamp), keccak256("v1")));
        TourRewards.Visit memory x = _visit(traveler, cid, address(v), uint64(block.timestamp + 60), keccak256("v2"));
        bytes memory sig = _signVisit(x);
        vm.warp(block.timestamp + 60);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.AlreadyClaimedToday.selector, (T0 + 60) / 1 days));
        rewards.claim(x, sig);
    }

    function test_FutureAndStaleVisitsRejected() public {
        TourRewards.Visit memory x = _visit(traveler, cid, address(v), uint64(block.timestamp + 1), keccak256("f"));
        bytes memory sig = _signVisit(x);
        vm.expectRevert(TourRewards.FutureVisit.selector);
        rewards.claim(x, sig);
        x = _visit(traveler, cid, address(v), uint64(block.timestamp - 14 days - 1), keccak256("s"));
        sig = _signVisit(x);
        vm.expectRevert(TourRewards.StaleVisit.selector);
        rewards.claim(x, sig);
    }

    function test_DailyCap() public {
        uint256 c2 = _campaign(guide, 1e6, 0, 2, 100e6);
        address[3] memory us = [traveler, friend, stranger];
        for (uint256 i; i < 2; ++i) _claim(_visit(us[i], c2, address(0), uint64(block.timestamp), bytes32(i + 100)));
        TourRewards.Visit memory x = _visit(us[2], c2, address(0), uint64(block.timestamp), bytes32(uint256(102)));
        bytes memory sig = _signVisit(x);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.DailyCapReached.selector, T0 / 1 days));
        rewards.claim(x, sig);
    }

    function test_BudgetExhausted_AndCloseRefund() public {
        uint256 c2 = _campaign(guide, 9e6, 0, 100, 10e6); // net 9e6 => exactly 1 visit
        _claim(_visit(traveler, c2, address(0), uint64(block.timestamp), bytes32(uint256(1))));
        TourRewards.Visit memory x = _visit(friend, c2, address(0), uint64(block.timestamp), bytes32(uint256(2)));
        bytes memory sig = _signVisit(x);
        vm.expectRevert(TourRewards.BudgetExhausted.selector);
        rewards.claim(x, sig);
        uint256 b0 = usdc.balanceOf(guide);
        vm.prank(guide);
        rewards.closeCampaign(cid);
        assertEq(usdc.balanceOf(guide) - b0, 900e6);
        x = _visit(friend, cid, address(0), uint64(block.timestamp), bytes32(uint256(3)));
        sig = _signVisit(x);
        vm.expectRevert(TourRewards.Inactive.selector);
        rewards.claim(x, sig);
    }

    function test_Streak_GrowsResetsAndBonusCapped() public {
        // 12 consecutive days, claims synced late (all within the 14-day window)
        vm.warp(T0 + 12 days);
        uint256 totalTours;
        for (uint256 d; d < 12; ++d) {
            uint64 at = uint64(T0 + d * 1 days + 3600);
            (, uint256 t) = _claim(_visit(traveler, cid, address(v), at, keccak256(abi.encode(d))));
            totalTours += t;
            (, uint32 cur,,) = rewards.streakOf(traveler);
            assertEq(cur, d + 1);
        }
        // base 10 * 12 + bonus 5 * (1+2+...+10 capped at 10 for days 11,12)
        uint256 bonus = 5e18 * (1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 10);
        assertEq(totalTours, 120e18 + bonus);
        assertEq(tours.balanceOf(traveler), totalTours);
        (,, uint32 best, uint32 daysVisited) = rewards.streakOf(traveler);
        assertEq(best, 12);
        assertEq(daysVisited, 12);
        // skip a day -> reset to 1
        vm.warp(T0 + 14 days);
        _claim(_visit(traveler, cid, address(v), uint64(T0 + 13 days + 10), keccak256("gap")));
        (, uint32 cur2,,) = rewards.streakOf(traveler);
        assertEq(cur2, 1);
    }

    function test_Streak_SameDaySecondStopNoBonus() public {
        uint256 c2 = _campaign(artist, 1e6, 3e18, 10, 100e6);
        vm.warp(T0 + 1 days + 100);
        _claim(_visit(traveler, cid, address(v), uint64(T0 + 10), keccak256("a")));
        (, uint256 t1) = _claim(_visit(traveler, cid, address(v), uint64(T0 + 1 days + 10), keccak256("b")));
        (, uint256 t2) = _claim(_visit(traveler, c2, address(v), uint64(T0 + 1 days + 20), keccak256("c")));
        assertEq(t1, 10e18 + 5e18);
        assertEq(t2, 3e18); // no second bonus the same day
    }

    function test_MintCap_LeashesTheMinter() public {
        vm.prank(admin);
        tours.setMintCapPerDay(15e18);
        _claim(_visit(traveler, cid, address(v), uint64(block.timestamp), keccak256("a")));
        TourRewards.Visit memory x = _visit(friend, cid, address(0), uint64(block.timestamp), keccak256("b"));
        bytes memory sig = _signVisit(x);
        vm.expectRevert(abi.encodeWithSelector(ToursToken.MintCapExceeded.selector, T0 / 1 days, 20e18, 15e18));
        rewards.claim(x, sig);
    }

    function test_BackingRewards_UnlockWithSpend() public {
        TripVault.Config memory c = _cfg(true, 1_000e6, 1_000e6);
        c.kind = ITripVault.Kind.ArtistTour;
        c.destination = "Lumbre world tour: CDMX, Oaxaca, Guadalajara";
        vm.prank(artist);
        TripVault tv = TripVault(factory.createVault(c));
        _deposit(tv, friend, 100e6, friend);
        _deposit(tv, stranger, 300e6, stranger);
        assertEq(rewards.backingClaimable(address(tv), friend), 0);
        vm.prank(friend);
        vm.expectRevert(TourRewards.NothingToClaim.selector);
        rewards.claimBacking(address(tv));
        vm.warp(START);
        vm.prank(artist);
        tv.payVendor(guide, 100e6, "venue deposit"); // 25% of principal spent
        assertEq(rewards.backingClaimable(address(tv), friend), 25e18);
        vm.prank(friend);
        rewards.claimBacking(address(tv));
        assertEq(tours.balanceOf(friend), 25e18);
        assertEq(rewards.backingClaimable(address(tv), friend), 0);
        vm.prank(artist);
        tv.payVendor(hostA, 200e6, "venue 2");
        assertEq(rewards.backingClaimable(address(tv), friend), 50e18);
        // owner (the artist) earns nothing for backing their own tour
        assertEq(rewards.backingClaimable(address(tv), artist), 0);
        // plain trips never pay backing rewards
        assertEq(rewards.backingClaimable(address(v), traveler), 0);
    }

    function testFuzz_NoDoubleRewardPerUserDay(uint64 a, uint64 b) public {
        vm.warp(T0 + 14 days);
        a = uint64(bound(a, T0, T0 + 14 days));
        b = uint64(bound(b, T0, T0 + 14 days));
        _claim(_visit(traveler, cid, address(0), a, keccak256("a")));
        TourRewards.Visit memory x = _visit(traveler, cid, address(0), b, keccak256("b"));
        bytes memory sig = _signVisit(x);
        if (a / 1 days == b / 1 days) {
            vm.expectRevert(abi.encodeWithSelector(TourRewards.AlreadyClaimedToday.selector, uint256(a / 1 days)));
            rewards.claim(x, sig);
            assertEq(rewards.getCampaign(cid).totalVisits, 1);
        } else {
            rewards.claim(x, sig);
            assertEq(rewards.getCampaign(cid).totalVisits, 2);
        }
    }
}
