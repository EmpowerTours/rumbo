// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ITripVault {
    enum Kind { Trip, ArtistTour }

    function owner() external view returns (address);
    function agent() external view returns (address);
    function asset() external view returns (address);
    function kind() external view returns (Kind);
    function cancelled() external view returns (bool);
    function totalSpent() external view returns (uint256);
    function totalPrincipal() external view returns (uint256);
    function principalOf(address c) external view returns (uint256);
    function acceptsDeposits(address beneficiary) external view returns (bool);
    function deposit(uint256 amount, address beneficiary) external returns (uint256 shares);
    /// @dev escrow callback when a booking paid by this vault resolves (release or refund)
    function onBookingSettled(uint256 bookingId, bool refunded, uint256 amount) external;
    /// @dev Venues callback when a show booked by this vault resolves; `refunded` = amount that came back
    function onShowSettled(uint256 showId, uint256 refunded) external;
}

interface ITripVaultFactory {
    function isVault(address v) external view returns (bool);
    function bookings() external view returns (address);
    function rewards() external view returns (address);
    function venues() external view returns (address);
}

interface IBookings {
    function quote(uint256 listingId, uint32 units) external view returns (address host, address asset, uint256 amount);
    function book(uint256 listingId, uint32 units, uint64 startAt, uint256 maxAmount) external returns (uint256 bookingId);
    function confirmCheckIn(uint256 bookingId) external;
    function travelerCancel(uint256 bookingId) external;
    function bookingStatus(uint256 bookingId) external view returns (uint8 status, address payer, uint256 amount);
}
