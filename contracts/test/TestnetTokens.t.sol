// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { RumboTestUSDC } from "../src/mocks/RumboTestUSDC.sol";

contract RumboTestUSDCTest is Test {
    RumboTestUSDC t;
    address a = address(0xA11CE);

    function setUp() public {
        t = new RumboTestUSDC(1_000e6);
    }

    function test_labelsAndDecimals() public view {
        assertEq(t.name(), "Rumbo Test USDC");
        assertEq(t.symbol(), "rtUSDC");
        assertEq(t.decimals(), 6);
    }

    function test_dailyCapPerAddress() public {
        vm.startPrank(a);
        t.faucet(600e6);
        t.faucet(400e6);
        vm.expectRevert(abi.encodeWithSelector(RumboTestUSDC.DailyCap.selector, 0));
        t.faucet(1);
        vm.stopPrank();
        // another address has its own cap
        vm.prank(address(0xB0B));
        t.faucet(1_000e6);
        // next UTC day resets
        vm.warp(block.timestamp + 1 days);
        vm.prank(a);
        t.faucet(1_000e6);
        assertEq(t.balanceOf(a), 2_000e6);
    }

    function testFuzz_neverExceedsCap(uint256 x, uint256 y) public {
        x = bound(x, 0, 2_000e6);
        y = bound(y, 0, 2_000e6);
        vm.startPrank(a);
        if (x <= 1_000e6) t.faucet(x); else { vm.expectRevert(); t.faucet(x); x = 0; }
        if (x + y <= 1_000e6) t.faucet(y); else { vm.expectRevert(); t.faucet(y); y = 0; }
        assertLe(t.balanceOf(a), 1_000e6);
        assertEq(t.remainingToday(a), 1_000e6 - x - y);
    }
}
