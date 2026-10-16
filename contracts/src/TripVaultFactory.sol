// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TripVault } from "./TripVault.sol";
import { ITripVaultFactory } from "./interfaces/ITripVault.sol";
import { IYieldAdapter } from "./interfaces/IYieldAdapter.sol";

/// @title  TripVaultFactory: opens TripVaults (EIP-1167 clones) and is the registry other contracts
///         trust to tell a real vault from an impostor.
/// @notice The owner lists which assets may be saved in and the ONE yield adapter per asset. A vault's
///         adapter is fixed at creation, so changing the listed adapter only affects new vaults.
///         `bookings` and `rewards` are write-once wiring (deploy order: factory -> bookings/rewards).
contract TripVaultFactory is ITripVaultFactory, Ownable2Step {
    address public immutable implementation;
    address public override bookings;
    address public override rewards;
    address public override venues;

    mapping(address asset => bool) public assetAllowed;
    mapping(address asset => address) public adapterFor;
    mapping(address => bool) public override isVault;
    mapping(address owner => address[]) internal _vaultsOf;
    address[] public allVaults;

    event AssetSet(address indexed asset, bool allowed, address adapter);
    event Wired(address bookings, address rewards);
    event VenuesWired(address venues);
    event VaultCreated(address indexed vault, address indexed owner, string destination, uint256 goal, uint64 startTime);

    error AlreadyWired();
    error ZeroAddress();
    error AssetNotAllowed(address asset);
    error BadAdapter();

    constructor(address owner_) Ownable(owner_) {
        implementation = address(new TripVault());
    }

    function wire(address bookings_, address rewards_) external onlyOwner {
        if (bookings != address(0)) revert AlreadyWired();
        if (bookings_ == address(0) || rewards_ == address(0)) revert ZeroAddress();
        bookings = bookings_;
        rewards = rewards_;
        emit Wired(bookings_, rewards_);
    }

    /// @notice Write-once wiring of the Venues escrow (added after bookings/rewards).
    function wireVenues(address venues_) external onlyOwner {
        if (venues != address(0)) revert AlreadyWired();
        if (venues_ == address(0)) revert ZeroAddress();
        venues = venues_;
        emit VenuesWired(venues_);
    }

    function setAsset(address asset, bool allowed, address adapter) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        if (adapter != address(0) && IYieldAdapter(adapter).asset() != asset) revert BadAdapter();
        assetAllowed[asset] = allowed;
        adapterFor[asset] = adapter;
        emit AssetSet(asset, allowed, adapter);
    }

    /// @notice Open a vault owned by msg.sender. `c.owner` and `c.adapter` are overwritten.
    function createVault(TripVault.Config memory c) external returns (address vault) {
        if (!assetAllowed[c.asset]) revert AssetNotAllowed(c.asset);
        c.owner = msg.sender;
        c.adapter = adapterFor[c.asset];
        vault = Clones.clone(implementation);
        isVault[vault] = true;
        _vaultsOf[msg.sender].push(vault);
        allVaults.push(vault);
        TripVault(vault).initialize(address(this), c);
        emit VaultCreated(vault, msg.sender, c.destination, c.goal, c.startTime);
    }

    function vaultsOf(address owner_) external view returns (address[] memory) {
        return _vaultsOf[owner_];
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }
}
