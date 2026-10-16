# Batched check-ins: gas per visit (local Solonet, eth_estimateGas)

Measured 2026-10-16T14:27:37.002Z on chain 20143. Monad bills the gas *limit*; the demo relayer sends estimate × 1.10, priced at the 100 gwei Solonet base fee.

| mode | gas per tx (estimate) | gas per visit | MON per visit (limit × 100 gwei) | vs single |
|---|---:|---:|---:|---:|
| Before: claim() per visit (avg of 6) | 493,261 | 493,261 | 0.0542587 | 0.0% saved |
| After: claimBatch() per day, 2 visits (avg of 3) | 568,037 | 284,018 | 0.031242 | 42.4% saved |
| After: 12-day catch-up claimBatch(), 24 visits | 1,276,194 | 53,175 | 0.0058493 | 89.2% saved |

Single claims: first visit 673,601 gas (cold vault/streak/day slots), later ones avg 457,193.
Round-1 measured single claims in the full demo: 530,594–612,101 gas each (they also paid streak bonuses and first-touch storage).

Raw:

```json
{
  "singles": [
    {
      "est": 673601,
      "limit": 740961,
      "used": 740961
    },
    {
      "est": 467797,
      "limit": 514576,
      "used": 514576
    },
    {
      "est": 451260,
      "limit": 496386,
      "used": 496386
    },
    {
      "est": 447839,
      "limit": 492622,
      "used": 492622
    },
    {
      "est": 454095,
      "limit": 499504,
      "used": 499504
    },
    {
      "est": 464974,
      "limit": 511471,
      "used": 511471
    }
  ],
  "daily": [
    {
      "est": 726738,
      "limit": 799411,
      "used": 799411,
      "visits": 2
    },
    {
      "est": 487275,
      "limit": 536002,
      "used": 536002,
      "visits": 2
    },
    {
      "est": 490097,
      "limit": 539106,
      "used": 539106,
      "visits": 2
    }
  ],
  "catchup": {
    "est": 1276194,
    "limit": 1403813,
    "used": 1403813,
    "visits": 24
  }
}
```
