// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IVenues {
    enum ShowStatus { None, Booked, Played, VenueCancelled, ArtistCancelled, ArtistNoShow, Expired }

    struct ShowInfo {
        ShowStatus status;
        uint64 showTime;
        uint32 maxTickets;
        uint16 venueTicketBps;
        uint128 ticketPrice;
        address artist;       // payout wallet (vault owner when booked from a tour fund)
        address venueOwner;
        address asset;
    }

    function quote(uint256 venueId) external view returns (address venueOwner, address asset, uint256 deposit);
    function bookShow(uint256 venueId, uint64 showTime, uint128 ticketPrice, uint32 maxTickets, string calldata title, uint256 maxDeposit)
        external
        returns (uint256 showId);
    function artistCancel(uint256 showId) external;
    function showInfo(uint256 showId) external view returns (ShowInfo memory);
    function showStatus(uint256 showId) external view returns (uint8 status, address payer, uint256 refunded);
    function awaitingApproval(uint256 showId) external view returns (bool);
    function isShowScanner(uint256 showId, address signer) external view returns (bool);
}
