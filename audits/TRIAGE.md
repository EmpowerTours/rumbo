# Static-analysis triage

## Round 3 (per-venue/per-host scanner keys, manual approval, ticket resale)

Tools, both free and run locally on a copy of `contracts/` (Slither runs `forge clean`, so it never touches the real `out/`):
- **Slither 0.11.6** (`pip install slither-analyzer` in a venv) → `audits/slither.md` (checklist, 102 detectors, `lib/` excluded): **48 results** — 3 High, 5 Medium, 33 Low, 7 Informational.
- **Aderyn** (same local install as round 2) → `audits/aderyn.md`: 2 High categories, 11 Low categories — the same categories as round 2.

Nothing in either report points at the new round-3 code paths (`setScanner`, `acceptShow`/`declineShow`, `listForResale`/`buyResale`/`transferTicket`, `acceptBooking`), and no code change was needed. Reasons below.

### Slither
| Detector | Where | Verdict |
|---|---|---|
| reentrancy-balance (High ×2) | `TripVault.book`, `TripVault.bookVenue`: balance read, then `Bookings.book` / `Venues.bookShow`, then `paid != amount` | **False positive / intended.** The balance delta IS the check: it proves the escrow pulled exactly the amount (defends fee-on-transfer / misbehaving escrows). Both functions are `nonReentrant`, the callee is the factory-wired escrow, and a mismatch reverts. |
| uninitialized-state (High) | `TourRewards._claimedBits` | **False positive.** Written through a storage pointer (`mapping storage bits = _claimedBits[user][campaignId]; bits[..] |= ..` at L335); Slither doesn't follow the alias. Covered by `NoDoubleReward` invariant + batch fuzz. |
| incorrect-equality (Med ×2) | `deposit: shares == 0`, `_sweep: idle == 0` | **Accepted.** Intentional zero guards (reject dust deposits that would mint 0 shares; skip a no-op sweep); not balance-equality on attacker-controlled state. |
| uninitialized-local (Med ×2) | `claimBatch`: `token`, `prevAt` | **Accepted.** Zero-init is the intended start value (`prevAt = 0` = no previous visit; `token` set at i = 0). Style only. |
| unused-return (Med) | `_payout`: `vault.deposit` return | **Accepted.** Returns shares, not a success flag; reverts on failure (same as Aderyn L-10). |
| timestamp (Low ×22) | trip windows, show times, check-in windows, cancellation windows | **By design.** Business rules are time-based at minute/hour/day granularity; validator timestamp drift is irrelevant at that scale. |
| reentrancy-benign / reentrancy-events (Low ×5) | vault bookkeeping after `book`/`bookShow`; `VaultCallbackFailed` after the guarded callback; `VaultCreated` after `initialize` | **Accepted.** All `nonReentrant` or factory-internal; callbacks are gas-capped in try/catch after state is final (same reasoning as round-2 Aderyn H-1). |
| calls-loop (Low) | `Tickets.refundAll` → `_refund` transfers | **Accepted.** Bounded by the caller's `max` cursor; a reverting holder can't block others because refunds are pull-by-anyone per ticket too (`refund(id)`). |
| missing-zero-check (Low ×4) | `TripVault.initialize(factory_)`, `setAgent`, mock pool ctor | **Accepted.** `factory_` is always the factory (`msg.sender` in `createVault`); `agent = 0` is the documented "no agent" value; mocks. |
| events-maths (Low) | `MockLendingPool.setApr` | Mock only. |
| missing-inheritance (Info) | `Bookings` vs `IBookings` | **Accepted.** `IBookings` is the narrow interface the vault uses; `Bookings` implements it structurally. |
| unindexed-event-address (Info ×6) | several events | Style; indexers read all fields. |

### Aderyn (diff vs round 2)
- **H-1 reentrancy: 26 instances (was 24).** The two new ones are `Tickets.scan` (state written after the *view* calls `venues.showInfo` and `venues.isShowScanner`). Same verdict as round 2: `nonReentrant`, trusted factory-wired contracts, view calls. `buyResale` follows checks-effects-interactions (ticket moved, counters bumped, then the three `safeTransferFrom`s) and is not flagged.
- **H-2 unsafe casting (2):** unchanged — `uint64(listingId)` / `uint64(showId)` are array indices.
- **L-8 state change without event:** only `TripVault.initialize` and the mock remain. The round-3 setters all emit (`ScannerSet`, `ManualApprovalSet`, `ResaleConfigSet`, `BookingAccepted`, `ShowAccepted`/`ShowDeclined`, `ResaleListed`/`ResaleCancelled`/`ResaleBought`/`TicketTransferred`).
- All other lows: same categories and reasons as round 2 below.

### Design notes reviewed by hand this round
- **Scanner keys:** escrow releases (show attestation, ticket scans, booking check-ins) now accept only keys registered by *that* venue (`Venues.isScanner[venueId][key]`) or *that* host (`Bookings.isScanner[host][key]`). The global Hunt attester only signs Hunt GPS visits (`TourRewards`). A leaked venue key can only affect that venue's shows. Tests: `Round3.t.sol` scanner tests.
- **Resale:** cap 110% of face (owner-adjustable within 100–150%), 5% artist royalty (≤ 20%), the show's snapshotted EmpowerTours fee; escrow stays at face value, so refunds on cancellation pay face to the current holder and `EscrowsExact`/`AlwaysResolves` still hold. Door-scalping lock: once a show's first ticket is scanned (or the show is Played), tickets can only move to someone who already holds one for that show (`invariant_NoDoorScalping`).
- **Manual approval:** a pending request blocks ticket sales and `confirmShow`; a decline is a full refund and does not count against the venue's reliability; an artist withdrawing a pending request pays no fee.

---

## Round 2 (Aderyn: Venues, Tickets, batched claims)

Tool: Aderyn (local install), run on `contracts/src` after the round-2 fixes (the round-2 report was replaced by the round-3 run in `audits/aderyn.md`).

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
