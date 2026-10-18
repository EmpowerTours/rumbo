// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IYieldAdapter } from "../interfaces/IYieldAdapter.sol";

/// @title  MockLendingPool: stand-in for Neverland / Morpho on a devnet with no lending market
/// @notice Aave-style liquidity index: balances are stored "scaled" and grow with an index that
///         accrues simple interest per second at `aprBps`. Interest is paid out of tokens the owner
///         seeded into the pool (a real market pays it from borrowers).
///         `fastForward(seconds)` is a DEMO-ONLY knob: Solonet cannot warp time, so this advances the
///         pool's internal clock to show what a month of yield looks like. It does not exist on a real
///         lending market.
contract MockLendingPool is IYieldAdapter {
    using SafeERC20 for IERC20;

    uint256 internal constant RAY = 1e27;
    string public constant NOTICE = "MOCK YIELD - not a real lending market; interest is paid from a reserve the owner seeds";
    address public immutable override asset;
    address public immutable owner;
    uint256 public aprBps;
    uint256 public index = RAY;
    uint256 public lastAccrual;
    uint256 public timeOffset; // demo-only simulated elapsed time
    uint256 public totalScaled;
    mapping(address => uint256) public scaledBalanceOf;

    event Supplied(address indexed who, uint256 assets);
    event Withdrawn(address indexed who, uint256 assets, address to);
    event FastForwarded(uint256 seconds_, uint256 newIndex);

    error NotOwner();
    error Insufficient();
    error ZeroAmount();

    constructor(address asset_, uint256 aprBps_, address owner_) {
        asset = asset_;
        aprBps = aprBps_;
        owner = owner_;
        lastAccrual = block.timestamp;
    }

    function _now() internal view returns (uint256) {
        return block.timestamp + timeOffset;
    }

    function currentIndex() public view returns (uint256) {
        uint256 dt = _now() - lastAccrual;
        return index + Math.mulDiv(index, aprBps * dt, 10_000 * 365 days);
    }

    function _accrue() internal {
        index = currentIndex();
        lastAccrual = _now();
    }

    function deposit(uint256 assets) external override {
        if (assets == 0) revert ZeroAmount();
        _accrue();
        uint256 scaled = Math.mulDiv(assets, RAY, index); // round down: pool-favouring
        scaledBalanceOf[msg.sender] += scaled;
        totalScaled += scaled;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);
        emit Supplied(msg.sender, assets);
    }

    function withdraw(uint256 assets, address to) external override {
        if (assets == 0) revert ZeroAmount();
        _accrue();
        uint256 scaled = Math.mulDiv(assets, RAY, index, Math.Rounding.Ceil); // round up: pool-favouring
        uint256 bal = scaledBalanceOf[msg.sender];
        if (scaled > bal) revert Insufficient();
        scaledBalanceOf[msg.sender] = bal - scaled;
        totalScaled -= scaled;
        IERC20(asset).safeTransfer(to, assets);
        emit Withdrawn(msg.sender, assets, to);
    }

    function balanceOf(address account) public view override returns (uint256) {
        return Math.mulDiv(scaledBalanceOf[account], currentIndex(), RAY);
    }

    function setApr(uint256 bps) external {
        if (msg.sender != owner) revert NotOwner();
        _accrue();
        aprBps = bps;
    }

    /// @notice DEMO ONLY: simulate `seconds_` of elapsed time for interest accrual.
    function fastForward(uint256 seconds_) external {
        if (msg.sender != owner) revert NotOwner();
        _accrue();
        timeOffset += seconds_;
        _accrue();
        emit FastForwarded(seconds_, index);
    }
}
