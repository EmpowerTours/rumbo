// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ToursClaimDistributor } from "../src/mainnet/ToursClaimDistributor.sol";
import { ToursTokenStandIn } from "../src/mocks/ToursTokenStandIn.sol";

/// Merkle helper matching scripts/tours-snapshot.mjs: sorted-pair keccak, odd node carried up.
library M {
    function h(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }
    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        bytes32[] memory l = leaves;
        while (l.length > 1) {
            bytes32[] memory n = new bytes32[]((l.length + 1) / 2);
            for (uint256 i = 0; i < n.length; i++) n[i] = 2 * i + 1 < l.length ? h(l[2 * i], l[2 * i + 1]) : l[2 * i];
            l = n;
        }
        return l[0];
    }
    function proof(bytes32[] memory leaves, uint256 idx) internal pure returns (bytes32[] memory p) {
        bytes32[] memory tmp = new bytes32[](32);
        uint256 k;
        bytes32[] memory l = leaves;
        while (l.length > 1) {
            uint256 sib = idx ^ 1;
            if (sib < l.length) tmp[k++] = l[sib];
            bytes32[] memory n = new bytes32[]((l.length + 1) / 2);
            for (uint256 i = 0; i < n.length; i++) n[i] = 2 * i + 1 < l.length ? h(l[2 * i], l[2 * i + 1]) : l[2 * i];
            l = n;
            idx /= 2;
        }
        p = new bytes32[](k);
        for (uint256 i = 0; i < k; i++) p[i] = tmp[i];
    }
}

contract ToursClaimDistributorTest is Test {
    ToursTokenStandIn tok;
    ToursClaimDistributor d;
    address owner = makeAddr("safe");
    address pub = makeAddr("publisher");
    address[] users;
    uint256 constant E = 1e18;
    uint256 constant MAX_EPOCH = 1_000_000 * E;
    uint256 constant PER_EPOCH = 500 * E;
    uint256 constant LIFETIME = 5_000 * E;
    uint64 constant INTERVAL = 6 days;

    function setUp() public {
        tok = new ToursTokenStandIn();
        d = new ToursClaimDistributor(owner, pub, IERC20(address(tok)), MAX_EPOCH, PER_EPOCH, LIFETIME, INTERVAL);
        for (uint256 i = 0; i < 5; i++) users.push(makeAddr(string(abi.encode("u", i))));
        vm.warp(1_800_000_000);
    }

    function _tree(ToursClaimDistributor dist, uint256[] memory amts) internal view returns (bytes32[] memory leaves, uint256 total) {
        leaves = new bytes32[](amts.length);
        for (uint256 i = 0; i < amts.length; i++) { leaves[i] = dist.leaf(users[i], amts[i]); total += amts[i]; }
    }

    function _amts(uint256 a, uint256 b, uint256 c, uint256 x, uint256 y) internal pure returns (uint256[] memory r) {
        r = new uint256[](5); r[0] = a; r[1] = b; r[2] = c; r[3] = x; r[4] = y;
    }

    function _publish(uint256[] memory amts) internal returns (bytes32[] memory leaves) {
        uint256 total;
        (leaves, total) = _tree(d, amts);
        uint256 need = total - d.totalClaimed();
        uint256 bal = tok.balanceOf(address(d));
        if (bal < need) tok.transfer(address(d), need - bal);
        vm.prank(pub);
        d.publishEpoch(M.root(leaves), total, keccak256("snapshot"));
    }

    function test_EpochsCumulativeClaims() public {
        bytes32[] memory l1 = _publish(_amts(100 * E, 250 * E, 1 * E, 500 * E, 0.5 ether));
        d.claim(users[0], 100 * E, M.proof(l1, 0));
        vm.prank(makeAddr("relayer")); // anyone may relay; tokens go to the account
        d.claim(users[1], 250 * E, M.proof(l1, 1));
        assertEq(tok.balanceOf(users[0]), 100 * E);
        assertEq(tok.balanceOf(users[1]), 250 * E);
        assertEq(tok.balanceOf(makeAddr("relayer")), 0);
        vm.expectRevert(ToursClaimDistributor.NothingToClaim.selector);
        d.claim(users[0], 100 * E, M.proof(l1, 0));

        vm.warp(block.timestamp + INTERVAL);
        bytes32[] memory l2 = _publish(_amts(300 * E, 250 * E, 1 * E, 1000 * E, 0.5 ether));
        // old proof dead after the new root
        vm.expectRevert(ToursClaimDistributor.InvalidProof.selector);
        d.claim(users[2], 1 * E, M.proof(l1, 2));
        d.claim(users[0], 300 * E, M.proof(l2, 0));
        assertEq(tok.balanceOf(users[0]), 300 * E); // got only the 200 delta
        d.claim(users[3], 1000 * E, M.proof(l2, 3)); // skipped epoch 1, claims both at once
        assertEq(tok.balanceOf(users[3]), 1000 * E);
        assertEq(d.totalClaimed(), 1550 * E);
        assertLe(d.totalClaimed(), d.cumulativeTotal());
    }

    function test_RejectsWrongAmountOrAccount() public {
        bytes32[] memory l = _publish(_amts(100 * E, 200 * E, 3 * E, 4 * E, 5 * E));
        bytes32[] memory p = M.proof(l, 0);
        vm.expectRevert(ToursClaimDistributor.InvalidProof.selector);
        d.claim(users[0], 101 * E, p);
        vm.expectRevert(ToursClaimDistributor.InvalidProof.selector);
        d.claim(users[1], 100 * E, p);
        vm.expectRevert(ToursClaimDistributor.InvalidProof.selector);
        d.claim(makeAddr("sybil"), 100 * E, p);
    }

    function test_ProofForAnotherDistributorIsUseless() public {
        ToursClaimDistributor d2 = new ToursClaimDistributor(owner, pub, IERC20(address(tok)), MAX_EPOCH, PER_EPOCH, LIFETIME, INTERVAL);
        (bytes32[] memory l2, uint256 total) = _tree(d2, _amts(100 * E, 1, 1, 1, 1));
        tok.transfer(address(d), total);
        vm.prank(pub);
        d.publishEpoch(M.root(l2), total, 0); // root built for d2 published on d
        vm.expectRevert(ToursClaimDistributor.InvalidProof.selector);
        d.claim(users[0], 100 * E, M.proof(l2, 0));
    }

    function test_PublishLeashes() public {
        (bytes32[] memory l, uint256 total) = _tree(d, _amts(100 * E, 1, 1, 1, 1));
        bytes32 r = M.root(l);
        vm.expectRevert(ToursClaimDistributor.NotPublisher.selector);
        d.publishEpoch(r, total, 0);
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.Underfunded.selector, total, 0));
        d.publishEpoch(r, total, 0);
        tok.transfer(address(d), MAX_EPOCH * 3);
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.EpochIncreaseTooLarge.selector, MAX_EPOCH + 1, MAX_EPOCH));
        d.publishEpoch(r, MAX_EPOCH + 1, 0);
        vm.prank(pub);
        d.publishEpoch(r, total, 0);
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.TooSoon.selector, uint64(block.timestamp) + INTERVAL));
        d.publishEpoch(r, total, 0);
        vm.warp(block.timestamp + INTERVAL);
        vm.prank(pub);
        vm.expectRevert(ToursClaimDistributor.TotalDecreased.selector);
        d.publishEpoch(r, total - 1, 0);
        vm.prank(pub);
        d.publishEpoch(r, total, 0);
        assertEq(d.epoch(), 2);
    }

    function test_PerWalletCapsHoldEvenIfRootLies() public {
        // a bad / compromised snapshot gives users[0] more than 500/epoch
        bytes32[] memory l = _publish(_amts(PER_EPOCH + 1, PER_EPOCH, 1, 1, 1));
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.WalletCapExceeded.selector, PER_EPOCH + 1, PER_EPOCH));
        d.claim(users[0], PER_EPOCH + 1, M.proof(l, 0));
        d.claim(users[1], PER_EPOCH, M.proof(l, 1));
    }

    function test_LifetimeCap() public {
        ToursClaimDistributor d3 = new ToursClaimDistributor(owner, pub, IERC20(address(tok)), MAX_EPOCH, PER_EPOCH, PER_EPOCH * 2, 0);
        tok.transfer(address(d3), 10_000 * E);
        for (uint256 i = 0; i < 3; i++) {
            (bytes32[] memory l0, uint256 t0) = _tree(d3, _amts(PER_EPOCH * (i + 1), 1, 1, 1, 1));
            vm.prank(pub);
            d3.publishEpoch(M.root(l0), t0, 0);
        }
        (bytes32[] memory l, ) = _tree(d3, _amts(PER_EPOCH * 3, 1, 1, 1, 1));
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.WalletCapExceeded.selector, PER_EPOCH * 3, PER_EPOCH * 2));
        d3.claim(users[0], PER_EPOCH * 3, M.proof(l, 0));
    }

    function test_BlockedPausedAndTokenPaused() public {
        bytes32[] memory l = _publish(_amts(10 * E, 20 * E, 30 * E, 1, 1));
        vm.prank(owner);
        d.setBlocked(users[0], true);
        vm.expectRevert(ToursClaimDistributor.Blocked.selector);
        d.claim(users[0], 10 * E, M.proof(l, 0));
        vm.prank(pub);
        d.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        d.claim(users[1], 20 * E, M.proof(l, 1));
        vm.prank(pub);
        vm.expectRevert();
        d.unpause(); // only the owner unpauses
        vm.prank(owner);
        d.unpause();
        tok.pause(); // the real ToursTokenV2 can be paused by its owner: claims revert, nothing is lost
        vm.expectRevert(bytes("Token transfers paused"));
        d.claim(users[1], 20 * E, M.proof(l, 1));
        assertEq(d.claimed(users[1]), 0);
        tok.unpause();
        d.claim(users[1], 20 * E, M.proof(l, 1));
        assertEq(tok.balanceOf(users[1]), 20 * E);
    }

    function test_SurplusNeverTouchesWhatIsOwed() public {
        bytes32[] memory l = _publish(_amts(10 * E, 20 * E, 30 * E, 0, 0));
        tok.transfer(address(d), 7 * E);
        assertEq(d.surplus(), 7 * E);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.ExceedsSurplus.selector, 8 * E, 7 * E));
        d.withdrawSurplus(owner, 8 * E);
        vm.prank(owner);
        d.withdrawSurplus(owner, 7 * E);
        vm.prank(pub);
        vm.expectRevert();
        d.withdrawSurplus(pub, 0);
        d.claim(users[2], 30 * E, M.proof(l, 2));
        assertEq(tok.balanceOf(address(d)), 30 * E);
    }

    function testFuzz_ClaimsNeverExceedFunding(uint96 a, uint96 b, uint96 c, uint96 a2) public {
        uint256 x = bound(a, 1, PER_EPOCH); uint256 y = bound(b, 1, PER_EPOCH); uint256 z = bound(c, 1, PER_EPOCH);
        bytes32[] memory l = _publish(_amts(x, y, z, 1, 1));
        d.claim(users[0], x, M.proof(l, 0));
        d.claim(users[2], z, M.proof(l, 2));
        vm.warp(block.timestamp + INTERVAL);
        uint256 x2 = bound(a2, x, 2 * PER_EPOCH);
        l = _publish(_amts(x2, y, z, 1, 1));
        if (x2 > x) d.claim(users[0], x2, M.proof(l, 0)); else { vm.expectRevert(ToursClaimDistributor.NothingToClaim.selector); d.claim(users[0], x2, M.proof(l, 0)); }
        d.claim(users[1], y, M.proof(l, 1));
        assertEq(tok.balanceOf(users[0]), x2);
        assertLe(d.totalClaimed(), d.cumulativeTotal());
        assertGe(tok.balanceOf(address(d)), d.cumulativeTotal() - d.totalClaimed());
    }
}

/// Optional: the same flow against the REAL ToursTokenV2 on a LOCAL fork of Monad mainnet.
/// Runs only when the test EVM is a fork of chain 143:
///   forge test --fork-url https://rpc1.monad.xyz --match-contract ToursClaimDistributorForkTest
/// Nothing is sent to mainnet: the fork is local and impersonation happens only in it.
contract ToursClaimDistributorForkTest is Test {
    address constant TOURS_V2 = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF;
    address constant TOURS_TREASURY = 0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1; // holds ~99.999B

    function test_Fork_RealToursV2() public {
        if (block.chainid != 143) { vm.skip(true); return; }
        IERC20 t = IERC20(TOURS_V2);
        address safe = makeAddr("safe"); address pub = makeAddr("pub"); address alice = makeAddr("alice"); address bob = makeAddr("bob");
        ToursClaimDistributor d = new ToursClaimDistributor(safe, pub, t, 1_000_000e18, 500e18, 5_000e18, 6 days);
        vm.prank(TOURS_TREASURY);
        t.transfer(address(d), 1_000e18);
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = d.leaf(alice, 120e18); leaves[1] = d.leaf(bob, 80e18);
        vm.prank(pub);
        d.publishEpoch(M.root(leaves), 200e18, 0);
        d.claim(alice, 120e18, M.proof(leaves, 0));
        d.claim(bob, 80e18, M.proof(leaves, 1));
        assertEq(t.balanceOf(alice), 120e18);
        assertEq(t.balanceOf(bob), 80e18);
        assertEq(d.surplus(), 800e18);
    }
}
