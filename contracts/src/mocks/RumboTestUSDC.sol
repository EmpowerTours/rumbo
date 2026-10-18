// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title  Rumbo Test USDC: TESTNET-ONLY stand-in stablecoin, worth nothing
/// @notice Only deployed when a chain has no canonical test USDC (Monad testnet has Circle's, so the
///         testnet deploy does NOT use this; it is the fallback path and what Solonet dry runs use).
///         Public faucet: anyone can mint to themselves, capped per address per UTC day. NOT for mainnet.
contract RumboTestUSDC is ERC20 {
    string public constant NOTICE = "TESTNET ONLY - Rumbo Test USDC has no value and is not redeemable";
    uint256 public immutable dailyCap;
    mapping(address => mapping(uint256 => uint256)) public mintedOn; // account => UTC day => amount

    error DailyCap(uint256 remaining);

    constructor(uint256 dailyCap_) ERC20("Rumbo Test USDC", "rtUSDC") {
        dailyCap = dailyCap_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function remainingToday(address account) public view returns (uint256) {
        return dailyCap - mintedOn[account][block.timestamp / 1 days];
    }

    /// @notice Mint `amount` test USDC to yourself (≤ dailyCap per address per UTC day).
    function faucet(uint256 amount) external {
        uint256 day = block.timestamp / 1 days;
        uint256 left = dailyCap - mintedOn[msg.sender][day];
        if (amount > left) revert DailyCap(left);
        mintedOn[msg.sender][day] += amount;
        _mint(msg.sender, amount);
    }
}
