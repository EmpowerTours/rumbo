// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What a TripVault needs from a yield source. Real deployments would wrap Neverland (Aave
///         fork: supply/withdraw + aToken balance) or a Morpho vault (ERC4626 deposit/withdraw) behind
///         this interface; each caller's balance is tracked separately.
interface IYieldAdapter {
    function asset() external view returns (address);
    /// @dev pulls `assets` of `asset()` from msg.sender (needs allowance)
    function deposit(uint256 assets) external;
    /// @dev sends exactly `assets` to `to` out of msg.sender's position; reverts if not enough
    function withdraw(uint256 assets, address to) external;
    /// @dev msg-sender-independent view of `account`'s current position incl. accrued interest
    function balanceOf(address account) external view returns (uint256);
}
