// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ToursClaimDistributor } from "../src/mainnet/ToursClaimDistributor.sol";
import { SharedToursParams as P } from "../src/mainnet/SharedToursParams.sol";

/// NOT RUN. Deploys ToursClaimDistributor on Monad MAINNET for the shared $TOURS (ToursTokenV2).
/// Parameters APPROVED 2026-10-20 (see SharedToursParams): owner = EmpowerTours 2-of-3 Safe, 250k/epoch,
/// 500 per wallet per epoch, 5,000 per wallet lifetime, 7-day epochs. Broadcasting still needs explicit
/// approval of the deploy itself; funding is a SEPARATE Safe transaction (not done here).
///
/// Simulate only (no key, nothing sent):
///   DIST_PUBLISHER=0x<ops key> \
///   forge script script/DeployToursDistributorMainnet.s.sol --fork-url https://monad-mainnet.drpc.org --sender 0x<deployer>
/// Broadcasting additionally requires CONFIRM_MAINNET=I_APPROVE and --broadcast with the approved key.
contract DeployToursDistributorMainnet is Script {
    address constant TOURS_V2 = P.TOURS_V2; // current shared $TOURS (never the sunset V1 0xf61F…f74f)

    function run() external returns (ToursClaimDistributor d) {
        require(block.chainid == 143, "Monad mainnet only");
        address owner = P.EMPOWERTOURS_SAFE;
        address publisher = vm.envAddress("DIST_PUBLISHER");
        require(publisher != owner && publisher != address(0), "publisher must be a separate ops key");
        uint256 maxEpochIncrease = P.MAX_EPOCH_INCREASE;
        uint256 perWalletPerEpoch = P.MAX_PER_WALLET_PER_EPOCH;
        uint256 maxPerWallet = P.MAX_PER_WALLET;
        uint64 interval = P.MIN_EPOCH_INTERVAL;
        require(owner.code.length > 0, "owner should be the 2-of-3 Safe (a contract)");
        bool broadcast = keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) == keccak256("I_APPROVE");
        if (broadcast) vm.startBroadcast(); else vm.startPrank(msg.sender);
        d = new ToursClaimDistributor(owner, publisher, IERC20(TOURS_V2), maxEpochIncrease, perWalletPerEpoch, maxPerWallet, interval);
        if (broadcast) vm.stopBroadcast(); else vm.stopPrank();
        console2.log(broadcast ? "DEPLOYED" : "SIMULATED (nothing sent)", address(d));
    }
}
