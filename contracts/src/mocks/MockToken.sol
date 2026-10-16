// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Devnet-only stand-in for USDC / WMON. Anyone can faucet (capped per call). NOT for mainnet.
contract MockToken is ERC20 {
    uint8 private immutable _dec;
    uint256 public immutable faucetCap;

    error FaucetCap();

    constructor(string memory n, string memory s, uint8 d, uint256 faucetCap_) ERC20(n, s) {
        _dec = d;
        faucetCap = faucetCap_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function faucet(address to, uint256 amount) external {
        if (amount > faucetCap) revert FaucetCap();
        _mint(to, amount);
    }
}
