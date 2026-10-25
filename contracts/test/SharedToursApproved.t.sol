// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import { Test, console2 } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ToursClaimDistributor } from "../src/mainnet/ToursClaimDistributor.sol";
import { SharedToursParams as P } from "../src/mainnet/SharedToursParams.sol";
import { ToursTokenStandIn } from "../src/mocks/ToursTokenStandIn.sol";
import { M } from "./ToursClaimDistributor.t.sol";

interface IRewardManagerV2 {
    function owner() external view returns (address);
    function toursToken() external view returns (address);
    function transferOwnership(address) external;
    function emergencyWithdraw() external;
}

/// Approved values (2026-10-20) are what the deploy uses.
contract SharedToursApprovedTest is Test {
    function test_ApprovedValues() public pure {
        assertEq(P.TOURS_V2, 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF);
        assertEq(P.EMPOWERTOURS_SAFE, 0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA);
        assertEq(P.BUDGET_SOURCE, 0x056452a44d81AB502e24510b2e4FB1789C6faf85);
        assertEq(P.PROGRAMME_BUDGET, 1_000_000e18);
        assertEq(P.RATE_BPS, 10_000);
        assertEq(P.MAX_EPOCH_INCREASE, 250_000e18);
        assertEq(P.MAX_PER_WALLET_PER_EPOCH, 500e18);
        assertEq(P.MAX_PER_WALLET, 5_000e18);
        assertEq(P.MIN_EPOCH_INTERVAL, 7 days);
        // the whole budget lasts at least 4 epochs at the ceiling; lifetime cap reached after 10 epochs
        assertEq(P.PROGRAMME_BUDGET / P.MAX_EPOCH_INCREASE, 4);
        assertEq(P.MAX_PER_WALLET / P.MAX_PER_WALLET_PER_EPOCH, 10);
    }

    function test_ApprovedCapsEnforced() public {
        ToursTokenStandIn tok = new ToursTokenStandIn();
        address safe = makeAddr("safe"); address pub = makeAddr("pub"); address a = makeAddr("a");
        ToursClaimDistributor d = new ToursClaimDistributor(safe, pub, IERC20(address(tok)), P.MAX_EPOCH_INCREASE, P.MAX_PER_WALLET_PER_EPOCH, P.MAX_PER_WALLET, P.MIN_EPOCH_INTERVAL);
        tok.transfer(address(d), 300_000e18);
        bytes32[] memory l = new bytes32[](2);
        l[0] = d.leaf(a, 501e18); l[1] = d.leaf(makeAddr("b"), 1e18);
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.EpochIncreaseTooLarge.selector, 250_001e18, 250_000e18));
        d.publishEpoch(bytes32(uint256(1)), 250_001e18, 0);
        vm.prank(pub);
        d.publishEpoch(M.root(l), 502e18, 0);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.WalletCapExceeded.selector, 501e18, 500e18));
        d.claim(a, 501e18, M.proof(l, 0));
        vm.prank(pub);
        vm.expectRevert();
        d.publishEpoch(M.root(l), 502e18, 0); // too soon (< 7 days)
    }
}

/// Full approved flow on a LOCAL fork of Monad mainnet. Impersonation only inside the fork; nothing is sent.
///   forge test --fork-url https://rpc1.monad.xyz --match-contract SharedToursForkTest -vv --gas-report
contract SharedToursForkTest is Test {
    function test_Fork_ApprovedFlow() public {
        if (block.chainid != 143) { vm.skip(true); return; }
        IERC20 t = IERC20(P.TOURS_V2);
        IRewardManagerV2 mgr = IRewardManagerV2(P.BUDGET_SOURCE);
        assertEq(mgr.toursToken(), P.TOURS_V2);
        assertEq(mgr.owner(), P.OWNER_EOA);
        assertEq(t.balanceOf(P.BUDGET_SOURCE), P.PROGRAMME_BUDGET);
        uint256 safe0 = t.balanceOf(P.EMPOWERTOURS_SAFE);

        // 1. owner EOA hands the manager to the Safe; 2. Safe pulls the 1M straight to itself
        vm.prank(P.OWNER_EOA); mgr.transferOwnership(P.EMPOWERTOURS_SAFE);
        vm.prank(P.EMPOWERTOURS_SAFE); mgr.emergencyWithdraw();
        assertEq(t.balanceOf(P.EMPOWERTOURS_SAFE), safe0 + P.PROGRAMME_BUDGET);
        assertEq(t.balanceOf(P.BUDGET_SOURCE), 0);

        // 3. deploy with approved params
        address pub = makeAddr("pub");
        ToursClaimDistributor d = new ToursClaimDistributor(P.EMPOWERTOURS_SAFE, pub, t, P.MAX_EPOCH_INCREASE, P.MAX_PER_WALLET_PER_EPOCH, P.MAX_PER_WALLET, P.MIN_EPOCH_INTERVAL);

        // 4. epoch 1: 3 wallets, Safe funds exactly the increase, publisher posts root, claims
        address[3] memory u = [makeAddr("u0"), makeAddr("u1"), makeAddr("u2")];
        uint256[3] memory amt = [uint256(500e18), 120e18, 7e18];
        bytes32[] memory l = new bytes32[](3);
        for (uint256 i; i < 3; i++) l[i] = d.leaf(u[i], amt[i]);
        vm.prank(P.EMPOWERTOURS_SAFE); t.transfer(address(d), 627e18);
        vm.prank(pub); d.publishEpoch(M.root(l), 627e18, keccak256("epoch-1"));
        for (uint256 i; i < 3; i++) d.claim(u[i], amt[i], M.proof(l, i));
        assertEq(t.balanceOf(u[0]), 500e18);

        // caps: ceiling, too soon, per-wallet
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.TooSoon.selector, uint64(block.timestamp + 7 days)));
        d.publishEpoch(bytes32(uint256(1)), 700e18, 0);
        vm.warp(block.timestamp + 7 days);
        vm.prank(P.EMPOWERTOURS_SAFE); t.transfer(address(d), 250_001e18);
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.EpochIncreaseTooLarge.selector, 250_001e18, 250_000e18));
        d.publishEpoch(bytes32(uint256(1)), 627e18 + 250_001e18, 0);

        // epoch 2: u0 rises to 1,001 (> 2 x 500) and is refused on-chain; u1 to 600 ok
        bytes32[] memory l2 = new bytes32[](2);
        l2[0] = d.leaf(u[0], 1_001e18); l2[1] = d.leaf(u[1], 600e18);
        vm.prank(pub); d.publishEpoch(M.root(l2), 1_601e18, keccak256("epoch-2"));
        vm.expectRevert(abi.encodeWithSelector(ToursClaimDistributor.WalletCapExceeded.selector, 1_001e18, 1_000e18));
        d.claim(u[0], 1_001e18, M.proof(l2, 0));

        // pause blocks claims, unpause by Safe
        vm.prank(pub); d.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        d.claim(u[1], 600e18, M.proof(l2, 1));
        vm.prank(P.EMPOWERTOURS_SAFE); d.unpause();
        d.claim(u[1], 600e18, M.proof(l2, 1));
        assertEq(t.balanceOf(u[1]), 600e18);

        // exit: Safe pulls surplus back, owed stays
        uint256 s = d.surplus();
        vm.prank(P.EMPOWERTOURS_SAFE); d.withdrawSurplus(P.EMPOWERTOURS_SAFE, s);
        assertEq(t.balanceOf(address(d)), d.cumulativeTotal() - d.totalClaimed());
        console2.log("surplus returned to Safe (wei)", s);
    }
}
