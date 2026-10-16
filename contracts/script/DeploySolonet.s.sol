// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { MockToken } from "../src/mocks/MockToken.sol";
import { MockLendingPool } from "../src/mocks/MockLendingPool.sol";
import { ToursToken } from "../src/ToursToken.sol";
import { TripVaultFactory } from "../src/TripVaultFactory.sol";
import { Bookings } from "../src/Bookings.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { PerkMarket } from "../src/PerkMarket.sol";
import { Venues } from "../src/Venues.sol";
import { Tickets } from "../src/Tickets.sol";

/// LOCAL Solonet (chain 20143) deployment of the "trip that saves itself while you play" stack.
/// Refuses to run on any other chain. Writes deployments/solonet.json.
///   env: ATTESTER, PARTNER, TREASURY (addresses; the demo derives them from the public test mnemonic)
///        TOURS_TRANSFERABLE (bool, default false = points mode)
///        POOL_APR_BPS (default 500 = 5%)
/// forge script script/DeploySolonet.s.sol --rpc-url http://localhost:8080 --broadcast \
///     --gas-estimate-multiplier 300   (DEPLOYER_PK in env; demo/deploy.mjs reads it from the .pk file)
contract DeploySolonet is Script {
    function run() external {
        require(block.chainid == 20143, "Solonet only");
        address attester = vm.envAddress("ATTESTER");
        address partner = vm.envAddress("PARTNER");
        address treasury = vm.envAddress("TREASURY");
        bool transferable = vm.envOr("TOURS_TRANSFERABLE", false);
        uint256 apr = vm.envOr("POOL_APR_BPS", uint256(500));

        uint256 pk = vm.envUint("DEPLOYER_PK"); // passed via env by demo/deploy.mjs, never written to disk
        vm.startBroadcast(pk);
        address me = vm.addr(pk);
        MockToken usdc = new MockToken("USD Coin (Solonet mock)", "USDC", 6, 1_000_000e6);
        MockLendingPool pool = new MockLendingPool(address(usdc), apr, me);
        ToursToken tours = new ToursToken(me, transferable, 100_000e18);
        TripVaultFactory factory = new TripVaultFactory(me);
        Bookings bookings = new Bookings(me, factory, treasury, 300, 2 days);
        TourRewards rewards = new TourRewards(me, factory, tours, treasury);
        PerkMarket perks = new PerkMarket(me, tours);

        factory.wire(address(bookings), address(rewards));
        Venues venues = new Venues(me, factory, treasury, 300, 3 days);     // 3% of released venue deposits
        Tickets tickets = new Tickets(me, venues, rewards, treasury, 400, 10e18); // 4% ticket fee, 10 $TOURS per scan
        factory.wireVenues(address(venues));
        venues.setAsset(address(usdc), true);
        venues.setAttester(attester, true);
        tickets.setAttester(attester, true);
        rewards.setCheckInSource(address(tickets), true);
        factory.setAsset(address(usdc), true, address(pool));
        bookings.setAsset(address(usdc), true);
        bookings.setAttester(attester, true);
        rewards.setAttester(attester, true);
        rewards.setConfig(treasury, 1_000, 14 days, 50e18, 2e18, 10); // 10% sponsor fee, +2 $TOURS per streak day (max +20)
        rewards.setRewardToken(address(usdc), true, 1e12); // 1 $TOURS per 1 USDC of artist backing spent
        tours.setMinter(address(rewards));
        tours.setTransferAllowlist(address(perks), true);
        perks.setPartner(partner, true);
        usdc.faucet(address(pool), 50_000e6); // interest reserve for the mock market
        vm.stopBroadcast();

        string memory k = "d";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "deployer", me);
        vm.serializeAddress(k, "usdc", address(usdc));
        vm.serializeAddress(k, "pool", address(pool));
        vm.serializeAddress(k, "tours", address(tours));
        vm.serializeAddress(k, "factory", address(factory));
        vm.serializeAddress(k, "bookings", address(bookings));
        vm.serializeAddress(k, "rewards", address(rewards));
        vm.serializeAddress(k, "perks", address(perks));
        vm.serializeAddress(k, "venues", address(venues));
        vm.serializeAddress(k, "tickets", address(tickets));
        vm.serializeAddress(k, "treasury", treasury);
        vm.serializeAddress(k, "attester", attester);
        vm.serializeBool(k, "toursTransferable", transferable);
        string memory out = vm.serializeAddress(k, "partner", partner);
        vm.writeJson(out, "deployments/solonet.json");
        console.log("factory", address(factory));
        console.log("rewards", address(rewards));
        console.log("bookings", address(bookings));
    }
}
