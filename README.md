# EmpowerTours · a trip that saves itself while you play

> **Local prototype only.** It runs on Monad **Solonet** on this box (`http://localhost:8080`, chain 20143) with mock USDC and public test accounts. It has no remote and has not been deployed anywhere public. Nothing touches mainnet. We're holding off on anything public until Monad Metropolis results come out (Nov 3).

You pick a dream trip, for example **"Oaxaca, March, 500 USDC."** That opens a trip vault, and you sign a leash for it, the same way you sign one in Cota. After that you just go out. Each day there are nearby stops: a Hunt GPS cache, a local guide's meeting point, an artist's mural or show. Each visit that's proved sends a bit of USDC from that stop's sponsor straight into your trip fund, plus some **$TOURS** points. Friends can chip in too, and the money earns interest while it waits. The app keeps you posted: *"Oaxaca 64% funded, 12-day streak."* Once the trip starts, the vault books your guide and your stay. That money sits in escrow until you check in, and if the host cancels, it comes back to you automatically. When the trip is over, you anchor reviews that can't be edited later.

![desktop EN](screenshots/desktop-en.png)

| ES desktop | EN mobile | ES mobile |
|---|---|---|
| ![](screenshots/desktop-es.png) | ![](screenshots/mobile-en.png) | ![](screenshots/mobile-es.png) |

---

## The loop

```
 sponsors (guides, hosts, artists) ──fund stops──▶ TourRewards ──10% fee──▶ treasury
                                                     │  EIP-712 visit proof (Hunt GPS attester)
             proved visit ─────────────────────────▶ ├─ USDC ─────────▶ TripVault (traveler's) ──▶ MockLendingPool (yield)
                                                     └─ $TOURS (mint, daily-capped) ──▶ PerkMarket (burn / to partner)
 friends ──chip in──▶ TripVault                                         ▲
                       │ leash: approved vendors · per-vendor caps · total cap · trip window
                       └─ book() ──▶ Bookings escrow ──release (check-in / attestation)──▶ host (−3% fee ▶ treasury)
                                                     └─refund (host cancel / no-show timeout)──▶ back to vault, cap restored
                                                     └─ anchored review (rating + keccak256(text))
```

## Contracts (`contracts/src`, Foundry, Solidity 0.8.28, via-IR, cancun)

| Contract | What it does |
|---|---|
| `TripVaultFactory` | Opens vaults as EIP-1167 clones. It's also the registry the other contracts use to tell real vaults from fakes. The owner lists the allowed assets and one yield adapter per asset. `bookings`/`rewards` wiring can be written once. |
| `TripVault` | Holds the money for one trip, or one artist tour (`Kind.ArtistTour`). Goal, destination, start and end. Solo or group contributions, with ERC4626-style virtual shares and principal tracked per contributor. Idle money goes to the yield adapter automatically. **Leash:** only the owner or a delegated `agent` (a Cota-style agent) can spend, only during the trip window, only to approved vendors, within each vendor's cap and the total cap. Tightening takes effect right away. Loosening waits `LEASH_DELAY` (1 day), and anyone who contributed before a loosening can exit. Cancelling, or reaching the end with no open bookings, lets each contributor withdraw their pro-rata share plus yield. |
| `IYieldAdapter` + `mocks/MockLendingPool` | The interface a real Neverland (Aave fork) or Morpho adapter would implement. The mock uses an Aave-style liquidity index at a set APR, paid from a seeded reserve. `fastForward()` is a **demo-only** knob because Solonet can't warp time. |
| `TourRewards` | **Proof of visit.** Sponsors fund campaigns: per-visit reward (USDC, or WMON for MON-denominated stops), $TOURS per visit, budget, location id and daily cap. A platform fee is taken on funding. An allowlisted attester signs each visit with **EIP-712** (a stand-in for Hunt's GPS check), and anyone can relay it, so the traveler pays no gas. Rewards go **straight into the traveler's own vault**, or to their wallet if the vault is closed. **No double rewards:** each visit id is single-use, and a user gets one claim per campaign per UTC day. Late claims are accepted for up to 14 days, never for the future. **Streaks:** across all stops, the first visit of each consecutive day earns a bonus of `streakBonus × min(streak−1, 10)` $TOURS. **Artist backing:** backers of an ArtistTour vault unlock $TOURS in proportion to how much of the tour money has actually been spent, so depositing and then cancelling earns nothing. |
| `Bookings` | Guides and hosts list tours and stays. `book()` pays the exact quote into escrow, with `maxAmount` front-run protection. **Release:** the traveler confirms check-in, or an attester's EIP-712 check-in proof is submitted (by the host, say), so a traveler can't hold the payout hostage. **Refund:** the host cancels, the traveler cancels inside the free-cancellation window, or **anyone** claims a refund after `startAt + noShowTimeout`. Fee and timeout are snapshotted at booking time (fee max 5%, demo 3%). The vault callback runs inside try/catch with a gas guard, and `syncBooking()` is a backstop, so resolving an escrow never depends on the vault. **Review anchoring:** after a release, one review per booking (rating plus a hash of the text), only from the payer or the vault owner. |
| `ToursToken` ($TOURS) | ERC20 + Burnable. **Only the rewards contract can mint**, and the minter itself has a leash: `mintCapPerDay`. Transferability is configurable (see below). |
| `PerkMarket` | Approved partners list perks priced in $TOURS: supply, per-user limit, and whether redeemed points are **burned** or **sent to the partner**. Redemptions emit `Redeemed(redemptionId, …)`, and the partner honors the perk off-chain. |

### Ideas carried over from `pq-agent-batch`
- **Caps and leash** (AgentRegistry caps → TripVault per-vendor and total caps, plus the agent delegate). Per-epoch caps (audit L-09) → the daily cap on campaigns and on $TOURS minting.
- **Audit L-02** (`_pullExact` balance-delta check): rejects fee-on-transfer and rebasing tokens in vault deposits, escrow and campaign funding.
- **Audit L-01** (the admin could change the fee under a user): booking fee and no-show timeout are snapshotted per booking.
- **Audit L-04** (two-step admin): `Ownable2Step` everywhere.
- **Audit L-05/L-07** (constructor and zero-address checks); **M-01** (one bad party can't brick everyone): escrow resolution can't be blocked by a reverting or gas-starved vault callback.
- Fee pattern: fees accrue to a treasury address (`feesCollected` counters), and refunds are always 100%.
- `ReentrancyGuardTransient` on every function that moves money.

## How it maps to Hunt and Cota

| Piece | Hunt | Cota |
|---|---|---|
| Proof of visit | Hunt's server-side GPS check becomes the **attester** that signs `Visit(user, campaign, vault, visitedAt, visitId)`. Hunt caches become sponsored campaigns (`StopKind.HuntCache`). Hunt's relayer pays gas. | — |
| Leash | — | Same idea as a Cota leash: the user signs limits up front, and every action is checked against them. Instead of market, leverage and size, a trip leash is **vendors, caps and a date window**. `agent` is where a Cota-style AI agent plugs in. It can book on the traveler's behalf, but only inside the leash. |
| Daily loop | Earn on foot → fund a trip. Streaks give people a reason to open the app every day. | Refusals are the product: the demo transcript lists every attempt the contracts refused (before the trip window, a vendor not on the leash, over cap, forged proof, replay). |
| Agent Record (later) | — | A vault's events (deposits, rewards, bookings, refunds, reviews) are exactly what an Agent Record page would show: where every peso went. |

## $TOURS: points, with a deliberate transferability switch

$TOURS is a **loyalty point**. You earn it by visiting places, keeping streaks and backing artists, and you spend it on partner perks: discounts, better spots, backstage access. There's no sale, no treasury backing and no revenue share, and none of the docs or UI copy describes it as an investment.

| Mode | `transferable` | Behavior | Tradeoff |
|---|---|---|---|
| **Points (default)** | `false` | Wallet-to-wallet transfers revert. Points can only be minted, burned, or moved to or from allowlisted protocol contracts (PerkMarket). | Safer legally: nothing can be traded, so nothing invites speculation, and it works like airline miles. You can't gift points to a friend or use them outside EmpowerTours. |
| **Token** | `true` | A normal ERC20. | Closer to the long-term vision (gifting, composability, other apps honoring it). A tradeable token draws regulatory scrutiny (securities and VASP rules in MX/US) and needs a legal review first. |

Set it at deploy time with `TOURS_TRANSFERABLE=true|false`. The owner can switch points → token **once** (`enableTransfers`), and it can never go back, so holders are never trapped by a later restriction.

## Economics: who pays, where the money goes

| Flow | Who pays | Goes to | Demo setting |
|---|---|---|---|
| Being a daily stop | Guides, hosts and artists fund campaign budgets | 90% to travelers' trip vaults as visit rewards, **10% platform fee to the treasury** | `sponsorFeeBps = 1000` (max 20%) |
| Booking fee | Taken from the host's payout on release (the traveler pays the listed price) | **3% to the treasury**. Refunds are 100%, with no fee. | `feeBps = 300` (max 5%, snapshotted) |
| Yield | The lending market (borrowers) | 100% to vault contributors, pro-rata. *(Option: a small protocol cut, not implemented.)* | Mock 5% APR |
| $TOURS | Minted by the protocol, capped per day | Travelers and backers. Burned on perks, or sent to the partner. | +2/day streak bonus, max +20 |
| Perks | Partners honor them | Partners get visitors and loyalty, and EmpowerTours gets retention | free to list |
| Gas | The Hunt/EmpowerTours relayer pays for visit claims | — | ~0.053 MON per claim at 100 gwei |

EmpowerTours never holds anyone's money. Trip money sits in the user's vault, booking money sits in escrow, and sponsor budgets sit in the rewards contract.

Demo outcome: the treasury earned **71.48 USDC** (65 from the 650 USDC of sponsor budgets, plus 6.48 in booking fees on 216 USDC of released bookings).

## Demo (scripted, on Solonet)

`demo/scenario.mjs` → **`demo/transcript.md`** (and `.json`): 68 transactions with hashes and gas, plus 7 refused attempts.

1. Partners set up: four sponsored stops (a Hunt cache, Marisol's meeting point, Lumbre's mural, Lumbre's Friday show), three listings (a guide tour and two stays) plus one off-leash hostel, and two perks.
2. Ana opens **"Oaxaca, MX · March 2027"**: 500 USDC goal, a leash with 3 vendors and caps of 120/160/160 USDC, a 450 total cap and a trip window. She saves 200 and **Luis chips in 100**. Paying before the window opens → `TripNotStarted`.
3. **12 days of proved visits** (25 claims, relayed so Ana pays no gas) → 19.50 USDC paid into the vault, and a **12-day streak**. A replayed visit is refused (`VisitReused`), and so are a second claim the same day (`AlreadyClaimedToday`) and a forged attestation (`BadAttestation`).
4. 30 simulated days of yield at 5% → **1.31 USDC**. Ana and Luis back Lumbre's tour. Ana redeems the **Backstage pass for 150 $TOURS** (burned). A wallet transfer of $TOURS → `NonTransferable`.
5. The trip window opens. A hostel off the leash → `NotApprovedVendor`; 4 nights over the cap → `VendorCapExceeded`. The vault books **Marisol's tour (90)** and **Casa Azul (114)**. **Casa Azul cancels → automatic refund**, and the leash allowance for that host goes back to 0 spent. The vault rebooks **Casita Jalatlaco (126)**. The tour is released by **Marisol submitting the attester's check-in proof**, and the stay is released when **Ana confirms check-in**. Two **reviews are anchored**. Lumbre pays a venue 30 from the tour vault, and Luis claims **20 $TOURS** of backing rewards.
6. End state: **64.16% funded** (320.81 of 500, of which 216 has already gone to bookings, so 104.81 is still in the vault earning yield). Ana holds 138 $TOURS (288 earned, 150 spent). Total supply is 158.

**Gas on Monad** (Solonet reproduces mainnet repricing, and **Monad charges the gas limit**, so the scripts send `estimate × 1.10`): `claim` 531k–612k · `createVault` 568k–756k · `book` 574k–665k · escrow release 496k–513k · `hostCancel` 424k · `deposit` 382k–477k · `redeem` 238k · `anchorReview` 136k. In total: 24.4M gas, about 2.49 MON at 100 gwei. Much of that comes from new storage slots and cold access under Monad pricing (cold SLOAD 8,100, cold account 10,100).

## Tests

```
cd contracts && forge test                       # 63 unit/fuzz tests + 5 invariants (512 fuzz runs; 128×120 invariant calls)
FOUNDRY_PROFILE=deep forge test                  # 20,000 fuzz runs; 512×300 = 153,600 invariant calls per suite
```
Latest results: all green in both profiles (forge reports "65 tests passed": 63 unit/fuzz tests plus the 5-invariant suite counted once per invariant contract). Logs: `audits/forge-default.txt`, `audits/forge-deep.txt`. Static analysis: `audits/aderyn.md` (Aderyn). Triage: the "reentrancy" highs are state writes after calls to *trusted* contracts (allowlisted tokens, factory-wired Bookings, view calls) inside `nonReentrant` functions. The "unsafe casts" are bounded (`listingId < length`, `net <= uint128.max` checked). Lows fixed: a boolean comparison, an unused error, missing admin events, and SafeERC20 in PerkMarket. Centralization (owner-set fees, attesters, partners) is by design for the prototype.

- **Unit** (`TripVault.t.sol`, `Bookings.t.sol`, `TourRewards.t.sol`, `ToursPerks.t.sol`): every path above, including inflation and donation attacks, fee-on-transfer tokens, leash tighten and loosen timing, exits after a loosening, the vault callback failing (`syncBooking`), gas griefing of the callback, the review rules, the mint cap, and backing rewards unlocking with spend.
- **Fuzz:** deposits and withdrawals never create value; random payments never exceed caps or reach an unapproved vendor; escrow always reaches a terminal state and conserves value; no double rewards for any pair of visit times.
- **Invariants** (`Invariants.t.sol`, a stateful handler covering deposit, withdraw, payVendor (owner and stranger), book, hostCancel, confirm, noShow, claimVisit with a small replayed id space, and warp):
  - `VaultFundsConserved`: assets ≥ deposits − withdrawals − spends + refunds (the difference is yield), and `totalSpent` equals net spends exactly.
  - `SharesBacked`: Σ redeemable ≤ totalAssets.
  - `LeashHolds`: per-vendor and total caps hold, the rogue vendor never gets paid, and nothing is spent outside the trip window.
  - `NoDoubleReward`: each visit id and each (user, day) pays at most once, and the budget drop equals rewards paid.
  - `EscrowAlwaysResolves`: escrow balance equals the Held amounts, and after jumping forward in time every Held booking can be refunded by anyone, leaving the vault with no open bookings.

## Run it

Prerequisites: Solonet running on the box (`sudo docker ps` shows `solonet`; see `/workspace/empowertours-solonet.md`), Foundry, Node 20.

```bash
cd /workspace/tours-loop
npm install
(cd contracts && forge build)
npm run deploy          # forge script → contracts/deployments/solonet.json (refuses any chain but 20143)
npm run demo            # scripted scenario → demo/transcript.md, ui/public/demo-state.json (~4 min)
npm run ui              # http://127.0.0.1:5180  (?lang=es for Spanish; proxies /rpc → localhost:8080)
npm run screenshots     # headless Chromium → screenshots/*.png
```
The deployer key is read from `/workspace/solonet-test/.pk` (override with `PK_FILE`) and passed to forge only through the environment. It never goes on the command line or into the repo, and `.gitignore` blocks `*.pk`/`.env`. The other actors come from the public anvil test mnemonic. `TRIP_START_DELAY` (default 150 s) sets when the demo's trip window opens.

## Open questions

1. **Legal treatment of $TOURS.** Points mode is designed to look like airline miles. Before enabling token mode, or letting $TOURS be bought, get advice from a crypto lawyer in MX (Ley Fintech / CNBV, and whether points count as a "virtual asset") and in the US (securities and money-transmission rules). Also, sponsor-funded rewards paid in USDC may count as income for travelers.
2. **Fiat cash-out for hosts and guides.** Hosts in Oaxaca need pesos. Options are an on/off-ramp partner that pays out USDC→MXN via SPEI, or holding payouts until a cash-out batch. Local short-term-rental rules and tourist taxes vary by city. Who issues the receipt (CFDI)?
3. **Attestation trust.** One attester key (standing in for Hunt's GPS check) is a single point of trust. GPS can be spoofed, and a stolen key mints rewards. The daily caps on campaigns and on $TOURS minting limit the damage. Better options: several attesters with a threshold, per-attester budgets, device attestation (Play Integrity / App Attest), proof-of-presence from the venue (a QR or NFC code that rotates), or a TEE or ZK proof of the GPS check, as in the PQ proof stack.
4. **Sybil and collusion.** A sponsor and a "traveler" could farm their own campaign. That's mostly self-defeating, since the sponsor pays, but it inflates $TOURS. Per-campaign $TOURS caps, identity tiers or a phone check may be needed.
5. **Yield source risk.** A real adapter to Neverland or Morpho brings smart-contract and liquidity risk. A vault can't withdraw if the market is illiquid. Should the vault keep an idle buffer near the trip date?
6. **Group rules.** Today the owner spends for the whole group, and contributors are protected by the leash and the loosening exit. A group-vote mode (M-of-N approval) is the natural next step.
7. **Review privacy.** Only the hash and rating go on-chain. Where the review text lives (IPFS, our DB) and moderation still need deciding.

## Known gaps in this prototype

- **Mocks:** USDC is a faucet token. Yield comes from `MockLendingPool` (with a demo-only `fastForward`), not Neverland or Morpho. "MON" stops would use WMON (a vault holds one ERC20 asset), and no WMON vault is shown in the demo.
- **Time on Solonet:** the chain can't warp time, so the demo's 12 days of visits are **backdated, signed visits synced late** (allowed up to 14 days back), and the trip window opens about 150 s after the vault is created. The vault label says "March 2027", but its on-chain window is the demo's. Forge tests use real `vm.warp` for every timing path.
- **Gas:** visit claims cost about 530k gas on Monad, so a relayer pays roughly 0.053 MON per check-in. Next optimizations: batched claims, crediting rewards to a per-user balance that sweeps into the vault once a day, and packing the claim/day/streak storage.
- **No paid audit.** Only Foundry unit, fuzz and invariant tests plus Aderyn so far. Slither, Halmos and Mythril haven't been run yet. Admin keys are single EOAs on the devnet (on mainnet, use a 2-of-3 Safe).
- **UI** is read-only (no wallet connection). It shows Ana's view of the demo state and reads everything live from Solonet.
