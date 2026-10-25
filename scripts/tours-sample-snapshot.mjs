// SAMPLE epoch for the local fork simulation only (no network): 8 synthetic wallets run through the real
// allocate() caps, then the same leaf/tree/proof code as tours-snapshot.mjs. Never publish this root on mainnet.
//   node scripts/tours-sample-snapshot.mjs --distributor 0x… --chain-id 143 --out /tmp/x.json
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256, stringToHex, getAddress, parseEther } from 'viem';
import { allocate, leafOf, buildTree, proofOf, verify } from './tours-epoch-lib.mjs';
const a = Object.fromEntries(process.argv.slice(2).reduce((r, x, i, all) => (x.startsWith('--') ? [...r, [x.slice(2), all[i + 1]]] : r), []));
const c = JSON.parse(readFileSync(new URL('./tours-epoch.config.json', import.meta.url), 'utf8'));
const W = (n) => parseEther(String(n));
const p = { ...c, backingCapPerWalletPerEpoch: W(c.backingCapPerWalletPerEpoch), minClaim: W(c.minClaim), perWalletPerEpoch: W(c.perWalletPerEpoch), maxPerWallet: W(c.maxPerWallet), epochBudget: W(c.epochBudget) };
const pts = [120, 499, 500, 750, 2000, 40, 300, 0.5]; // 750/2000 must be capped to 500; 0.5 below minClaim
const earned = new Map(), activity = new Map();
pts.forEach((v, i) => { const ad = getAddress('0x' + (0xa11ce00 + i).toString(16).padStart(40, '0')); earned.set(ad, { visit: W(v), checkin: 0n, checkinUnverified: 0n, backing: 0n }); activity.set(ad.toLowerCase(), { daysVisited: 3 }); });
const res = allocate({ earned, activity, prev: new Map(), excluded: new Set(), epoch: 1, p });
const entries = [...res.cumulative].filter(([, v]) => v > 0n).map(([ad, v]) => ({ address: getAddress(ad), cumulative: v })).sort((x, y) => (x.address.toLowerCase() < y.address.toLowerCase() ? -1 : 1));
const leaves = entries.map((e) => leafOf(a['chain-id'], a.distributor, e.address, e.cumulative));
const tree = buildTree(leaves);
entries.forEach((e, i) => { e.proof = proofOf(tree, i); if (!verify(e.proof, tree.root, leaves[i])) throw new Error('proof'); });
const total = entries.reduce((s, e) => s + e.cumulative, 0n);
const out = { kind: 'rumbo-tours-epoch-SAMPLE', epoch: 1, root: tree.root, cumulativeTotal: total.toString(), epochIncrease: total.toString(),
  snapshotHash: keccak256(stringToHex(JSON.stringify(entries.map((e) => [e.address, e.cumulative.toString()])))),
  claims: entries.map((e) => ({ address: e.address, cumulative: e.cumulative.toString(), proof: e.proof })) };
writeFileSync(a.out, JSON.stringify(out, null, 1));
console.log(`SAMPLE epoch: ${entries.length} wallets, total ${total} wei, root ${tree.root}`);
