// Rumbo load + abuse test on Monad TESTNET (10143), QA stack only. Defensive: every target is our own contract.
// Many real txs across N throwaway wallets (check-ins, ticket buys, scans, resales, refunds), then every refusal
// the contracts promise is checked twice: simulated for the decoded revert reason, and a sample is SENT for real
// with a fixed gas limit to prove it also reverts on-chain.
//   node scripts/testnet-load.mjs            (N=40 wallets; LOAD_WALLETS=20..64)
// Writes audits/testnet-load.json. Budget guard: aborts if the deployer would spend more than MAX_MON (default 300).
import { writeFileSync } from 'node:fs';
import { keccak256, toHex, parseUnits, formatUnits, maxUint256, BaseError, ContractFunctionRevertedError } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { pub, rpcStats, wallet, loadWallet, deployer, abi, deployments, assertSolonet, CHAIN_ID, ROOT } from './testnet-lib.mjs';

await assertSolonet();
pub.pollingInterval = 300;
const N = Number(process.env.LOAD_WALLETS || 40);
const MAX_MON = Number(process.env.MAX_MON || 300);
const PER_WALLET_MON = process.env.PER_WALLET_MON || '1.2';
const D = deployments();
const U = (x) => parseUnits(String(x), 6);
const RUN = Date.now();
const C = Object.fromEntries(Object.entries({ usdc: 'RumboTestUSDC', tours: 'ToursToken', factory: 'TripVaultFactory', rewards: 'TourRewards',
  venues: 'Venues', tickets: 'Tickets', perks: 'PerkMarket' }).map(([k, n]) => [k, { address: D[k], abi: abi(n) }]));
const VAULT_ABI = abi('TripVault');
const ERR = [...Object.values(C).flatMap((c) => c.abi), ...VAULT_ABI].filter((x) => x.type === 'error');
const admin = deployer();
const W = (acct) => { const w = wallet(acct); w.pollingInterval = 300; return w; };
const adminW = W(admin);
const L = [...Array(N).keys()].map((i) => loadWallet(i));
const LW = L.map(W);
const [sponsor, venue, scanner, artist] = [L[N - 1], L[N - 2], L[N - 3], L[N - 4]];
const fans = L.slice(0, N - 4);

const stats = { txs: [], waves: [] };
const results = [];
const bal0 = await pub.getBalance({ address: admin.address });
const log = (...a) => console.log(...a);

function decodeErr(e) {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r?.data?.errorName) return `${r.data.errorName}(${(r.data.args || []).map(String).join(', ')})`;
    if (r?.reason) return r.reason;
    return e.shortMessage;
  }
  return String(e.message || e);
}
const ctr = (t) => (typeof t === 'string' ? C[t] : t);
async function send(acct, target, fn, args, label, { gas, expectRevert } = {}) {
  const c = ctr(target);
  const p = { account: acct, address: c.address, abi: [...c.abi, ...ERR], functionName: fn, args };
  let result;
  if (!gas) {
    const sim = await pub.simulateContract(p);
    result = sim.result;
    gas = ((await pub.estimateContractGas(p)) * 115n) / 100n;
  }
  const t0 = Date.now();
  const hash = await W(acct).writeContract({ ...p, gas, chain: undefined });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const rec = { label, fn, hash, status: rc.status, gasUsed: Number(rc.gasUsed), gasLimit: Number(gas), fee: Number(rc.gasUsed * rc.effectiveGasPrice) / 1e18, ms: Date.now() - t0 };
  stats.txs.push(rec);
  if (!expectRevert && rc.status !== 'success') throw new Error(`${label} reverted ${hash}`);
  return { rc, result, hash };
}
async function pool(items, conc, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all([...Array(Math.min(conc, items.length))].map(async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
async function wave(name, items, conc, fn) {
  const t0 = Date.now(); const n0 = stats.txs.length;
  const out = await pool(items, conc, fn);
  const n = stats.txs.length - n0; const s = (Date.now() - t0) / 1000;
  const g = stats.txs.slice(n0).reduce((a, t) => a + t.gasUsed, 0);
  stats.waves.push({ name, txs: n, seconds: +s.toFixed(1), tps: +(n / s).toFixed(2), gas: g, gasPerSec: Math.round(g / s) });
  log(`wave ${name}: ${n} txs in ${s.toFixed(1)}s (${(n / s).toFixed(2)} tx/s), gas ${g}`);
  await budgetCheck();
  return out;
}
async function budgetCheck() {
  const spent = Number(bal0 - (await pub.getBalance({ address: admin.address }))) / 1e18;
  if (spent > MAX_MON) throw new Error(`budget guard: deployer spent ${spent} MON > ${MAX_MON}`);
  return spent;
}
// a should-revert case: simulate (decoded reason must match), optionally also send for real with a fixed gas limit
async function refuse(cat, label, acct, target, fn, args, expect, { real = false, gas = 400_000n } = {}) {
  const c = ctr(target);
  let reason = null, sim = 'SUCCEEDED';
  try { await pub.simulateContract({ account: acct, address: c.address, abi: [...c.abi, ...ERR], functionName: fn, args }); }
  catch (e) { reason = decodeErr(e); sim = 'reverted'; }
  let onchain = null, hash = null;
  if (real) {
    try { const r = await send(acct, target, fn, args, `ABUSE ${label}`, { gas, expectRevert: true }); onchain = r.rc.status; hash = r.hash; }
    catch (e) { onchain = `send error: ${decodeErr(e).slice(0, 80)}`; }
  }
  const pass = sim === 'reverted' && reason.startsWith(expect) && (!real || onchain === 'reverted');
  results.push({ cat, label, expect, reason, onchain, hash, pass });
  if (!pass) log(`!! UNEXPECTED: ${label}: sim ${sim} ${reason} onchain ${onchain}`);
  return pass;
}

// ---------------------------------------------------------------- 0. fund wallets (deployer, explicit nonces)
log(`QA stack ${D.rewards} · ${N} wallets · admin ${admin.address}`);
{
  const want = parseUnits(PER_WALLET_MON, 18);
  const need = [];
  for (const a of L) { const b = await pub.getBalance({ address: a.address }); if (b < want) need.push([a, want - b]); }
  let nonce = await pub.getTransactionCount({ address: admin.address, blockTag: 'pending' });
  const t0 = Date.now();
  const hashes = [];
  for (const [a, v] of need) hashes.push(await adminW.sendTransaction({ to: a.address, value: v, gas: 21000n, nonce: nonce++ }));
  const rcs = await Promise.all(hashes.map((hash) => pub.waitForTransactionReceipt({ hash, timeout: 120_000 })));
  rcs.forEach((rc, i) => stats.txs.push({ label: 'fund', fn: 'transfer', hash: hashes[i], status: rc.status, gasUsed: 21000, gasLimit: 21000, fee: Number(rc.gasUsed * rc.effectiveGasPrice) / 1e18, ms: 0 }));
  const s = (Date.now() - t0) / 1000;
  stats.waves.push({ name: 'fund wallets (1 sender, pipelined nonces)', txs: hashes.length, seconds: +s.toFixed(1), tps: +(hashes.length / s).toFixed(2), gas: 21000 * hashes.length });
  log(`funded ${need.length} wallets in ${s.toFixed(1)}s`);
}

// ---------------------------------------------------------------- 1. setup: faucet, approvals, campaigns, venue, artist fund
await wave('faucet rtUSDC', L, 25, (a) => send(a, 'usdc', 'faucet', [a === sponsor ? U(20000) : U(500)], 'faucet'));
await wave('approve tickets+rewards', L, 25, async (a) => {
  await send(a, 'usdc', 'approve', [D.tickets, maxUint256], 'approve tickets');
  if (a === sponsor) await send(a, 'usdc', 'approve', [D.rewards, maxUint256], 'approve rewards');
});
const camp = {};
for (const [k, reward, tours, cap, budget] of [['A', '0.10', 2, 500, 400], ['B', '0.10', 2, 500, 400], ['C', '0.10', 2, 500, 400], ['D', '0.10', 2, 500, 400],
  ['CAP5', '0.10', 1, 5, 50], ['BUDGET3', '1', 1, 500, '3.34']]) {
  const { result } = await send(sponsor, 'rewards', 'createCampaign', [D.usdc, U(reward), parseUnits(String(tours), 18), cap, 0, keccak256(toHex(`load:${k}:${RUN}`)), `[QA load] stop ${k}`, U(budget)], `campaign ${k}`);
  camp[k] = result;
}
log('campaigns', camp);
const t0 = Number((await pub.getBlock()).timestamp);
const today = Math.floor(t0 / 86400);
const { result: venueId } = await send(venue, 'venues', 'listVenue', [D.usdc, 1000, 3000, U(50), U(20), '[QA load] Foro Carga', 'Oaxaca', 'QA'], 'listVenue');
await send(venue, 'venues', 'setOpenDates', [venueId, [today, today + 1, today + 2, today + 3], true], 'open dates');
await send(venue, 'venues', 'setScanner', [venueId, scanner.address, true], 'set scanner');
const START = BigInt(t0 + 45);
const cfg = { owner: '0x0000000000000000000000000000000000000000', agent: '0x0000000000000000000000000000000000000000', asset: D.usdc,
  adapter: '0x0000000000000000000000000000000000000000', kind: 1, open: true, startTime: START, endTime: BigInt(t0 + 20 * 86400),
  goal: U(300), totalCap: U(120), destination: '[QA load] tour fund', vendors: [venue.address], vendorCaps: [U(100)] };
const { result: fundAddr } = await send(artist, 'factory', 'createVault', [cfg], 'artist createVault');
const FUND = { address: fundAddr, abi: VAULT_ABI };
await send(artist, 'usdc', 'approve', [fundAddr, U(300)], 'approve fund');
await send(artist, FUND, 'deposit', [U(300), artist.address], 'fund deposit');
log('artist fund', fundAddr, 'venue', venueId);

// ---------------------------------------------------------------- 2. check-in load: every fan, 5 past days × 4 stops, batched
const rd = { name: 'EmpowerTours Rewards', version: '1', chainId: CHAIN_ID, verifyingContract: D.rewards };
const batchTypes = { VisitBatch: [{ name: 'user', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'campaignIds', type: 'uint256[]' },
  { name: 'visitedAts', type: 'uint64[]' }, { name: 'batchId', type: 'bytes32' }] };
const visitTypes = { Visit: [{ name: 'user', type: 'address' }, { name: 'campaignId', type: 'uint256' }, { name: 'vault', type: 'address' },
  { name: 'visitedAt', type: 'uint64' }, { name: 'visitId', type: 'bytes32' }] };
const ZERO = '0x0000000000000000000000000000000000000000';
const mkBatch = (user, day, ids, tag) => ({ user, vault: ZERO, campaignIds: ids.map(BigInt), visitedAts: ids.map((_, k) => BigInt(day * 86400 + 3600 + k * 600)), batchId: keccak256(toHex(`${tag}:${user}:${day}:${RUN}`)) });
const signB = (b, who = admin) => who.signTypedData({ domain: rd, types: batchTypes, primaryType: 'VisitBatch', message: b });
const DAYS = [5, 4, 3, 2, 1].map((d) => today - d);
const four = [camp.A, camp.B, camp.C, camp.D];
const lastBatch = new Map();
for (const day of DAYS) {
  await wave(`check-ins day -${today - day} (${fans.length} batches × 4 visits)`, fans, 36, async (a) => {
    const b = mkBatch(a.address, day, four, 'load'); const sig = await signB(b);
    await send(a, 'rewards', 'claimBatch', [b, sig], 'claimBatch');
    lastBatch.set(a.address, { b, sig });
  });
}
const visitsDone = fans.length * DAYS.length * 4;
// daily cap & budget exhaustion (real txs: first ones succeed, then refusals)
for (let i = 0; i < 5; i++) { const b = mkBatch(fans[i].address, today - 1, [camp.CAP5], 'cap'); await send(fans[i], 'rewards', 'claimBatch', [b, await signB(b)], 'cap5 ok'); }
{ const b = mkBatch(fans[5].address, today - 1, [camp.CAP5], 'cap'); await refuse('dailyCap', '6th visit to a dailyCap=5 stop the same day', fans[5], 'rewards', 'claimBatch', [b, await signB(b)], 'DailyCapReached', { real: true }); }
for (let i = 0; i < 3; i++) { const b = mkBatch(fans[i].address, today - 2, [camp.BUDGET3], 'bud'); await send(fans[i], 'rewards', 'claimBatch', [b, await signB(b)], 'budget ok'); }
{ const b = mkBatch(fans[3].address, today - 2, [camp.BUDGET3], 'bud'); await refuse('budget', '4th visit once a 3-visit budget is spent', fans[3], 'rewards', 'claimBatch', [b, await signB(b)], 'BudgetExhausted', { real: true }); }

// abuse: replayed batch ids (every fan), same-day re-claim with a fresh id, forged signer, stale, future, tampered payload
const rogue = privateKeyToAccount(generatePrivateKey());
await pool(fans, 12, async (a, i) => {
  const { b, sig } = lastBatch.get(a.address);
  await refuse('replay', `replay batch of fan ${i}`, a, 'rewards', 'claimBatch', [b, sig], 'VisitReused', { real: i < 3 });
  const b2 = { ...b, batchId: keccak256(toHex(`fresh:${a.address}:${RUN}`)) };
  await refuse('sameDay', `same visits, fresh batch id, fan ${i}`, a, 'rewards', 'claimBatch', [b2, await signB(b2)], 'AlreadyClaimedToday', { real: i < 2 });
  const b3 = mkBatch(a.address, today, four, 'forged');
  await refuse('forged', `batch signed by a non-attester, fan ${i}`, a, 'rewards', 'claimBatch', [b3, await signB(b3, rogue)], 'BadAttestation', { real: i < 2 });
  const b4 = { ...mkBatch(a.address, today, four, 'tamper') }; const s4 = await signB(b4);
  await refuse('tampered', `attested batch with a stop swapped after signing, fan ${i}`, a, 'rewards', 'claimBatch', [{ ...b4, campaignIds: [camp.A, camp.A, camp.C, camp.D] }, s4], 'BadAttestation', { real: i < 1 });
  const b5 = { ...b4, user: fans[(i + 1) % fans.length].address };
  await refuse('stolen', `fan ${i} submits a batch attested for someone else (user swapped)`, a, 'rewards', 'claimBatch', [b5, s4], 'BadAttestation');
});
{
  const a = fans[0];
  const bS = mkBatch(a.address, today - 15, [camp.A], 'stale'); await refuse('stale', 'visit 15 days old (window 14d)', a, 'rewards', 'claimBatch', [bS, await signB(bS)], 'StaleVisit', { real: true });
  const bF = mkBatch(a.address, today + 2, [camp.A], 'future'); await refuse('future', 'visit in the future', a, 'rewards', 'claimBatch', [bF, await signB(bF)], 'FutureVisit', { real: true });
  const v = { user: a.address, campaignId: camp.A, vault: ZERO, visitedAt: BigInt(today * 86400 - 600), visitId: lastBatch.get(a.address).b.batchId };
  await refuse('replay', 'single claim reusing a consumed batch id as visit id', a, 'rewards', 'claim', [v, await admin.signTypedData({ domain: rd, types: visitTypes, primaryType: 'Visit', message: v })], 'VisitReused');
  await refuse('points', '$TOURS transfer in points mode', a, 'tours', 'transfer', [fans[1].address, 1n], 'NonTransferable', { real: true });
}

// ---------------------------------------------------------------- 3. artist fund books shows (leash)
log('waiting for the tour window');
while (Number((await pub.getBlock()).timestamp) <= Number(START)) await new Promise((r) => setTimeout(r, 2000));
const tB = Number((await pub.getBlock()).timestamp);
const showTimeA = BigInt(tB + 420);
const dayStart = (d) => (today + d) * 86400;
const { result: showA } = await send(artist, FUND, 'bookVenue', [venueId, showTimeA, U(5), 400, '[QA load] show A'], 'book show A');
await refuse('venue', 'double-book the same venue day', artist, FUND, 'bookVenue', [venueId, showTimeA + 60n, U(5), 400, 'x'], 'AlreadyBooked');
const { result: showB } = await send(artist, FUND, 'bookVenue', [venueId, BigInt(dayStart(1) + 72000), U(5), 400, '[QA load] show B (venue will cancel)'], 'book show B');
await refuse('leash', 'third booking over the venue leash cap (100 USDC, 2×50 used)', artist, FUND, 'bookVenue', [venueId, BigInt(dayStart(2) + 72000), U(5), 400, 'x'], 'VendorCapExceeded', { real: true, gas: 800_000n });
await refuse('leash', 'tour fund pays the venue directly above the leash', artist, FUND, 'payVendor', [venue.address, U(60), toHex('over', { size: 32 })], 'VendorCapExceeded', { real: true });
await refuse('leash', 'tour fund pays a vendor not on the leash', artist, FUND, 'payVendor', [fans[0].address, U(1), toHex('nope', { size: 32 })], 'NotApprovedVendor', { real: true });
await refuse('leash', 'stranger tries to spend the tour fund', fans[0], FUND, 'payVendor', [venue.address, U(1), toHex('thief', { size: 32 })], 'NotSpender', { real: true });

// ---------------------------------------------------------------- 4. ticket load
await wave(`ticket buys show A (${fans.length} × qty 2)`, fans, 36, (a) => send(a, 'tickets', 'buy', [showA, 2, U(10)], 'buy A x2'));
await wave(`ticket buys show A (${fans.length} × qty 1)`, fans, 36, (a) => send(a, 'tickets', 'buy', [showA, 1, U(5)], 'buy A x1'));
await wave(`ticket buys show B (${fans.length} × qty 1)`, fans, 36, (a) => send(a, 'tickets', 'buy', [showB, 1, U(5)], 'buy B'));
const held = new Map();
await pool(fans, 12, async (a) => {
  const ids = await pub.readContract({ ...C.tickets, functionName: 'ticketsOf', args: [a.address] });
  const mine = [];
  for (const id of ids) { const t = await pub.readContract({ ...C.tickets, functionName: 'getTicket', args: [id] }); if (t.holder === a.address) mine.push({ id, show: t.showId }); }
  held.set(a.address, mine);
});
const aTickets = (a) => held.get(a.address).filter((t) => t.show === showA).map((t) => t.id);
const bTickets = (a) => held.get(a.address).filter((t) => t.show === showB).map((t) => t.id);
await refuse('price', 'buy with maxTotal below price', fans[0], 'tickets', 'buy', [showA, 2, U(9)], 'PriceAboveMax');
await refuse('qty', 'buy qty 0', fans[0], 'tickets', 'buy', [showA, 0, U(5)], 'BadQty');
// resale: 10 sellers at exactly 110%, 10 buyers; every seller also tries 110% + 1 unit
const sellers = fans.slice(0, 10), buyers = fans.slice(10, 20);
await pool(sellers, 10, async (a, i) => {
  const id = aTickets(a)[2];
  await refuse('resaleCap', `list at 110% + 0.000001 (seller ${i})`, a, 'tickets', 'listForResale', [id, U('5.500001')], 'PriceAboveCap', { real: i < 2 });
});
await wave('resale list @110%', sellers, 10, (a) => send(a, 'tickets', 'listForResale', [aTickets(a)[2], U('5.5')], 'list 110%'));
const artBal0 = await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [artist.address] });
await wave('resale buys', buyers, 10, (a, i) => send(a, 'tickets', 'buyResale', [aTickets(sellers[i])[2], U('5.5')], 'buyResale'));
const royalty = (await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [artist.address] })) - artBal0;
await refuse('resale', 'buy an unlisted ticket', buyers[0], 'tickets', 'buyResale', [aTickets(sellers[0])[1], U('5.5')], 'NotListed');
await refuse('resale', 'list someone else\'s ticket', fans[30 % fans.length], 'tickets', 'listForResale', [aTickets(fans[0])[0], U('5')], 'NotHolder');

// ---------------------------------------------------------------- 5. doors open: scan load, then the door locks
const td = { name: 'EmpowerTours Tickets', version: '1', chainId: CHAIN_ID, verifyingContract: D.tickets };
const scanTypes = { TicketScan: [{ name: 'ticketId', type: 'uint256' }, { name: 'holder', type: 'address' }, { name: 'at', type: 'uint64' }] };
const atScan = BigInt(Number((await pub.getBlock()).timestamp) - 5);
const holderNow = async (id) => (await pub.readContract({ ...C.tickets, functionName: 'getTicket', args: [id] })).holder;
const scanned = [];
// each fan scans their first A ticket (fans submit the venue-signed proof; scan is permissionless, the signature is the gate)
await wave(`door scans show A (${fans.length})`, fans, 36, async (a) => {
  const id = aTickets(a)[0];
  const sig = await scanner.signTypedData({ domain: td, types: scanTypes, primaryType: 'TicketScan', message: { ticketId: id, holder: a.address, at: atScan } });
  await send(a, 'tickets', 'scan', [id, atScan, sig], 'scan');
  scanned.push({ a, id, sig });
});
await pool(scanned, 12, async ({ a, id, sig }, i) => {
  await refuse('doubleScan', `re-submit scan of ticket ${id}`, a, 'tickets', 'scan', [id, atScan, sig], 'AlreadyUsed', { real: i < 3 });
});
const outsider = privateKeyToAccount(generatePrivateKey());
await pool(fans.slice(0, 12), 12, async (a, i) => {
  const spare = aTickets(a)[1];
  await refuse('doorLock', `transfer spare ticket to a non-holder after doors open (fan ${i})`, a, 'tickets', 'transferTicket', [spare, outsider.address], 'TransferLocked', { real: i < 2 });
  const fake = await rogue.signTypedData({ domain: td, types: scanTypes, primaryType: 'TicketScan', message: { ticketId: spare, holder: a.address, at: atScan } });
  await refuse('forgedScan', `scan with a non-scanner signature (fan ${i})`, a, 'tickets', 'scan', [spare, atScan, fake], 'BadAttestation', { real: i < 2 });
});
{ // venue-signed scan but for a different holder than the ticket's
  const a = fans[0], spare = aTickets(a)[1];
  const sig = await scanner.signTypedData({ domain: td, types: scanTypes, primaryType: 'TicketScan', message: { ticketId: spare, holder: fans[1].address, at: atScan } });
  await refuse('forgedScan', 'scanner proof bound to another holder', a, 'tickets', 'scan', [spare, atScan, sig], 'BadAttestation');
  await send(fans[2], 'tickets', 'listForResale', [aTickets(fans[2])[1], U('5.5')], 'list spare after doors open');
  await refuse('doorLock', 'non-holder buys a resale listing after doors open', outsider, 'tickets', 'buyResale', [aTickets(fans[2])[1], U('5.5')], 'TransferLocked');
}
// doors open → transfer to an existing holder is allowed (one real tx)
await send(fans[0], 'tickets', 'transferTicket', [aTickets(fans[0])[1], fans[1].address], 'transfer to holder after doors (allowed)');

// ---------------------------------------------------------------- 6. show played, settle; show B venue-cancel refunds; show C artist-cancel
const vd = { name: 'EmpowerTours Venues', version: '1', chainId: CHAIN_ID, verifyingContract: D.venues };
const showTypes = { ShowAttestation: [{ name: 'showId', type: 'uint256' }, { name: 'outcome', type: 'uint8' }, { name: 'at', type: 'uint64' }] };
const atShow = BigInt(Number((await pub.getBlock()).timestamp) - 2);
await refuse('forgedShow', 'show attestation from the global attester (not the venue scanner)', venue, 'venues', 'confirmShow',
  [showA, atShow, await admin.signTypedData({ domain: vd, types: showTypes, primaryType: 'ShowAttestation', message: { showId: showA, outcome: 1, at: atShow } })], 'BadAttestation', { real: true });
const venueBal0 = await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [venue.address] });
await send(venue, 'venues', 'confirmShow', [showA, atShow, await scanner.signTypedData({ domain: vd, types: showTypes, primaryType: 'ShowAttestation', message: { showId: showA, outcome: 1, at: atShow } })], 'confirmShow A');
await refuse('afterPlay', 'buy tickets after the show is played', fans[0], 'tickets', 'buy', [showA, 1, U(5)], 'NotOnSale');
await send(fans[5], 'tickets', 'settle', [showA], 'settle A (a fan triggers it)');
await refuse('doubleSettle', 'settle show A twice', fans[6], 'tickets', 'settle', [showA], 'AlreadySettled', { real: true });
const salesA = await pub.readContract({ ...C.tickets, functionName: 'sales', args: [showA] });
await refuse('refund', 'refund a ticket of a played show', fans[0], 'tickets', 'refund', [aTickets(fans[1])[1]], 'NotCancelled');

await refuse('venue', 'stranger cancels the venue booking', fans[0], 'venues', 'venueCancel', [showB], 'NotVenueOwner', { real: true });
const fundBal0 = await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [fundAddr] });
await send(venue, 'venues', 'venueCancel', [showB], 'venue cancels show B');
const fundRefund = (await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [fundAddr] })) - fundBal0;
const fanBal0 = await Promise.all(fans.map((a) => pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [a.address] })));
await wave('refundAll show B (batches of 10)', [...Array(Math.ceil(fans.length / 10)).keys()], 1, () => send(venue, 'tickets', 'refundAll', [showB, 10n], 'refundAll'));
const fanBal1 = await Promise.all(fans.map((a) => pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [a.address] })));
const refundedOk = fans.filter((_, i) => fanBal1[i] - fanBal0[i] === U(5)).length;
await refuse('refund', 'double refund of a show-B ticket', fans[0], 'tickets', 'refund', [bTickets(fans[0])[0]], 'Refunded', { real: true });
await refuse('refund', 'buy a ticket for the cancelled show', fans[0], 'tickets', 'buy', [showB, 1, U(5)], 'NotOnSale', { real: true });
// leash allowance restored by the cancel → book show C, sell 5 tickets, artist cancels before showtime
const { result: showC } = await send(artist, FUND, 'bookVenue', [venueId, BigInt(dayStart(2) + 72000), U(5), 400, '[QA load] show C (artist will cancel)'], 'book show C (leash restored)');
await pool(fans.slice(0, 5), 5, (a) => send(a, 'tickets', 'buy', [showC, 1, U(5)], 'buy C'));
const fundC0 = await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [fundAddr] });
const venC0 = await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [venue.address] });
await send(artist, FUND, 'cancelShow', [showC], 'artist cancels show C via the fund').catch(async (e) => {
  log('fund cancelShow unavailable, trying vault fn names:', decodeErr(e)); throw e;
});
const fundCback = (await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [fundAddr] })) - fundC0;
const venCfee = (await pub.readContract({ ...C.usdc, functionName: 'balanceOf', args: [venue.address] })) - venC0;
await send(fans[7], 'tickets', 'refundAll', [showC, 50n], 'refundAll C');

// ---------------------------------------------------------------- report
const spent = await budgetCheck();
const ok = stats.txs.filter((t) => t.status === 'success');
const intendedReverts = stats.txs.filter((t) => t.label.startsWith('ABUSE'));
const byFn = {};
for (const t of ok) { (byFn[t.fn] ||= { n: 0, gas: 0 }); byFn[t.fn].n++; byFn[t.fn].gas += t.gasUsed; }
for (const k of Object.keys(byFn)) byFn[k].avgGas = Math.round(byFn[k].gas / byFn[k].n);
const cats = {};
for (const r of results) { (cats[r.cat] ||= { pass: 0, fail: 0, realReverted: 0 }); cats[r.cat][r.pass ? 'pass' : 'fail']++; if (r.onchain === 'reverted') cats[r.cat].realReverted++; }
const summary = {
  wallets: N, fans: fans.length, rpc: { ...rpcStats, rps: Number(process.env.RPC_RPS || 20) }, run: RUN, deployerSpentMON: +spent.toFixed(4),
  txs: { total: stats.txs.length, success: ok.length, intendedReverts: intendedReverts.length, unexpectedReverts: stats.txs.filter((t) => t.status !== 'success' && !t.label.startsWith('ABUSE')).length },
  gas: { total: stats.txs.reduce((a, t) => a + t.gasUsed, 0), feeMON: +stats.txs.reduce((a, t) => a + t.fee, 0).toFixed(4), byFn },
  checkIns: { batchedVisits: visitsDone, batches: fans.length * DAYS.length },
  tickets: { showA_sold: Number(salesA.sold ?? salesA[1]), resales: buyers.length, artistRoyaltyFromResales: formatUnits(royalty, 6), scans: scanned.length },
  settleA: { gross: formatUnits(salesA.gross ?? salesA[0], 6), toArtist: formatUnits(salesA.toArtist ?? salesA[5], 6), toVenue: formatUnits(salesA.toVenue ?? salesA[6], 6), fee: formatUnits(salesA.fee ?? salesA[7], 6) },
  cancelB: { depositBackToFund: formatUnits(fundRefund, 6), fansRefundedExactly5: refundedOk, of: fans.length },
  cancelC: { backToFund: formatUnits(fundCback, 6), venueKept: formatUnits(venCfee, 6) },
  waves: stats.waves,
  refusals: { total: results.length, pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, sentForReal: results.filter((r) => r.onchain).length, realReverted: results.filter((r) => r.onchain === 'reverted').length, byCategory: cats },
};
log(JSON.stringify(summary, null, 2));
writeFileSync(`${ROOT}audits/testnet-load.json`, JSON.stringify({ chainId: CHAIN_ID, deployments: D, fund: fundAddr, venueId, shows: { showA, showB, showC }, campaigns: camp, summary, results, txs: stats.txs },
  (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
log('wrote audits/testnet-load.json');
