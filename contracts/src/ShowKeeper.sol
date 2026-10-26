// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Venues } from "./Venues.sol";
import { Tickets } from "./Tickets.sol";
import { IVenues } from "./interfaces/IVenues.sol";

/// Same shape as the Monad scheduled-transactions MIP draft `schedule()`.
interface IScheduler {
    function schedule(uint256 targetBlock, address to, uint256 value, uint256 gasLimit, bytes calldata data)
        external payable returns (uint64 handle);
    function getQuote(uint256 targetBlock, uint256 gasLimit) external view returns (uint256);
    function MAX_WINDOW() external view returns (uint256);
}

/**
 * @title ShowKeeper
 * @notice Drives a show's end of life with no off-chain keeper:
 *         - Booked, past showTime + resolveTimeout, still unattested  -> Venues.expire()
 *         - Played                                                   -> Tickets.settle()
 *         - Cancelled / no-show / expired                            -> Tickets.refundAll() in chunks
 * @dev    Venues and Tickets are NOT modified. expire / settle / refundAll are already callable
 *         by anyone, so this contract needs no role on them.
 *         - `tick(showId)` is permissionless and idempotent. It does at most one step and
 *           re-arms itself through an optional scheduler (draft-compatible IScheduler).
 *         - Until a scheduler exists, `poke(showId)` pays a one-time bounty to whoever makes
 *           progress on a show later than its deadline + GRACE.
 *         - Only one scheduled tick per show can be pending, so spamming tick() can't burn the
 *           fee budget.
 */
contract ShowKeeper is ReentrancyGuardTransient {
    uint64 public constant GRACE = 6 hours;
    /// Pessimistic block time (ms). Monad measures about 302.6 ms; a smaller value only makes us early -> hop, never late.
    uint256 public constant BLOCK_MS_PESSIMISTIC = 280;

    Venues public immutable venues;
    Tickets public immutable tickets;
    IScheduler public immutable scheduler;   // address(0) => bounty-only mode
    uint256 public immutable chunk;          // refunds per tick
    uint256 public immutable tickGas;

    struct Job { bool watched; bool done; bool bountyPaid; uint128 bounty; address funder; uint64 armedBlock; }
    mapping(uint256 => Job) public jobs;
    uint256 public reservedBounties;        // MON held for bounties, never spent on scheduler fees

    enum Step { None, Waiting, Expired, Settled, Refunded, Done }

    event Watched(uint256 indexed showId, address indexed funder, uint256 bounty);
    event Stepped(uint256 indexed showId, Step step, address indexed by);
    event Armed(uint256 indexed showId, uint256 targetBlock, uint64 handle);
    event ArmFailed(uint256 indexed showId, uint256 targetBlock);
    event BountyPaid(uint256 indexed showId, address indexed to, uint256 amount);

    error AlreadyWatched();
    error NotWatched();
    error NothingDue();
    error NotFunder();

    constructor(Venues venues_, Tickets tickets_, IScheduler scheduler_, uint256 chunk_, uint256 tickGas_) {
        venues = venues_;
        tickets = tickets_;
        scheduler = scheduler_;
        chunk = chunk_;
        tickGas = tickGas_;
    }

    receive() external payable {}

    /// Anyone (artist, venue, a fan, the UI at booking time) can register a show.
    /// msg.value funds that show's bounty; scheduler fees come from the contract's balance.
    function watch(uint256 showId) external payable {
        venues.getShow(showId); // reverts Unknown() for a bad id
        Job storage j = jobs[showId];
        if (j.watched) revert AlreadyWatched();
        j.watched = true;
        j.bounty = uint128(msg.value);
        j.funder = msg.sender;
        reservedBounties += msg.value;
        emit Watched(showId, msg.sender, msg.value);
        _arm(showId, _deadline(showId) + 1);
    }

    function deadline(uint256 showId) external view returns (uint256) { return _deadline(showId); }

    function _deadline(uint256 showId) internal view returns (uint256) {
        Venues.Show memory s = venues.getShow(showId);
        return uint256(s.showTime) + s.resolveTimeout;
    }

    /// One step of the show's lifecycle; re-arms if more work remains.
    function tick(uint256 showId) public nonReentrant returns (Step step) {
        Job storage j = jobs[showId];
        if (!j.watched) revert NotWatched();
        if (j.done) return Step.None;
        step = _step(showId);
        if (step == Step.None) return step;
        emit Stepped(showId, step, msg.sender);
        if (step == Step.Done) { j.done = true; return step; }
        if (step == Step.Waiting) _arm(showId, _deadline(showId) + 1);
        else _arm(showId, 0); // more to do: next block window
    }

    function _step(uint256 showId) internal returns (Step) {
        Venues.Show memory s = venues.getShow(showId);
        IVenues.ShowStatus st = s.status;
        if (st == IVenues.ShowStatus.Booked) {
            if (block.timestamp <= uint256(s.showTime) + s.resolveTimeout) return Step.Waiting;
            venues.expire(showId);
            return Step.Expired;
        }
        if (st == IVenues.ShowStatus.Played) {
            (,,,, bool settled,,,) = tickets.sales(showId);
            if (settled) { jobs[showId].done = true; return Step.None; } // someone else settled
            tickets.settle(showId);
            return Step.Done;
        }
        if (uint8(st) >= uint8(IVenues.ShowStatus.VenueCancelled)) {
            uint256 n = tickets.ticketsOfShow(showId).length;
            (,, uint32 cursor,,,,,) = tickets.sales(showId);
            if (cursor >= n) { jobs[showId].done = true; return Step.None; }
            tickets.refundAll(showId, chunk);
            (,, cursor,,,,,) = tickets.sales(showId);
            return cursor >= n ? Step.Done : Step.Refunded;
        }
        return Step.None; // status None: nothing to do
    }

    /// Bounty fallback: progress made after deadline + GRACE pays the caller once per show.
    function poke(uint256 showId) external returns (Step step) {
        step = tick(showId);
        // Only real progress (expire / settle / a refund chunk) earns the bounty.
        if (step == Step.Waiting || step == Step.None) revert NothingDue();
        Job storage j = jobs[showId];
        if (block.timestamp > _deadline(showId) + GRACE && !j.bountyPaid && j.bounty > 0) {
            j.bountyPaid = true;
            uint256 b = j.bounty;
            j.bounty = 0;
            reservedBounties -= b;
            emit BountyPaid(showId, msg.sender, b);
            (bool ok,) = msg.sender.call{ value: b }("");
            require(ok, "bounty");
        }
    }

    /// The funder can take back an unused bounty once the show is done.
    function reclaimBounty(uint256 showId) external nonReentrant {
        Job storage j = jobs[showId];
        if (msg.sender != j.funder) revert NotFunder();
        if (!j.done) revert NothingDue();
        uint256 b = j.bounty;
        j.bounty = 0;
        reservedBounties -= b;
        (bool ok,) = msg.sender.call{ value: b }("");
        require(ok, "reclaim");
    }

    function _arm(uint256 showId, uint256 atTime) internal {
        IScheduler s = scheduler;
        if (address(s) == address(0)) return;
        Job storage j = jobs[showId];
        if (j.armedBlock > block.number) return; // one pending tick per show
        uint256 ahead = atTime > block.timestamp ? ((atTime - block.timestamp) * 1000) / BLOCK_MS_PESSIMISTIC : 0;
        uint256 maxW = s.MAX_WINDOW();
        if (ahead > maxW) ahead = maxW; // hop
        if (ahead < 2) ahead = 2;
        uint256 target = block.number + ahead;
        try s.getQuote(target, tickGas) returns (uint256 fee) {
            if (address(this).balance < fee + reservedBounties) { emit ArmFailed(showId, target); return; }
            try s.schedule{ value: fee }(target, address(this), 0, tickGas, abi.encodeCall(this.tick, (showId))) returns (uint64 h) {
                j.armedBlock = uint64(target);
                emit Armed(showId, target, h);
            } catch { emit ArmFailed(showId, target); }
        } catch { emit ArmFailed(showId, target); }
    }
}
