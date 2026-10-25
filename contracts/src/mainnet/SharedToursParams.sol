// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// Shared $TOURS reward programme parameters APPROVED by EmpowerTours on 2026-10-20 (Asia/Shanghai).
/// Caps and interval become immutable in ToursClaimDistributor once deployed.
library SharedToursParams {
    /// Current shared $TOURS on Monad mainnet (chain 143). NEVER the sunset V1 0xf61F…f74f.
    address internal constant TOURS_V2 = 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF;
    /// EmpowerTours 2-of-3 platform Safe: distributor owner and budget holder.
    address internal constant EMPOWERTOURS_SAFE = 0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA;
    /// Budget source: idle ToursRewardManagerV2 (art app), holds exactly 1,000,000 TOURS.
    address internal constant BUDGET_SOURCE = 0x056452a44d81AB502e24510b2e4FB1789C6faf85;
    /// Current owner of TOURS_V2 and BUDGET_SOURCE (single EOA).
    address internal constant OWNER_EOA = 0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1;

    uint256 internal constant PROGRAMME_BUDGET = 1_000_000e18;
    uint256 internal constant RATE_BPS = 10_000; // 1 testnet point = 1 $TOURS
    uint256 internal constant MAX_EPOCH_INCREASE = 250_000e18;
    uint256 internal constant MAX_PER_WALLET_PER_EPOCH = 500e18;
    uint256 internal constant MAX_PER_WALLET = 5_000e18;
    uint64 internal constant MIN_EPOCH_INTERVAL = 7 days;
}
