# One $TOURS for the whole ecosystem

**Status: design + testnet rehearsal. Nothing on Monad mainnet has been deployed, funded or sent.**
Every mainnet step below needs EmpowerTours' explicit approval.

## 1. Which TOURS is the real one (checked read-only on 2026-10-18)

| Address (Monad mainnet, chain 143) | What it is | Verdict |
|---|---|---|
| `0x45b76a127167fD7FC7Ed264ad490144300eCfcBF` | `ToursTokenV2`, "EmpowerTours Token V2" / **TOURS**, 18 decimals, deployed 2026-01-22 (block 50,422,764) | **Current.** It's the token the live art app is configured with (`art.empowertours.xyz/api/config-check` → `toursToken`, and "radio reward manager pays the configured TOURS"). |
| `0xf61F…f74f` | `ToursToken` V1, "EmpowerTours Token" / TOURS, deployed 2026-01-20 | **Sunset.** Treasury burned 2026-08-21. Today `totalSupply` is 593.69 TOURS and `owner()` is `0x0`. Never referenced in Rumbo code or config. |
| `0x8F2D…7777` | "EmpowerTours" / **EMPTOURS**, a nad.fun community token, 1B supply | A different token (different symbol). Not $TOURS. |
| `0x46d0…91d0`, `0xa123…99B7` | Old defaults found in fcempowertours git history | No code on mainnet. `0x46d0…` is an old **testnet** "EmpowerTours Token" (1B, another owner). Legacy, not used. |

**ToursTokenV2 facts:**
- **Supply is fixed.** `totalSupply == MAX_SUPPLY == 100,000,000,000`, all minted in the constructor. `mint()` can't add anything, so rewards have to come out of existing balances.
- **Owner:** EOA `0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1`. `daoTimelock = 0x0`, `paused = false`.
- **Transferable ERC-20.** It has `burn`/`burnFrom`, and the owner can pause (a pause blocks transfers, not burns).
- **Holders:**
  - owner EOA: 99,998,978,800 (99.999%)
  - `ToursRewardManagerV2` `0x0564…af85`: 1,000,000 (idle, has never distributed anything)
  - platform Safe `0xf3b9…25bA`: 20,898.8
  - the rest: about 300
- **No testnet copy exists** at that address on Monad testnet, so the rehearsal uses `ToursTokenStandIn` (same interface and behaviour, named "tTOURS … not real").

## 2. Design: testnet ledger → mainnet claim

```
Rumbo on Monad TESTNET                               Monad MAINNET (not deployed)
───────────────────────                              ──────────────────────────────
attested visits, streaks ─┐                          ToursClaimDistributor
ticket door scans         ├─► TourRewards ─► ledger   ├─ holds real $TOURS, funded before each root
artist-backing unlocks  ──┘   (daily mint leash,      ├─ root per epoch (cumulative entitlements)
                               non-transferable)      ├─ claim(account, cumulative, proof)
        │                                             └─ on-chain caps: epoch, per wallet, lifetime, interval
        └─► scripts/tours-snapshot.mjs ──► epoch JSON (root + proofs) ──► publisher posts root
```

- **Rumbo's testnet contracts are unchanged.** The deployed `ToursToken` stays as the earning ledger:
  - only `TourRewards` can mint, at most 100,000 a day;
  - it is non-transferable, so nobody can buy their way into the ledger;
  - `PerkMarket` keeps working with it.
- **The same address on both chains.** The shared passkey wallet (rpId `empowertours.xyz`) is an ordinary EOA, so whatever a traveller earned on testnet is claimable by that same address on mainnet. No linking step is needed.
- **`ToursClaimDistributor`** (`contracts/src/mainnet/`) is a cumulative Merkle distributor. The token is fixed at deploy.
  - **Leaves are domain-separated:** chain id + distributor, double-hashed.
  - **Hard leashes enforced on-chain**, so they hold even if the publisher key or a snapshot is bad:
    - `maxEpochIncrease`;
    - `minEpochInterval`;
    - `maxPerWalletPerEpoch × epoch`;
    - `maxPerWallet`;
    - a root is refused unless the contract is **already funded** for it.
  - **Owner powers** (should be the 2-of-3 Safe): `setBlocked`, `withdrawSurplus` (can never touch what is owed), pause/unpause.
  - **Publisher powers:** an ops key can post roots and pause.
  - **Relaying:** anyone can relay a claim, and the tokens always go to the account.
- **`scripts/tours-snapshot.mjs`** is read-only. It builds each epoch from testnet events:
  - **Visits:** `VisitRewarded`.
  - **Door scans:** `TicketScanned`, split into scans at verified and unverified venues.
  - **Backing:** `BackingRewarded`.
  - **Mint cross-check:** the total is checked against the ledger's own mints, and it matched exactly in the rehearsal.
  - **Policy** lives in `scripts/tours-epoch.config.json`. The output is a JSON file with the root, a `snapshotHash`, the per-wallet proofs, and a list of dropped wallets with reasons.

## 3. Sybil / farming risk (read this)

Testnet MON is free, and so is Rumbo Test USDC. Paying real $TOURS for testnet activity turns farming into income. These are the attack surfaces and what the design does about each:

| Vector | Mitigation |
|---|---|
| Many wallets doing "visits" | Visits need an EIP-712 signature from an allowlisted attester (the stand-in for Hunt's GPS check). The attester key is the real gate, so keep it server-side with rate limits. On testnet today the attester is the deployer. |
| **Self-made venue scanning its own sybils.** Listing a venue is permissionless, tickets can be bought with free test USDC, and each door scan mints 10 | Scans count only at venues whose owner is on `verifiedVenueOwners`. The proposed default weight for unverified venues is **0**. |
| Back-your-own-tour with free test USDC | Backing points get a 25% weight, capped at 50 TOURS per wallet per epoch. They only unlock as tour money is actually spent. |
| One-day drive-by wallets | `minDaysVisited` = 2 distinct check-in days (from `streakOf`). |
| Whales / leaked keys / bad snapshot | Per-wallet epoch cap (500) and lifetime cap (5,000), both enforced on-chain. The epoch budget is pro-rated, and the epoch ceiling is on-chain. |
| Protocol keys and contracts | Admin, attester, deployer, treasury, partner and any contract address are excluded. |
| Discovered after publishing | Owner `setBlocked`, plus a manual denylist (`--deny`) for the next epoch. Review the `hitCap` and top earners in each snapshot before publishing. |

**Residual risk:** someone who controls a verified partner, or gets the attester to sign, can still farm up to the caps. Caps bound the loss; they don't remove it. Keep epochs small until real activity shows the pattern.

## 4. What was run (all testnet / local fork)

- `forge test`: **141 passed, 0 failed.** That includes 9 distributor tests: epochs, relaying, a wrong amount or account, a proof from another distributor, publish leashes, caps when the root lies, the lifetime cap, blocked/paused/token-paused, surplus, and a 512-run fuzz.
- `forge test --fork-url <mainnet RPC> --match-contract ToursClaimDistributorForkTest`: the same flow against the **real ToursTokenV2** on a **local** fork, with the treasury impersonated only inside the fork. **Passed.**
- `node scripts/tours-epoch-lib.test.mjs`: allocation weights, caps, filters, pro-rata, and the Merkle round trip.
- **`node scripts/tours-distributor-testnet.mjs`** on Monad testnet:
  - **Deployed:** the stand-in `0xa97e2438604fdfcb3c0f8f7f61036a8e2fbd8bfb` and the distributor `0x4941c612116251a7e5f2d5991ea3fd1f14145461`.
  - **Snapshot:** the QA ledger, 39 wallets, 3,214 TOURS. The cross-check against ledger mints was exact.
  - **Claims:** funded exactly, published, then 6 real relayed claims.
  - **Attacks:** 11/11 refused (unfunded publish, non-publisher, over-ceiling, double claim, inflated amount, sybil re-target, over-cap, too-soon epoch, owner raiding owed funds, blocked wallet, token paused).
  - **Result:** `audits/tours-distributor-testnet.json`.
  - With the **proposed** policy (no verified venues yet, at least 2 days), the same ledger gives 37 wallets and 2,464 TOURS. Scans stop counting until venues are verified.
- `forge script script/DeployToursDistributorMainnet.s.sol --fork-url …` (no `--broadcast`): **simulated only.**

## 5. Mainnet steps (each needs your go-ahead)

1. **Decide the numbers** (section 6). They're immutable in the distributor once deployed.
2. **Optional clean-up first.**
   - Pull the idle 1,000,000 out of `ToursRewardManagerV2` with `emergencyWithdraw()`; the owner EOA receives it.
   - Or pause it. Either way this closes the "LiveRadioV3 / VenueRegistry still authorised" gap.
3. Move the TOURS reward budget to the **EmpowerTours 2-of-3 Safe**, so the company holds and accounts for it, not a personal EOA.
4. Deploy `ToursClaimDistributor`:
   - owner = the Safe, publisher = an ops key;
   - `CONFIRM_MAINNET=I_APPROVE forge script … --broadcast`;
   - needs a little MON for gas.
5. **Each epoch** (weekly):
   - run the snapshot against the **production** testnet ledger (`contracts/deployments/monad-testnet.json`) with `--chain-id 143 --distributor <addr>`;
   - review the dropped and top earners;
   - the Safe transfers exactly `epochIncrease`;
   - the publisher posts the root;
   - publish the JSON so people can claim. A claim button in Rumbo/art is a later UI step.
6. **Exit:** pause, block, and `withdrawSurplus` back to the Safe.

## 6. Decisions for EmpowerTours

| Decision | Proposed default |
|---|---|
| Total $TOURS set aside for Rumbo rewards | **1,000,000** to start. Reuse the idle reward-manager balance rather than touching the 99.999B. |
| Who holds and funds it | The **2-of-3 Safe**, funding per epoch, so the distributor never holds more than one epoch ahead. |
| Epoch length / ceiling (`maxEpochIncrease`) | 7 days / **250,000** TOURS |
| Per wallet per epoch / lifetime | **500** / **5,000** TOURS |
| Rate (testnet point → mainnet TOURS) | 1:1 |
| Source weights | visits 100%, verified-venue scans 100%, unverified-venue scans 0%, backing 25% (max 50) |
| Verified venues | Pilot venues you approve, by owner address |
| Perk spending | Points spent on testnet perks still count (gross earned). Switch to net if you'd rather avoid double benefit. |
| Supply | 99.999% of a fixed 100B on one key looks like a rug. Burn or lock most of it **before** rewards go live (see fcempowertours `docs/TOURS_ECONOMICS.md`). |

## 7. Legal / product flags (not legal advice: get Mexican counsel)

- **$TOURS is transferable, unlike Rumbo's points**, so it can be traded:
  - All copy must present it as a **loyalty / utility reward for using Rumbo**. Never as an investment: no price, no "value will grow", no yield, no sale, no buy-back.
  - PerkMarket and the perks are the utility story.
- **Entity: EmpowerTours S.A.S. de C.V.** is the issuer of the rewards. The reward budget should sit in a company-controlled wallet (the Safe) and in its books, not a personal key, because the user is a Mexican tax resident.
- **Mexico specifics to check with counsel:**
  - **Ley Fintech / Banxico** rules on virtual assets;
  - **SAT treatment:** the company's ISR/IVA on giving tokens away, and recipients' income;
  - **LFPIORPI (anti-money-laundering):** whether any virtual-asset activity becomes reportable;
  - **Consumer-protection terms** for a reward programme (eligibility, caps, the right to block farmers, the right to end the programme).
- **Other jurisdictions:** with no geofence, holders anywhere can claim. Consider terms of service that exclude restricted jurisdictions.
- **Licence:** AGPL-3.0-only, or a commercial licence from EmpowerTours S.A.S. de C.V.
