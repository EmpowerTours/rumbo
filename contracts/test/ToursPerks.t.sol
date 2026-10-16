// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { ToursToken } from "../src/ToursToken.sol";
import { PerkMarket } from "../src/PerkMarket.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ToursPerksTest is Base {
    function _give(address to, uint256 amt) internal {
        vm.prank(address(rewards));
        tours.mint(to, amt);
    }

    function test_Mint_OnlyMinter() public {
        vm.expectRevert(ToursToken.NotMinter.selector);
        tours.mint(traveler, 1);
        vm.prank(admin);
        vm.expectRevert(ToursToken.NotMinter.selector);
        tours.mint(traveler, 1);
        _give(traveler, 5e18);
        assertEq(tours.balanceOf(traveler), 5e18);
    }

    function test_SetMinter_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        tours.setMinter(stranger);
    }

    function test_PointsMode_NoWalletTransfers() public {
        _give(traveler, 5e18);
        vm.prank(traveler);
        vm.expectRevert(ToursToken.NonTransferable.selector);
        tours.transfer(friend, 1e18);
        vm.prank(traveler);
        tours.approve(friend, 1e18);
        vm.prank(friend);
        vm.expectRevert(ToursToken.NonTransferable.selector);
        tours.transferFrom(traveler, friend, 1e18);
        // burning own points is fine
        vm.prank(traveler);
        tours.burn(1e18);
        assertEq(tours.totalSupply(), 4e18);
    }

    function test_TokenMode_OneWaySwitch() public {
        vm.prank(admin);
        tours.enableTransfers();
        _give(traveler, 5e18);
        vm.prank(traveler);
        tours.transfer(friend, 1e18);
        assertEq(tours.balanceOf(friend), 1e18);
        vm.prank(admin);
        vm.expectRevert(ToursToken.AlreadyTransferable.selector);
        tours.enableTransfers();
    }

    function test_DailyMintCap() public {
        vm.prank(admin);
        tours.setMintCapPerDay(10e18);
        _give(traveler, 10e18);
        assertEq(tours.mintableToday(), 0);
        vm.prank(address(rewards));
        vm.expectRevert();
        tours.mint(traveler, 1);
        vm.warp(block.timestamp + 1 days);
        _give(traveler, 10e18);
    }

    function _perk(bool burn, uint32 supply, uint16 maxPerUser) internal returns (uint256 id) {
        vm.prank(partner);
        id = perks.listPerk(30e18, supply, maxPerUser, burn, "10% off Mezcal tasting", "Casa Mezcal");
    }

    function test_Redeem_BurnsInPointsMode() public {
        uint256 id = _perk(true, 10, 0);
        _give(traveler, 50e18);
        vm.startPrank(traveler);
        tours.approve(address(perks), 30e18);
        uint256 rid = perks.redeem(id);
        vm.stopPrank();
        assertEq(rid, 1);
        assertEq(tours.balanceOf(traveler), 20e18);
        assertEq(tours.totalSupply(), 20e18);
        assertEq(perks.totalBurned(), 30e18);
        assertEq(perks.getPerk(id).remaining, 9);
    }

    function test_Redeem_ToPartner() public {
        uint256 id = _perk(false, 10, 0);
        _give(traveler, 50e18);
        vm.startPrank(traveler);
        tours.approve(address(perks), 30e18);
        perks.redeem(id);
        vm.stopPrank();
        assertEq(tours.balanceOf(partner), 30e18);
        // in points mode the partner still cannot send them wallet-to-wallet
        vm.prank(partner);
        vm.expectRevert(ToursToken.NonTransferable.selector);
        tours.transfer(stranger, 1);
    }

    function test_Redeem_LimitsAndAccess() public {
        vm.prank(stranger);
        vm.expectRevert(PerkMarket.NotPartner.selector);
        perks.listPerk(1, 1, 0, true, "x", "x");
        uint256 id = _perk(true, 1, 1);
        _give(traveler, 100e18);
        _give(friend, 100e18);
        vm.startPrank(traveler);
        tours.approve(address(perks), 100e18);
        perks.redeem(id);
        vm.expectRevert(PerkMarket.SoldOut.selector);
        perks.redeem(id);
        vm.stopPrank();
        uint256 id2 = _perk(true, 5, 1);
        vm.startPrank(traveler);
        perks.redeem(id2);
        vm.expectRevert(PerkMarket.UserLimit.selector);
        perks.redeem(id2);
        vm.stopPrank();
        // partner de-listed by admin -> perks inactive
        vm.prank(admin);
        perks.setPartner(partner, false);
        vm.startPrank(friend);
        tours.approve(address(perks), 100e18);
        vm.expectRevert(PerkMarket.Inactive.selector);
        perks.redeem(id2);
        vm.stopPrank();
    }

    function test_Redeem_InsufficientPoints() public {
        uint256 id = _perk(true, 10, 0);
        _give(traveler, 10e18);
        vm.startPrank(traveler);
        tours.approve(address(perks), 30e18);
        vm.expectRevert();
        perks.redeem(id);
        vm.stopPrank();
    }
}
