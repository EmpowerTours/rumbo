// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { MockToken } from "../src/mocks/MockToken.sol";

contract BatchTest is Base {
    TripVault v;
    uint256 c0;
    uint256 c1;

    function setUp() public override {
        super.setUp();
        v = _trip(traveler, false);
        c0 = _campaign(guide, 2e6, 10e18, 50, 1_000e6);
        c1 = _campaign(artist, 1e6, 6e18, 50, 1_000e6);
        vm.warp(T0 + 13 days);
    }

    function _b(uint256[] memory cs, uint64[] memory ats, bytes32 id) internal view returns (TourRewards.VisitBatch memory) {
        return TourRewards.VisitBatch({ user: traveler, vault: address(v), campaignIds: cs, visitedAts: ats, batchId: id });
    }

    /// 12 days x 2 stops in ONE catch-up batch
    function _catchUp() internal view returns (uint256[] memory cs, uint64[] memory ats) {
        cs = new uint256[](24);
        ats = new uint64[](24);
        for (uint256 d; d < 12; ++d) {
            cs[2 * d] = c0; ats[2 * d] = uint64(T0 + d * 1 days + 100);
            cs[2 * d + 1] = c1; ats[2 * d + 1] = uint64(T0 + d * 1 days + 200);
        }
    }

    function test_Batch_EqualsSingles() public {
        (uint256[] memory cs, uint64[] memory ats) = _catchUp();
        TourRewards.VisitBatch memory b = _b(cs, ats, keccak256("b1"));
        (uint256 reward, uint256 t) = rewards.claimBatch(b, _signBatch(b));
        assertEq(reward, 12 * 3e6);
        // base 12*(10+6) + streak bonus 5*(1+...+10+10)
        uint256 bonus = 5e18 * 65;
        assertEq(t, 192e18 + bonus);
        assertEq(tours.balanceOf(traveler), t);
        assertApproxEqAbs(v.totalAssets(), 36e6, 1);
        (, uint32 cur, uint32 best, uint32 daysV) = rewards.streakOf(traveler);
        assertEq(cur, 12);
        assertEq(best, 12);
        assertEq(daysV, 12);
        assertTrue(rewards.claimedDay(traveler, c0, T0 / 1 days + 5));
        assertEq(rewards.getCampaign(c0).totalVisits, 12);
    }

    function test_Batch_SameTotalsAsSingleClaims() public {
        // user A: singles; user B (friend): one batch; identical visits -> identical rewards and points
        TripVault vf = _trip(friend, false);
        (uint256[] memory cs, uint64[] memory ats) = _catchUp();
        uint256 sumR;
        for (uint256 i; i < 24; ++i) {
            TourRewards.Visit memory x = TourRewards.Visit(traveler, cs[i], address(v), ats[i], bytes32(i));
            (uint256 r,) = rewards.claim(x, _signVisit(x));
            sumR += r;
        }
        TourRewards.VisitBatch memory b = TourRewards.VisitBatch(friend, address(vf), cs, ats, keccak256("f"));
        (uint256 rb,) = rewards.claimBatch(b, _signBatch(b));
        assertEq(rb, sumR);
        assertEq(tours.balanceOf(friend), tours.balanceOf(traveler));
    }

    function test_Batch_NoReplayNoMixing() public {
        uint256[] memory cs = new uint256[](1);
        uint64[] memory ats = new uint64[](1);
        cs[0] = c0; ats[0] = uint64(T0 + 12 days + 10);
        TourRewards.VisitBatch memory b = _b(cs, ats, keccak256("b"));
        bytes memory sig = _signBatch(b);
        rewards.claimBatch(b, sig);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.VisitReused.selector, keccak256("b")));
        rewards.claimBatch(b, sig);
        // a new batch id with the same visit -> per-day rule blocks it
        b.batchId = keccak256("b2");
        sig = _signBatch(b);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.AlreadyClaimedToday.selector, (T0 + 12 days) / 1 days));
        rewards.claimBatch(b, sig);
        // and the single path too
        TourRewards.Visit memory x = TourRewards.Visit(traveler, c0, address(v), ats[0] + 5, keccak256("s"));
        bytes memory sx = _signVisit(x);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.AlreadyClaimedToday.selector, (T0 + 12 days) / 1 days));
        rewards.claim(x, sx);
    }

    function test_Batch_DuplicateInsideOneBatchReverts() public {
        uint256[] memory cs = new uint256[](2);
        uint64[] memory ats = new uint64[](2);
        cs[0] = c0; cs[1] = c0;
        ats[0] = uint64(T0 + 12 days + 10); ats[1] = uint64(T0 + 12 days + 20);
        TourRewards.VisitBatch memory b = _b(cs, ats, keccak256("dup"));
        bytes memory sig = _signBatch(b);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.AlreadyClaimedToday.selector, (T0 + 12 days) / 1 days));
        rewards.claimBatch(b, sig);
    }

    function test_Batch_TamperOrderTokenLength() public {
        (uint256[] memory cs, uint64[] memory ats) = _catchUp();
        TourRewards.VisitBatch memory b = _b(cs, ats, keccak256("t"));
        bytes memory sig = _signBatch(b);
        b.campaignIds[3] = c0; // tamper
        vm.expectRevert(TourRewards.BadAttestation.selector);
        rewards.claimBatch(b, sig);
        // out of order
        (cs, ats) = _catchUp();
        (ats[0], ats[1]) = (ats[1], ats[0]);
        b = _b(cs, ats, keccak256("o"));
        sig = _signBatch(b);
        vm.expectRevert(TourRewards.BadBatch.selector);
        rewards.claimBatch(b, sig);
        // mismatched lengths
        b = _b(new uint256[](2), new uint64[](1), keccak256("l"));
        sig = _signBatch(b);
        vm.expectRevert(TourRewards.BadBatch.selector);
        rewards.claimBatch(b, sig);
        // mixed reward tokens
        MockToken wmon = new MockToken("WMON", "WMON", 18, 1e30);
        vm.prank(admin);
        rewards.setRewardToken(address(wmon), true, 0);
        wmon.faucet(guide, 100e18);
        vm.startPrank(guide);
        wmon.approve(address(rewards), 100e18);
        uint256 cw = rewards.createCampaign(address(wmon), 1e18, 0, 10, TourRewards.StopKind.HuntCache, bytes32(0), "w", 100e18);
        vm.stopPrank();
        uint256[] memory mc = new uint256[](2);
        uint64[] memory ma = new uint64[](2);
        mc[0] = c0; mc[1] = cw; ma[0] = uint64(T0 + 12 days); ma[1] = uint64(T0 + 12 days + 1);
        b = TourRewards.VisitBatch(traveler, address(0), mc, ma, keccak256("m"));
        sig = _signBatch(b);
        vm.expectRevert(TourRewards.BadBatch.selector);
        rewards.claimBatch(b, sig);
    }

    function test_Batch_CannotRouteToOthersVault() public {
        TripVault other = _trip(friend, true);
        uint256[] memory cs = new uint256[](1);
        uint64[] memory ats = new uint64[](1);
        cs[0] = c0; ats[0] = uint64(T0 + 12 days);
        TourRewards.VisitBatch memory b = TourRewards.VisitBatch(traveler, address(other), cs, ats, keccak256("x"));
        bytes memory sig = _signBatch(b);
        vm.expectRevert(TourRewards.BadVault.selector);
        rewards.claimBatch(b, sig);
    }

    function testFuzz_Batch_NoDoubleRewardAcrossPaths(uint8 n, uint8 dupAt) public {
        n = uint8(bound(n, 1, 12));
        uint256[] memory cs = new uint256[](n);
        uint64[] memory ats = new uint64[](n);
        for (uint256 i; i < n; ++i) { cs[i] = c0; ats[i] = uint64(T0 + i * 1 days + 50); }
        TourRewards.VisitBatch memory b = _b(cs, ats, keccak256("z"));
        rewards.claimBatch(b, _signBatch(b));
        uint256 d = bound(dupAt, 0, n - 1);
        TourRewards.Visit memory x = TourRewards.Visit(traveler, c0, address(v), ats[d] + 1, keccak256("dupe"));
        bytes memory sx = _signVisit(x);
        vm.expectRevert(abi.encodeWithSelector(TourRewards.AlreadyClaimedToday.selector, uint256(ats[d] / 1 days)));
        rewards.claim(x, sx);
        assertEq(rewards.getCampaign(c0).totalVisits, n);
    }
}
