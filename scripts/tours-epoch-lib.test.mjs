// node scripts/tours-epoch-lib.test.mjs : allocation policy + Merkle helpers.
import assert from 'node:assert/strict';
import { parseEther as E } from 'viem';
import { allocate, leafOf, buildTree, proofOf, verify } from './tours-epoch-lib.mjs';

const p = { rateBps: 10000, sourceWeightsBps: { visit: 10000, checkin: 10000, checkinUnverified: 0, backing: 2500 }, backingCapPerWalletPerEpoch: E('50').toString(), minDaysVisited: 2, minClaim: E('1').toString(), perWalletPerEpoch: E('500').toString(), maxPerWallet: E('800').toString(), epochBudget: E('1000').toString() };
const A = '0x00000000000000000000000000000000000000a1', B = '0x00000000000000000000000000000000000000b2', C = '0x00000000000000000000000000000000000000c3', D = '0x00000000000000000000000000000000000000d4', X = '0x00000000000000000000000000000000000000e5';
const z = { visit: 0n, checkin: 0n, checkinUnverified: 0n, backing: 0n };
const earned = new Map([[A, { ...z, visit: E('120'), checkin: E('10'), checkinUnverified: E('400') }], [B, { ...z, backing: E('1000') }], [C, { ...z, visit: E('900') }], [D, { ...z, visit: E('50') }], [X, { ...z, visit: E('100') }]]);
const activity = new Map([[A, { daysVisited: 3 }], [B, { daysVisited: 2 }], [C, { daysVisited: 9 }], [D, { daysVisited: 1 }], [X, { daysVisited: 5 }]]);
const r1 = allocate({ earned, activity, prev: new Map(), excluded: new Map([[X, 'protocol key']]), epoch: 1, p });
const by = Object.fromEntries(r1.rows.map((r) => [r.address.toLowerCase(), r.amount]));
assert.equal(by[A], E('130'));                 // visits + verified scans at 1:1; scans at unverified venues count 0
assert.equal(by[B], E('50'));                  // free-test-USDC backing: 25% weight, capped at 50
assert.equal(by[C], E('500'));                 // per-wallet epoch cap
assert.ok(!(D in by) && r1.dropped.some((d) => d.address === D)); // 1 day of activity: dropped
assert.ok(r1.dropped.some((d) => d.address === X && d.reason === 'protocol key'));
assert.equal(r1.epochIncrease, E('680'));
// epoch 2 over budget: pro-rata; lifetime cap 800 clamps C
const r2 = allocate({ earned, activity, prev: r1.cumulative, excluded: new Map(), epoch: 2, p: { ...p, epochBudget: E('600').toString() } });
assert.ok(r2.scaledBps < 10000n);
assert.ok(r2.epochIncrease <= E('600'));
for (const v of r2.cumulative.values()) assert.ok(v <= E('800'));
// merkle round trip, odd sizes
for (const n of [1, 2, 3, 5, 8, 13]) {
  const leaves = Array.from({ length: n }, (_, i) => leafOf(143, '0x0000000000000000000000000000000000000d15', `0x${(i + 1).toString(16).padStart(40, '0')}`, BigInt(i + 1) * 10n ** 18n));
  const t = buildTree(leaves);
  leaves.forEach((l, i) => assert.ok(verify(proofOf(t, i), t.root, l)));
  if (n > 1) assert.ok(!verify(proofOf(t, 0), t.root, leaves[1]));
}
// leaf is bound to chain + distributor
assert.notEqual(leafOf(143, A, B, 1n), leafOf(10143, A, B, 1n));
assert.notEqual(leafOf(143, A, B, 1n), leafOf(143, C, B, 1n));
console.log('tours-epoch-lib.test: allocation caps/weights/filters/budget + Merkle ✓');
