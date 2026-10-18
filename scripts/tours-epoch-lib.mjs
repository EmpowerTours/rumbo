// Pure helpers for turning Rumbo's testnet $TOURS ledger into a mainnet claim epoch.
// No network, no keys: tested by scripts/tours-epoch-lib.test.mjs and, end to end, by
// scripts/tours-distributor-testnet.mjs (real claims against ToursClaimDistributor on testnet).
import { encodeAbiParameters, keccak256, concat, getAddress } from 'viem';

/** Leaf exactly as ToursClaimDistributor.leaf(): double keccak of (chainid, distributor, account, cumulative). */
export function leafOf(chainId, distributor, account, cumulative) {
  const inner = keccak256(encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    [BigInt(chainId), getAddress(distributor), getAddress(account), BigInt(cumulative)],
  ));
  return keccak256(inner);
}
const hashPair = (a, b) => (BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

/** Sorted-pair Merkle tree, odd node carried up (same as the Solidity test helper; OZ MerkleProof-compatible). */
export function buildTree(leaves) {
  if (leaves.length === 0) throw new Error('empty tree');
  const layers = [leaves];
  while (layers.at(-1).length > 1) {
    const l = layers.at(-1); const n = [];
    for (let i = 0; i < l.length; i += 2) n.push(i + 1 < l.length ? hashPair(l[i], l[i + 1]) : l[i]);
    layers.push(n);
  }
  return { root: layers.at(-1)[0], layers };
}
export function proofOf(tree, index) {
  const p = []; let idx = index;
  for (let d = 0; d < tree.layers.length - 1; d++) {
    const l = tree.layers[d]; const sib = idx ^ 1;
    if (sib < l.length) p.push(l[sib]);
    idx = Math.floor(idx / 2);
  }
  return p;
}
export function verify(proof, root, leaf) {
  let h = leaf; for (const s of proof) h = hashPair(h, s); return h === root;
}

/**
 * One epoch's allocation. All amounts are bigint wei.
 * @param earned   Map(address -> { visit, checkin, checkinUnverified, backing })  ledger points earned THIS epoch, by source
 *                 (checkinUnverified = ticket scans at shows whose venue owner is not on the verified list)
 * @param activity Map(address -> { daysVisited })               on-chain streak stats at the snapshot block
 * @param prev     Map(address -> cumulative)                     previous epoch's cumulative entitlements
 * @param p        policy (see tours-epoch.config.json)
 */
export function allocate({ earned, activity, prev, excluded, epoch, p }) {
  const W = p.sourceWeightsBps; const rate = BigInt(p.rateBps);
  const rows = []; const dropped = [];
  for (const [addr, src] of earned) {
    const a = addr.toLowerCase();
    if (excluded.has(a)) { dropped.push({ address: addr, reason: excluded.get(a) }); continue; }
    const days = activity.get(a)?.daysVisited ?? 0;
    if (days < p.minDaysVisited) { dropped.push({ address: addr, reason: `only ${days} distinct check-in day(s), need ${p.minDaysVisited}` }); continue; }
    let backing = (src.backing * BigInt(W.backing)) / 10_000n;
    if (backing > BigInt(p.backingCapPerWalletPerEpoch)) backing = BigInt(p.backingCapPerWalletPerEpoch);
    const weighted = (src.visit * BigInt(W.visit) + src.checkin * BigInt(W.checkin) + (src.checkinUnverified ?? 0n) * BigInt(W.checkinUnverified ?? 0)) / 10_000n + backing;
    let amount = (weighted * rate) / 10_000n;
    const capped = amount > BigInt(p.perWalletPerEpoch);
    if (capped) amount = BigInt(p.perWalletPerEpoch);
    if (amount < BigInt(p.minClaim)) { dropped.push({ address: addr, reason: 'below minimum claim' }); continue; }
    rows.push({ address: getAddress(addr), amount, capped, source: src, daysVisited: days });
  }
  // epoch budget: scale pro-rata if over
  let sum = rows.reduce((s, r) => s + r.amount, 0n);
  const budget = BigInt(p.epochBudget);
  let scaledBps = 10_000n;
  if (sum > budget) {
    scaledBps = (budget * 10_000n) / sum;
    for (const r of rows) r.amount = (r.amount * scaledBps) / 10_000n;
    sum = rows.reduce((s, r) => s + r.amount, 0n);
  }
  // cumulative, clamped exactly like the contract: min(perWalletPerEpoch * epoch, maxPerWallet)
  const cum = new Map([...prev].map(([k, v]) => [k.toLowerCase(), BigInt(v)]));
  let walletCap = BigInt(p.perWalletPerEpoch) * BigInt(epoch);
  if (walletCap > BigInt(p.maxPerWallet)) walletCap = BigInt(p.maxPerWallet);
  for (const r of rows) {
    const k = r.address.toLowerCase(); const before = cum.get(k) ?? 0n;
    let after = before + r.amount; if (after > walletCap) after = walletCap < before ? before : walletCap;
    r.amount = after - before; cum.set(k, after);
  }
  return { rows, dropped, cumulative: cum, epochIncrease: rows.reduce((s, r) => s + r.amount, 0n), scaledBps };
}
