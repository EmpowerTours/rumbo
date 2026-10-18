// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RumboTestUSDC } from "../src/mocks/RumboTestUSDC.sol";
import { MockLendingPool } from "../src/mocks/MockLendingPool.sol";
import { ToursToken } from "../src/ToursToken.sol";
import { TripVaultFactory } from "../src/TripVaultFactory.sol";
import { Bookings } from "../src/Bookings.sol";
import { TourRewards } from "../src/TourRewards.sol";
import { PerkMarket } from "../src/PerkMarket.sol";
import { Venues } from "../src/Venues.sol";
import { Tickets } from "../src/Tickets.sol";

/// Rumbo on Monad TESTNET (chain 10143). Never mainnet: the script refuses any chain but 10143
/// (and 20143 = local Solonet, for dry runs only, which writes a separate *-dryrun file).
/// No demo accounts, no seeded listings, no demo vaults: an empty production stack.
///
/// Stablecoin: Circle's canonical testnet USDC (0x534b…43A3, 6 decimals; listed in the official
/// monad-crypto token list). Users get it from faucet.circle.com. Only if USDC=0x0 is passed (or on
/// Solonet, which has no Circle USDC) does it deploy "Rumbo Test USDC" (rtUSDC) with a public faucet
/// capped per address per UTC day.
///
/// Yield: there is no lending market on testnet, so the vault yield adapter is MockLendingPool, which is
/// labelled MOCK YIELD on-chain (NOTICE) and in the deployments file. It pays interest from a reserve
/// the owner seeds. It is only attached to vaults when MOCK_YIELD_RESERVE > 0 is seeded in this run;
/// an unseeded pool with APR > 0 could not pay out the interest it promises, so vaults stay idle.
///
/// Admin: every owner/treasury/attester/partner role defaults to the DEPLOYER on testnet.
/// Before mainnet, ownership moves to the EmpowerTours 2-of-3 Safe (see README).
///
///   env: DEPLOYER_PK (required; the node wrapper reads it from a file and never prints it)
///        USDC (default canonical testnet USDC; 0x0 = deploy Rumbo Test USDC)
///        TREASURY, ATTESTER, PARTNER (default deployer)
///        TOURS_TRANSFERABLE (default false = points mode)
///        POOL_APR_BPS (default 300), MOCK_YIELD_RESERVE (default 0, 6-dec USDC units)
///        FAUCET_DAILY_CAP (default 1,000 rtUSDC; fallback token only)
///        OUT (default deployments/monad-testnet.json)
contract DeployTestnet is Script {
    address constant CIRCLE_TESTNET_USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    function run() external {
        bool solonet = block.chainid == 20143;
        require(block.chainid == 10143 || solonet, "Monad testnet (10143) only; Solonet 20143 for dry runs");
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address me = vm.addr(pk);
        address usdcEnv = vm.envOr("USDC", solonet ? address(0) : CIRCLE_TESTNET_USDC);
        address treasury = vm.envOr("TREASURY", me);
        address attester = vm.envOr("ATTESTER", me);
        address partner = vm.envOr("PARTNER", me);
        bool transferable = vm.envOr("TOURS_TRANSFERABLE", false);
        uint256 apr = vm.envOr("POOL_APR_BPS", uint256(300));
        uint256 reserve = vm.envOr("MOCK_YIELD_RESERVE", uint256(0));
        string memory out = vm.envOr("OUT", string(solonet ? "deployments/monad-testnet-dryrun-solonet.json" : "deployments/monad-testnet.json"));
        uint256 fromBlock = block.number;

        if (usdcEnv != address(0)) {
            require(usdcEnv.code.length > 0, "USDC has no code on this chain");
            require(IERC20Metadata(usdcEnv).decimals() == 6, "USDC must have 6 decimals");
        }

        vm.startBroadcast(pk);
        bool testToken = usdcEnv == address(0);
        address usdc = testToken ? address(new RumboTestUSDC(vm.envOr("FAUCET_DAILY_CAP", uint256(1_000e6)))) : usdcEnv;
        MockLendingPool pool = new MockLendingPool(usdc, apr, me);
        ToursToken tours = new ToursToken(me, transferable, 100_000e18);
        TripVaultFactory factory = new TripVaultFactory(me);
        Bookings bookings = new Bookings(me, factory, treasury, 300, 2 days);
        TourRewards rewards = new TourRewards(me, factory, tours, treasury);
        PerkMarket perks = new PerkMarket(me, tours);
        Venues venues = new Venues(me, factory, treasury, 300, 3 days);
        Tickets tickets = new Tickets(me, venues, rewards, treasury, 400, 10e18);

        factory.wire(address(bookings), address(rewards));
        factory.wireVenues(address(venues));
        if (testToken && reserve > 0) RumboTestUSDC(usdc).faucet(reserve); // ≤ daily cap
        bool yieldOn = reserve > 0;
        if (yieldOn) IERC20(usdc).transfer(address(pool), reserve); // interest reserve for the MOCK pool
        factory.setAsset(usdc, true, yieldOn ? address(pool) : address(0));
        venues.setAsset(usdc, true);
        bookings.setAsset(usdc, true);
        rewards.setCheckInSource(address(tickets), true);
        rewards.setAttester(attester, true);
        rewards.setConfig(treasury, 1_000, 14 days, 50e18, 2e18, 10);
        rewards.setRewardToken(usdc, true, 1e12);
        tours.setMinter(address(rewards));
        tours.setTransferAllowlist(address(perks), true);
        perks.setPartner(partner, true);
        vm.stopBroadcast();

        string memory k = "d";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "fromBlock", fromBlock);
        vm.serializeAddress(k, "deployer", me);
        vm.serializeAddress(k, "admin", me);
        vm.serializeString(k, "adminNote", "Testnet admin is the deployer; moves to the EmpowerTours 2-of-3 Safe before mainnet");
        vm.serializeAddress(k, "usdc", usdc);
        vm.serializeString(k, "usdcLabel", testToken ? "Rumbo Test USDC (rtUSDC) - TESTNET ONLY, no value; public faucet capped per address per day" : "Circle USDC (Monad testnet, canonical) - faucet.circle.com");
        vm.serializeAddress(k, "pool", address(pool));
        vm.serializeString(k, "poolLabel", "MOCK YIELD - not a real lending market; testnet only");
        vm.serializeBool(k, "mockYieldAttached", yieldOn);
        vm.serializeUint(k, "mockYieldAprBps", apr);
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
        string memory json = vm.serializeAddress(k, "partner", partner);
        vm.writeJson(json, out);
        console.log("Rumbo testnet stack deployed; wrote", out);
    }
}
