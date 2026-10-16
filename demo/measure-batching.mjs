// Gas per visit: single claim() vs one claimBatch() per day vs a 12-day catch-up batch.
// LOCAL Solonet only. Uses eth_estimateGas (Monad charges the gas LIMIT, so the estimate is
// what the traveler's own wallet pays for, up to the 10% headroom we add).
import { writeFileSync, readFileSync } from 'node:fs';
import { keccak256, toHex, parseUnits, formatUnits } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { pub, wallet, deployer, abi, deployments, assertSolonet, CHAIN_ID, ROOT } from './lib.mjs';

await assertSolonet();
const D = deployments();
const state = JSON.parse(readFileSync(`${ROOT}ui/public/demo-state.json`, 'utf8'));
const [cA, cB] = state.campaigns.slice(0, 2).map((c) => BigInt(c.id ?? c));
const R = { address: D.rewards, abi: abi('TourRewards') };
const F = { address: D.factory, abi: abi('TripVaultFactory') };
const relayer = deployer();
const Wr = wallet(relayer);
const attester = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 7 });
const rd = { name: 'EmpowerTours Rewards', version: '1', chainId: CHAIN_ID, verifyingContract: D.rewards };
const visitTypes = { Visit: [{ name: 'user', type: 'address' }, { name: 'campaignId', type: 'uint256' }, { name: 'vault', type: 'address' }, { name: 'visitedAt', type: 'uint64' }, { name: 'visitId', type: 'bytes32' }] };
const batchTypes = { VisitBatch: [{ name: 'user', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'campaignIds', type: 'uint256[]' }, { name: 'visitedAts', type: 'uint64[]' }, { name: 'batchId', type: 'bytes32' }] };
const GWEI = 100n; // Solonet base fee
const nowTs = Number((await pub.getBlock()).timestamp);
const today = Math.floor(nowTs / 86400);
const tag = `m${nowTs}`;

async function tx(fn, args, label) {
  const p = { account: relayer, address: R.address, abi: R.abi, functionName: fn, args };
  const est = await pub.estimateContractGas(p);
  const gas = (est * 110n) / 100n;
  const hash = await Wr.writeContract({ ...p, gas });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(label + ' reverted');
  return { est: Number(est), limit: Number(gas), used: Number(rc.gasUsed) };
}

async function setupUser(idx) {
  const acct = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: idx });
  if ((await pub.getBalance({ address: acct.address })) < parseUnits('5', 18)) {
    const h = await Wr.sendTransaction({ to: acct.address, value: parseUnits('20', 18) });
    const rc = await pub.waitForTransactionReceipt({ hash: h });
    // Monad consensus checks balances against delayed state: wait a few blocks before spending.
    while ((await pub.getBlockNumber()) < rc.blockNumber + 4n) await new Promise((r) => setTimeout(r, 300));
  }
  const zero = '0x0000000000000000000000000000000000000000';
  const cfg = { owner: zero, agent: zero, asset: D.usdc, adapter: zero, kind: 0, open: true, startTime: BigInt(nowTs + 3600), endTime: BigInt(nowTs + 30 * 86400),
    goal: parseUnits('100', 6), totalCap: parseUnits('100', 6), destination: `gas probe ${idx}`, vendors: [], vendorCaps: [] };
  const w = wallet(acct);
  const p = { account: acct, address: F.address, abi: F.abi, functionName: 'createVault', args: [cfg] };
  const { result } = await pub.simulateContract(p);
  const est = await pub.estimateContractGas(p);
  const h = await w.writeContract({ ...p, gas: (est * 110n) / 100n });
  await pub.waitForTransactionReceipt({ hash: h });
  return { user: acct.address, vault: result };
}

// fresh probe accounts each run (nonce 0) so earlier runs' streak/day state doesn't leak in
const fresh = [];
for (let i = 20; fresh.length < 3; i++) {
  const a = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: i });
  if ((await pub.getTransactionCount({ address: a.address })) === 0) fresh.push(i);
}
const days = (n) => [...Array(n).keys()].map((i) => today - n + i);
const out = { singles: [], daily: [], catchup: null };

// A) before: one claim() per visit, 2 stops a day for 3 days
{
  const u = await setupUser(fresh[0]);
  for (const d of days(3)) for (const [k, c] of [cA, cB].entries()) {
    const v = { user: u.user, campaignId: c, vault: u.vault, visitedAt: BigInt(d * 86400 + 3600 + k * 600), visitId: keccak256(toHex(`${tag}-s-${d}-${k}`)) };
    const sig = await attester.signTypedData({ domain: rd, types: visitTypes, primaryType: 'Visit', message: v });
    out.singles.push(await tx('claim', [v, sig], 'single'));
  }
}
// B) after: one claimBatch() per day (2 visits), 3 days
{
  const u = await setupUser(fresh[1]);
  for (const d of days(3)) {
    const b = { user: u.user, vault: u.vault, campaignIds: [cA, cB], visitedAts: [BigInt(d * 86400 + 3600), BigInt(d * 86400 + 4200)], batchId: keccak256(toHex(`${tag}-d-${d}`)) };
    const sig = await attester.signTypedData({ domain: rd, types: batchTypes, primaryType: 'VisitBatch', message: b });
    out.daily.push({ ...(await tx('claimBatch', [b, sig], 'daily')), visits: 2 });
  }
}
// C) after: a 12-day catch-up batch (24 visits) in ONE tx
{
  const u = await setupUser(fresh[2]);
  const ids = [], ats = [];
  for (const d of days(12)) { ids.push(cA, cB); ats.push(BigInt(d * 86400 + 3600), BigInt(d * 86400 + 4200)); }
  const b = { user: u.user, vault: u.vault, campaignIds: ids, visitedAts: ats, batchId: keccak256(toHex(`${tag}-c`)) };
  const sig = await attester.signTypedData({ domain: rd, types: batchTypes, primaryType: 'VisitBatch', message: b });
  out.catchup = { ...(await tx('claimBatch', [b, sig], 'catchup')), visits: 24 };
}

const avg = (a) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
const mon = (g) => formatUnits(BigInt(Math.round(g * 1.1)) * GWEI * 10n ** 9n, 18);
const firstSingle = out.singles[0].est, steadySingle = avg(out.singles.slice(1).map((x) => x.est));
const singlePerVisit = avg(out.singles.map((x) => x.est));
const dailyPerVisit = avg(out.daily.map((x) => x.est / 2));
const catchPerVisit = Math.round(out.catchup.est / 24);
const rows = [
  ['Before: claim() per visit (avg of 6)', singlePerVisit, singlePerVisit],
  ['After: claimBatch() per day, 2 visits (avg of 3)', avg(out.daily.map((x) => x.est)), dailyPerVisit],
  ['After: 12-day catch-up claimBatch(), 24 visits', out.catchup.est, catchPerVisit],
];
let md = `# Batched check-ins: gas per visit (local Solonet, eth_estimateGas)\n\nMeasured ${new Date().toISOString()} on chain ${CHAIN_ID}. Monad bills the gas *limit*; the sender (the traveler's own wallet) sends estimate × 1.10, priced at the 100 gwei Solonet base fee.\n\n`;
md += `| mode | gas per tx (estimate) | gas per visit | MON per visit (limit × 100 gwei) | vs single |\n|---|---:|---:|---:|---:|\n`;
for (const [l, tx_, pv] of rows) md += `| ${l} | ${tx_.toLocaleString('en')} | ${pv.toLocaleString('en')} | ${mon(pv)} | ${((1 - pv / singlePerVisit) * 100).toFixed(1)}% saved |\n`;
md += `\nSingle claims: first visit ${firstSingle.toLocaleString('en')} gas (cold vault/streak/day slots), later ones avg ${steadySingle.toLocaleString('en')}.\n`;
md += `Round-1 measured single claims in the full demo: 530,594–612,101 gas each (they also paid streak bonuses and first-touch storage).\n\n`;
md += `Raw:\n\n\`\`\`json\n${JSON.stringify(out, null, 2)}\n\`\`\`\n`;
writeFileSync(`${ROOT}demo/gas-batching.md`, md);
writeFileSync(`${ROOT}demo/gas-batching.json`, JSON.stringify({ singlePerVisit, dailyPerVisit, catchPerVisit, firstSingle, steadySingle, ...out }, null, 2));
console.log(md.split('Raw:')[0]);
