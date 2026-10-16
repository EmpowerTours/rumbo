// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Base } from "./helpers/Base.sol";
import { TripVault } from "../src/TripVault.sol";
import { TripVaultFactory } from "../src/TripVaultFactory.sol";
import { Bookings } from "../src/Bookings.sol";
import { ITripVault } from "../src/interfaces/ITripVault.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") { _mint(msg.sender, 1e30); }
    function _update(address f, address t, uint256 v) internal override {
        if (f != address(0) && t != address(0)) { super._update(f, address(0xdead), v / 100); v -= v / 100; }
        super._update(f, t, v);
    }
}

contract TripVaultTest is Base {
    // ---------------------------------------------------------------- creation

    function test_CreateVault_SetsConfigAndOwner() public {
        TripVault v = _trip(traveler, true);
        assertEq(v.owner(), traveler);
        assertEq(v.asset(), address(usdc));
        assertEq(address(v.adapter()), address(pool));
        assertEq(v.goal(), 500e6);
        assertEq(v.destination(), "Oaxaca, MX");
        assertTrue(factory.isVault(address(v)));
        assertEq(factory.vaultsOf(traveler)[0], address(v));
        assertEq(v.vendors().length, 3);
        assertEq(v.vendorCap(guide), 150e6);
    }

    function test_Initialize_OnlyOnce() public {
        TripVault v = _trip(traveler, true);
        vm.expectRevert(TripVault.AlreadyInitialized.selector);
        v.initialize(address(factory), _cfg(true, 1, 1));
        TripVault impl = TripVault(factory.implementation());
        vm.expectRevert(TripVault.AlreadyInitialized.selector);
        impl.initialize(address(factory), _cfg(true, 1, 1));
    }

    function test_Create_RejectsBadConfig() public {
        TripVault.Config memory c = _cfg(true, 500e6, 450e6);
        c.endTime = c.startTime;
        vm.expectRevert(TripVault.BadConfig.selector);
        factory.createVault(c);
        c = _cfg(true, 0, 450e6);
        vm.expectRevert(TripVault.BadConfig.selector);
        factory.createVault(c);
        c = _cfg(true, 500e6, 450e6);
        c.asset = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(TripVaultFactory.AssetNotAllowed.selector, address(0xBEEF)));
        factory.createVault(c);
    }

    function test_FactoryWire_WriteOnce() public {
        vm.prank(admin);
        vm.expectRevert(TripVaultFactory.AlreadyWired.selector);
        factory.wire(address(1), address(2));
    }

    // ---------------------------------------------------------------- saving

    function test_Deposit_SoloOwnerAndFriendGiftOnly() public {
        TripVault v = _trip(traveler, false);
        _deposit(v, traveler, 100e6, traveler);
        // a friend may gift to the owner in a solo vault ...
        _deposit(v, friend, 50e6, traveler);
        assertEq(v.principalOf(traveler), 150e6);
        // ... but cannot open their own position
        vm.startPrank(friend);
        usdc.approve(address(v), 10e6);
        vm.expectRevert(TripVault.NotOpen.selector);
        v.deposit(10e6, friend);
        vm.stopPrank();
    }

    function test_Deposit_GroupPerContributorAccounting() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        _deposit(v, friend, 100e6, friend);
        assertEq(v.principalOf(traveler), 300e6);
        assertEq(v.principalOf(friend), 100e6);
        assertEq(v.totalPrincipal(), 400e6);
        assertApproxEqAbs(v.balanceOfContributor(traveler), 300e6, 1);
        assertApproxEqAbs(v.balanceOfContributor(friend), 100e6, 1);
        assertEq(v.contributors().length, 2);
        assertEq(v.progressBps(), 8_000);
        // swept into the yield adapter
        assertEq(usdc.balanceOf(address(v)), 0);
        assertApproxEqAbs(pool.balanceOf(address(v)), 400e6, 1);
    }

    function test_Yield_AccruesAndIsSharedProRata() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        _deposit(v, friend, 100e6, friend);
        vm.warp(T0 + 20 days); // 20 days at 5% APR
        uint256 y = v.yieldEarned();
        assertApproxEqRel(y, uint256(1_095_890), 0.01e18);
        assertApproxEqRel(v.balanceOfContributor(traveler) - 300e6, y * 3 / 4, 0.001e18);
        // friend exits before the trip: gets principal + their part of the yield
        uint256 before = usdc.balanceOf(friend);
        vm.prank(friend);
        uint256 got = v.withdraw(type(uint256).max);
        assertEq(usdc.balanceOf(friend) - before, got);
        assertGt(got, 100e6);
        assertEq(v.principalOf(friend), 0);
    }

    function test_Deposit_RejectsFeeOnTransferToken() public {
        FeeToken ft = new FeeToken();
        vm.prank(admin);
        factory.setAsset(address(ft), true, address(0));
        TripVault.Config memory c = _cfg(true, 500e6, 450e6);
        c.asset = address(ft);
        vm.prank(traveler);
        TripVault v = TripVault(factory.createVault(c));
        ft.approve(address(v), 1e18);
        vm.expectRevert(abi.encodeWithSelector(TripVault.UnsupportedToken.selector, 1e18, 0.99e18));
        v.deposit(1e18, address(this));
    }

    function test_InflationAttack_Mitigated() public {
        TripVault v = _trip(traveler, true);
        // attacker deposits 1 wei then donates a lot directly
        _deposit(v, stranger, 1, stranger);
        vm.prank(stranger);
        usdc.transfer(address(v), 1_000e6);
        // victim still gets ~their deposit worth of shares (loss bounded by rounding)
        _deposit(v, friend, 100e6, friend);
        assertGt(v.sharesOf(friend), 0);
        assertApproxEqRel(v.balanceOfContributor(friend), 100e6, 0.0001e18);
    }

    function test_Withdraw_OwnerCannotExitWithoutCancel() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 100e6, traveler);
        vm.prank(traveler);
        vm.expectRevert(TripVault.CannotWithdrawYet.selector);
        v.withdraw(type(uint256).max);
    }

    function test_Withdraw_FriendCannotExitDuringTripUnlessLoosened() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        _deposit(v, friend, 100e6, friend);
        vm.warp(START);
        vm.prank(friend);
        vm.expectRevert(TripVault.CannotWithdrawYet.selector);
        v.withdraw(type(uint256).max);
        // owner queues a looser leash -> friend may now leave
        vm.prank(traveler);
        v.queueVendorCap(stranger, 400e6);
        vm.prank(friend);
        uint256 got = v.withdraw(type(uint256).max);
        assertGe(got, 100e6);
    }

    function test_Cancel_ReturnsEachShareWithYield() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        _deposit(v, friend, 100e6, friend);
        vm.warp(block.timestamp + 10 days);
        vm.prank(traveler);
        v.cancel();
        vm.prank(traveler);
        uint256 a = v.withdraw(type(uint256).max);
        vm.prank(friend);
        uint256 b = v.withdraw(type(uint256).max);
        assertGt(a, 300e6);
        assertGt(b, 100e6);
        assertApproxEqRel(a, 3 * b, 0.0001e18);
        assertLe(v.totalAssets(), 2); // only rounding dust left
        // cancelled vault rejects deposits
        vm.startPrank(friend);
        usdc.approve(address(v), 1e6);
        vm.expectRevert(TripVault.Closed.selector);
        v.deposit(1e6, friend);
        vm.stopPrank();
    }

    function test_AfterEnd_AnyoneWithdrawsLeftover() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        vm.warp(END);
        assertTrue(v.isClosed());
        vm.prank(traveler);
        assertGt(v.withdraw(type(uint256).max), 300e6);
    }

    // ---------------------------------------------------------------- leash

    function test_Leash_NoSpendBeforeStart() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        vm.prank(traveler);
        vm.expectRevert(TripVault.TripNotStarted.selector);
        v.payVendor(guide, 10e6, "x");
    }

    function test_Leash_NoSpendAfterEnd() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        vm.warp(END);
        vm.prank(traveler);
        vm.expectRevert(TripVault.TripOver.selector);
        v.payVendor(guide, 10e6, "x");
    }

    function test_Leash_OnlyApprovedVendor() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        vm.warp(START);
        vm.prank(traveler);
        vm.expectRevert(abi.encodeWithSelector(TripVault.NotApprovedVendor.selector, stranger));
        v.payVendor(stranger, 10e6, "x");
    }

    function test_Leash_VendorAndTotalCaps() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 500e6, traveler);
        vm.warp(START);
        vm.startPrank(traveler);
        v.payVendor(guide, 150e6, "tour");
        vm.expectRevert(abi.encodeWithSelector(TripVault.VendorCapExceeded.selector, guide, 151e6, 150e6));
        v.payVendor(guide, 1e6, "more");
        v.payVendor(hostA, 200e6, "stay");
        vm.expectRevert(abi.encodeWithSelector(TripVault.TotalCapExceeded.selector, 451e6, 450e6));
        v.payVendor(hostB, 101e6, "stay2");
        v.payVendor(hostB, 100e6, "stay2");
        vm.stopPrank();
        assertEq(usdc.balanceOf(guide), 10_000e6 + 150e6);
        assertEq(v.totalSpent(), 450e6);
    }

    function test_Leash_OnlyOwnerOrAgent() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 300e6, traveler);
        vm.warp(START);
        vm.prank(friend);
        vm.expectRevert(TripVault.NotSpender.selector);
        v.payVendor(guide, 10e6, "x");
        vm.prank(traveler);
        v.setAgent(stranger);
        vm.prank(stranger);
        v.payVendor(guide, 10e6, "agent");
        // the agent is leashed too
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TripVault.NotApprovedVendor.selector, stranger));
        v.payVendor(stranger, 10e6, "steal");
        // and cannot touch the leash
        vm.prank(stranger);
        vm.expectRevert(TripVault.NotOwner.selector);
        v.queueVendorCap(stranger, 1e6);
    }

    function test_Leash_TightenImmediate_LoosenDelayed() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 500e6, traveler);
        vm.warp(START);
        vm.startPrank(traveler);
        v.tightenVendorCap(guide, 0);
        vm.expectRevert(abi.encodeWithSelector(TripVault.NotApprovedVendor.selector, guide));
        v.payVendor(guide, 1e6, "x");
        vm.expectRevert(TripVault.NotLoosening.selector);
        v.tightenVendorCap(guide, 1);
        v.queueVendorCap(guide, 100e6);
        vm.expectRevert();
        v.applyVendorCap(guide);
        vm.warp(START + 1 days);
        v.applyVendorCap(guide);
        v.payVendor(guide, 100e6, "ok");
        // total cap loosen
        v.queueTotalCap(600e6);
        vm.warp(START + 2 days);
        v.applyTotalCap();
        assertEq(v.totalCap(), 600e6);
        vm.stopPrank();
    }

    function test_Book_RespectsLeashAndRefundRestoresCap() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 500e6, traveler);
        uint256 lStay = _listing(hostA, Bookings.Kind.Stay, 60e6);
        uint256 lBad = _listing(stranger, Bookings.Kind.Stay, 10e6);
        vm.warp(START);
        vm.startPrank(traveler);
        vm.expectRevert(abi.encodeWithSelector(TripVault.NotApprovedVendor.selector, stranger));
        v.book(lBad, 1, uint64(block.timestamp + 1 days));
        vm.expectRevert(abi.encodeWithSelector(TripVault.VendorCapExceeded.selector, hostA, 240e6, 200e6));
        v.book(lStay, 4, uint64(block.timestamp + 1 days));
        uint256 id = v.book(lStay, 3, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        assertEq(v.vendorSpent(hostA), 180e6);
        assertEq(v.openBookings(), 1);
        // cancel blocked while a booking is open
        vm.prank(traveler);
        vm.expectRevert(abi.encodeWithSelector(TripVault.OpenBookings.selector, 1));
        v.cancel();
        uint256 assetsBefore = v.totalAssets();
        vm.prank(hostA);
        bookings.hostCancel(id);
        assertEq(v.vendorSpent(hostA), 0);
        assertEq(v.totalSpent(), 0);
        assertEq(v.openBookings(), 0);
        assertEq(v.totalAssets(), assetsBefore + 180e6);
    }

    function test_SyncBooking_Backstop() public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 500e6, traveler);
        uint256 l = _listing(hostA, Bookings.Kind.Stay, 60e6);
        vm.warp(START);
        vm.prank(traveler);
        uint256 id = v.book(l, 1, uint64(block.timestamp));
        // simulate a lost callback by making the vault callback revert
        vm.mockCallRevert(address(v), abi.encodeWithSelector(ITripVault.onBookingSettled.selector), "boom");
        vm.prank(hostA);
        bookings.hostCancel(id);
        vm.clearMockedCalls();
        assertEq(v.openBookings(), 1);
        v.syncBooking(id);
        assertEq(v.openBookings(), 0);
        assertEq(v.totalSpent(), 0);
    }

    function test_OnBookingSettled_OnlyBookings() public {
        TripVault v = _trip(traveler, true);
        vm.expectRevert(TripVault.NotBookings.selector);
        v.onBookingSettled(0, true, 1);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_DepositWithdraw_NoValueCreated(uint96 a, uint96 b, uint32 dt) public {
        a = uint96(bound(a, 1, 5_000e6));
        b = uint96(bound(b, 1, 5_000e6));
        TripVault v = _trip(traveler, true);
        _deposit(v, friend, a, friend);
        _deposit(v, stranger, b, stranger);
        vm.warp(block.timestamp + bound(dt, 0, 29 days));
        uint256 ta = v.totalAssets();
        vm.prank(friend);
        uint256 ga = v.withdraw(type(uint256).max);
        vm.prank(stranger);
        uint256 gb = v.withdraw(type(uint256).max);
        assertLe(ga + gb, ta);
        assertGe(ga + 2, a); // never lose more than rounding
        assertGe(gb + 2, b);
    }

    function testFuzz_Leash_CannotExceedCaps(uint256[6] memory amts, uint8[6] memory who) public {
        TripVault v = _trip(traveler, true);
        _deposit(v, traveler, 5_000e6, traveler);
        vm.warp(START);
        address[4] memory vs = [guide, hostA, hostB, stranger];
        for (uint256 i; i < 6; ++i) {
            address to = vs[who[i] % 4];
            uint256 amt = bound(amts[i], 1, 300e6);
            vm.prank(traveler);
            try v.payVendor(to, amt, "f") { } catch { }
        }
        assertLe(v.vendorSpent(guide), 150e6);
        assertLe(v.vendorSpent(hostA), 200e6);
        assertLe(v.vendorSpent(hostB), 200e6);
        assertLe(v.totalSpent(), 450e6);
        assertEq(usdc.balanceOf(stranger), 10_000e6);
        assertEq(usdc.balanceOf(guide) - 10_000e6, v.vendorSpent(guide));
    }
}
