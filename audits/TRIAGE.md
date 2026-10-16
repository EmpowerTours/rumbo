# Aderyn triage (round 2: Venues, Tickets, batched claims)

Report: `audits/aderyn.md`. Tool: Aderyn (local install), run on `contracts/src` after the round-2 fixes.

## Fixed this round
- **Unsafe casting (H-2):** `TourRewards` campaign budget `uint128(net)` → `SafeCast.toUint128` (create + fund); `Tickets` gross sales `uint128(total)` → `SafeCast.toUint128` (qty ≤ 20 × a uint128 price could in theory exceed uint128).
- **State change without event (L-8):** added `AttesterSet` to `Venues` and `Tickets`, and `AssetSet` to `Venues`.

## Accepted / false positives
- **H-1 reentrancy, 24 instances:** every flagged function is `nonReentrant` (`ReentrancyGuardTransient`), and every external call goes to a *trusted* contract: allowlisted ERC20s (balance-delta checks), the factory-wired `Venues`/`Bookings`, the factory registry (`isVault`), `venues.showInfo` (view), or the yield adapter set by the factory owner. Vault callbacks from escrows run with a gas guard inside try/catch after state is final (`_notify`), so they can't re-enter or block resolution. The invariant suites (`EscrowsExact`, `AlwaysResolves`, `EscrowAlwaysResolves`) cover the outcomes.
- **H-2 remaining (2):** `uint64(listingId)` in Bookings and `uint64(showId)` in Tickets; both are array indices (< length) — cannot exceed uint64.
- **L-1 centralization:** owner-set fees (capped: Venues ≤ 5%, Tickets ≤ 10%, Bookings ≤ 5%, sponsor ≤ 20%), attesters, check-in sources and asset allowlists. By design for the prototype; mainnet would use a 2-of-3 Safe + timelock.
- **L-2 / L-7 loops:** loops are bounded (`MAX_BATCH = 64`, `qty ≤ 20`, `refundAll(max)` cursor, `MAX_VENDORS`).
- **L-3 / L-4 literals, L-5 shadowing, L-6 modifier order, L-11 public-not-internal:** style; no behavior impact.
- **L-8 remaining:** `TripVault.initialize` (emits `Initialized` via factory `VaultCreated`) and the mock pool.
- **L-9:** constructor/initializer addresses validated by the factory/zero checks upstream.
- **L-10 unchecked return:** `ITripVault.deposit` in `TourRewards._payout` returns shares, not a success flag (reverts on failure).
