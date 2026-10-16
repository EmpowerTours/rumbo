// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { ToursToken } from "./ToursToken.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title  PerkMarket: partners list perks priced in $TOURS; travelers redeem them
/// @notice Partners (approved by EmpowerTours) list perks such as "10% off a Oaxaca food tour",
///         "front-row spot" or "backstage pass". Redeeming moves the $TOURS from the traveler into this
///         contract and then either BURNS it (default: points leave circulation) or forwards it to the
///         partner (who can then use it in the same market, e.g. to offer co-promotions). The partner
///         honours the perk off-chain by checking the `Redeemed` event (redemption id + user).
///         Works in both $TOURS modes: in points mode this contract must be on the token's allowlist.
contract PerkMarket is Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Perk {
        address partner;
        uint128 price;            // $TOURS (18 decimals)
        uint32 remaining;         // supply left
        uint32 redeemed;
        uint16 maxPerUser;        // 0 = unlimited
        bool burn;                // true: burn; false: forward to partner
        bool active;
        string title;
        string partnerName;
    }

    ToursToken public immutable tours;
    mapping(address => bool) public approvedPartner;
    Perk[] internal _perks;
    mapping(uint256 => mapping(address => uint16)) public redeemedBy;
    uint256 public redemptionCount;
    uint256 public totalBurned;

    event PartnerSet(address indexed partner, bool approved);
    event PerkListed(uint256 indexed perkId, address indexed partner, uint256 price, uint32 supply, bool burn, string title);
    event PerkUpdated(uint256 indexed perkId, uint256 price, uint32 remaining, bool active);
    event Redeemed(uint256 indexed redemptionId, uint256 indexed perkId, address indexed user, address partner, uint256 price, bool burned);

    error NotPartner();
    error Inactive();
    error SoldOut();
    error UserLimit();
    error BadConfig();
    error UnknownPerk();

    constructor(address owner_, ToursToken tours_) Ownable(owner_) {
        if (address(tours_).code.length == 0) revert BadConfig();
        tours = tours_;
    }

    function setPartner(address p, bool approved) external onlyOwner {
        if (p == address(0)) revert BadConfig();
        approvedPartner[p] = approved;
        emit PartnerSet(p, approved);
    }

    function listPerk(
        uint128 price,
        uint32 supply,
        uint16 maxPerUser,
        bool burn,
        string calldata title,
        string calldata partnerName
    ) external returns (uint256 id) {
        if (!approvedPartner[msg.sender]) revert NotPartner();
        if (price == 0 || supply == 0) revert BadConfig();
        id = _perks.length;
        _perks.push(Perk(msg.sender, price, supply, 0, maxPerUser, burn, true, title, partnerName));
        emit PerkListed(id, msg.sender, price, supply, burn, title);
    }

    function updatePerk(uint256 id, uint128 price, uint32 remaining, bool active) external {
        Perk storage p = _perk(id);
        if (msg.sender != p.partner) revert NotPartner();
        if (price == 0) revert BadConfig();
        p.price = price;
        p.remaining = remaining;
        p.active = active;
        emit PerkUpdated(id, price, remaining, active);
    }

    /// @notice Redeem a perk. Needs `tours.approve(perkMarket, price)` first.
    function redeem(uint256 id) external nonReentrant returns (uint256 redemptionId) {
        Perk storage p = _perk(id);
        if (!p.active || !approvedPartner[p.partner]) revert Inactive();
        if (p.remaining == 0) revert SoldOut();
        uint16 n = redeemedBy[id][msg.sender];
        if (p.maxPerUser != 0 && n >= p.maxPerUser) revert UserLimit();
        redeemedBy[id][msg.sender] = n + 1;
        p.remaining -= 1;
        p.redeemed += 1;
        redemptionId = ++redemptionCount;
        uint256 price = p.price;
        IERC20(address(tours)).safeTransferFrom(msg.sender, address(this), price);
        if (p.burn) {
            totalBurned += price;
            tours.burn(price);
        } else {
            IERC20(address(tours)).safeTransfer(p.partner, price);
        }
        emit Redeemed(redemptionId, id, msg.sender, p.partner, price, p.burn);
    }

    function _perk(uint256 id) internal view returns (Perk storage) {
        if (id >= _perks.length) revert UnknownPerk();
        return _perks[id];
    }

    function getPerk(uint256 id) external view returns (Perk memory) { return _perk(id); }
    function perkCount() external view returns (uint256) { return _perks.length; }
}
