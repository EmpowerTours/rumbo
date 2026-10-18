// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ToursClaimDistributor } from "../src/mainnet/ToursClaimDistributor.sol";

/// NOT RUN. Deploys ToursClaimDistributor on Monad MAINNET for the shared $TOURS (ToursTokenV2).
/// Needs EmpowerTours' explicit approval of every parameter below, MON for gas, and then a SEPARATE
/// funding transfer of $TOURS from the treasury (not done here).
///
/// Simulate only (no key, nothing sent):
///   DIST_OWNER=0x<2-of-3 Safe> DIST_PUBLISHER=0x<ops key> \
///   forge script script/DeployToursDistributorMainnet.s.sol --fork-url https://monad-mainnet.drpc.org --sender 0x<deployer>
/// Broadcasting additionally requires CONFIRM_MAINNET=I_APPROVE and --broadcast with the approved key.
contract DeployToursDistributorMainnet is Script {
    address constant TOURS_V2 = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF; // current shared $TOURS (art app config-check, 2026-10-18)

    function run() external returns (ToursClaimDistributor d) {
        require(block.chainid == 143, "Monad mainnet only");
        address owner = vm.envAddress("DIST_OWNER");
        address publisher = vm.envAddress("DIST_PUBLISHER");
        // PROPOSED defaults (whole TOURS); every one is immutable once deployed, except owner/publisher.
        uint256 maxEpochIncrease = vm.envOr("DIST_MAX_EPOCH", uint256(250_000)) * 1e18;
        uint256 perWalletPerEpoch = vm.envOr("DIST_PER_WALLET_EPOCH", uint256(500)) * 1e18;
        uint256 maxPerWallet = vm.envOr("DIST_MAX_PER_WALLET", uint256(5_000)) * 1e18;
        uint64 interval = uint64(vm.envOr("DIST_INTERVAL_DAYS", uint256(7)) * 1 days);
        require(owner.code.length > 0, "owner should be the 2-of-3 Safe (a contract)");
        bool broadcast = keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) == keccak256("I_APPROVE");
        if (broadcast) vm.startBroadcast(); else vm.startPrank(msg.sender);
        d = new ToursClaimDistributor(owner, publisher, IERC20(TOURS_V2), maxEpochIncrease, perWalletPerEpoch, maxPerWallet, interval);
        if (broadcast) vm.stopBroadcast(); else vm.stopPrank();
        console2.log(broadcast ? "DEPLOYED" : "SIMULATED (nothing sent)", address(d));
    }
}
