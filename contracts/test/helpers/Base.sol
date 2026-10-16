// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { MockToken } from "../../src/mocks/MockToken.sol";
import { MockLendingPool } from "../../src/mocks/MockLendingPool.sol";
import { ToursToken } from "../../src/ToursToken.sol";
import { TripVault } from "../../src/TripVault.sol";
import { TripVaultFactory } from "../../src/TripVaultFactory.sol";
import { Bookings } from "../../src/Bookings.sol";
import { TourRewards } from "../../src/TourRewards.sol";
import { PerkMarket } from "../../src/PerkMarket.sol";
import { ITripVault } from "../../src/interfaces/ITripVault.sol";
import { Venues } from "../../src/Venues.sol";
import { Tickets } from "../../src/Tickets.sol";

abstract contract Base is Test {
    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address traveler = makeAddr("traveler");
    address friend = makeAddr("friend");
    address guide = makeAddr("guide");
    address hostA = makeAddr("hostA");
    address hostB = makeAddr("hostB");
    address artist = makeAddr("artist");
    address partner = makeAddr("partner");
    address stranger = makeAddr("stranger");
    address venueOax = makeAddr("venueOax");
    address venueCdmx = makeAddr("venueCdmx");
    address fan = makeAddr("fan");
    uint256 attesterPk = 0xA77E57;
    address attester;

    MockToken usdc;
    MockLendingPool pool;
    ToursToken tours;
    TripVaultFactory factory;
    Bookings bookings;
    TourRewards rewards;
    PerkMarket perks;
    Venues venues;
    Tickets tickets;

    uint256 constant T0 = 1_790_000_000;
    uint64 constant START = uint64(T0 + 30 days);
    uint64 constant END = uint64(T0 + 40 days);

    function setUp() public virtual {
        vm.warp(T0);
        attester = vm.addr(attesterPk);
        vm.startPrank(admin);
        usdc = new MockToken("USD Coin (mock)", "USDC", 6, 1_000_000e6);
        pool = new MockLendingPool(address(usdc), 500, admin);
        tours = new ToursToken(admin, false, 1_000_000e18);
        factory = new TripVaultFactory(admin);
        bookings = new Bookings(admin, factory, treasury, 300, 2 days);
        rewards = new TourRewards(admin, factory, tours, treasury);
        perks = new PerkMarket(admin, tours);
        factory.wire(address(bookings), address(rewards));
        venues = new Venues(admin, factory, treasury, 300, 3 days);
        tickets = new Tickets(admin, venues, rewards, treasury, 400, 10e18);
        factory.wireVenues(address(venues));
        venues.setAsset(address(usdc), true);
        rewards.setCheckInSource(address(tickets), true);
        factory.setAsset(address(usdc), true, address(pool));
        bookings.setAsset(address(usdc), true);
        rewards.setAttester(attester, true);
        rewards.setRewardToken(address(usdc), true, 1e12); // 1 TOURS per 1 USDC backed
        tours.setMinter(address(rewards));
        tours.setTransferAllowlist(address(perks), true);
        perks.setPartner(partner, true);
        vm.stopPrank();
        usdc.faucet(address(pool), 100_000e6); // interest reserve
        _fund(traveler, 10_000e6);
        _fund(friend, 10_000e6);
        _fund(guide, 10_000e6);
        _fund(artist, 10_000e6);
        _fund(stranger, 10_000e6);
        _fund(fan, 10_000e6);
    }

    function _fund(address who, uint256 amt) internal {
        usdc.faucet(who, amt);
    }

    function _cfg(bool open_, uint256 goal, uint256 totalCap) internal view returns (TripVault.Config memory c) {
        address[] memory v = new address[](3);
        uint256[] memory caps = new uint256[](3);
        v[0] = guide; caps[0] = 150e6;
        v[1] = hostA; caps[1] = 200e6;
        v[2] = hostB; caps[2] = 200e6;
        c = TripVault.Config({
            owner: address(0), agent: address(0), asset: address(usdc), adapter: address(0),
            kind: ITripVault.Kind.Trip, open: open_, startTime: START, endTime: END, goal: goal, totalCap: totalCap,
            destination: "Oaxaca, MX", vendors: v, vendorCaps: caps
        });
    }

    function _trip(address owner_, bool open_) internal returns (TripVault v) {
        vm.prank(owner_);
        v = TripVault(factory.createVault(_cfg(open_, 500e6, 450e6)));
    }

    function _deposit(TripVault v, address from, uint256 amt, address beneficiary) internal returns (uint256 s) {
        vm.startPrank(from);
        usdc.approve(address(v), amt);
        s = v.deposit(amt, beneficiary);
        vm.stopPrank();
    }

    function _signVisit(TourRewards.Visit memory v) internal view returns (bytes memory) {
        bytes32 d = keccak256(
            abi.encodePacked(
                "\x19\x01",
                rewards.domainSeparator(),
                keccak256(abi.encode(rewards.VISIT_TYPEHASH(), v.user, v.campaignId, v.vault, v.visitedAt, v.visitId))
            )
        );
        (uint8 r_v, bytes32 r, bytes32 s) = vm.sign(attesterPk, d);
        return abi.encodePacked(r, s, r_v);
    }

    function _signCheckIn(uint256 bookingId, address payer, uint64 at, uint256 pk) internal view returns (bytes memory) {
        bytes32 d = keccak256(
            abi.encodePacked(
                "\x19\x01", bookings.domainSeparator(), keccak256(abi.encode(bookings.CHECKIN_TYPEHASH(), bookingId, payer, at))
            )
        );
        (uint8 r_v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, r_v);
    }

    function _campaign(address sponsor, uint128 reward, uint128 toursPer, uint32 cap, uint256 budget) internal returns (uint256 id) {
        vm.startPrank(sponsor);
        usdc.approve(address(rewards), budget);
        id = rewards.createCampaign(address(usdc), reward, toursPer, cap, TourRewards.StopKind.GuideSpot, keccak256("oaxaca-zocalo"), "Zocalo", budget);
        vm.stopPrank();
    }

    function _sign712(bytes32 domain, bytes32 structHash) internal view returns (bytes memory) {
        (uint8 r_v, bytes32 r, bytes32 s) = vm.sign(attesterPk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, r_v);
    }

    function _signShow(uint256 showId, uint8 outcome, uint64 at) internal view returns (bytes memory) {
        return _sign712(venues.domainSeparator(), keccak256(abi.encode(venues.SHOW_TYPEHASH(), showId, outcome, at)));
    }

    function _signScan(uint256 ticketId, address holder, uint64 at) internal view returns (bytes memory) {
        return _sign712(tickets.domainSeparator(), keccak256(abi.encode(tickets.SCAN_TYPEHASH(), ticketId, holder, at)));
    }

    function _signBatch(TourRewards.VisitBatch memory b) internal view returns (bytes memory) {
        return _sign712(rewards.domainSeparator(), keccak256(abi.encode(
            rewards.BATCH_TYPEHASH(), b.user, b.vault, keccak256(abi.encodePacked(b.campaignIds)),
            keccak256(abi.encodePacked(b.visitedAts)), b.batchId)));
    }

    /// venue open for 60 days from the tour start
    function _venue(address owner_, uint16 bps, uint128 deposit, uint128 cancelFee) internal returns (uint256 id) {
        vm.startPrank(owner_);
        id = venues.listVenue(address(usdc), 200, bps, deposit, cancelFee, "Foro", "Oaxaca", "Centro");
        uint32[] memory d = new uint32[](60);
        for (uint256 i; i < 60; ++i) d[i] = uint32(START / 1 days + i);
        venues.setOpenDates(id, d, true);
        venues.setScanner(id, attester, true); // the venue registers its own door scanner
        vm.stopPrank();
    }

    /// artist tour fund with both test venues on the leash
    function _tourFund() internal returns (TripVault v) {
        TripVault.Config memory c = _cfg(true, 2_000e6, 1_000e6);
        c.kind = ITripVault.Kind.ArtistTour;
        c.destination = "Lumbre tour";
        address[] memory vs = new address[](2);
        uint256[] memory caps = new uint256[](2);
        vs[0] = venueOax; caps[0] = 150e6;
        vs[1] = venueCdmx; caps[1] = 200e6;
        c.vendors = vs;
        c.vendorCaps = caps;
        vm.prank(artist);
        v = TripVault(factory.createVault(c));
        _deposit(v, artist, 500e6, artist);
    }

    function _listing(address host, Bookings.Kind k, uint128 price) internal returns (uint256 id) {
        vm.startPrank(host);
        id = bookings.createListing(k, address(usdc), price, 4, 2 days, "Listing", "Oaxaca");
        bookings.setScanner(attester, true); // the host registers its own check-in scanner
        vm.stopPrank();
    }
}
