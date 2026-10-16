// End-to-end LOCAL Solonet scenario for the "trip that saves itself while you play" loop.
// Writes demo/transcript.md + demo/transcript.json (tx hashes, gas) and ui/public/demo-state.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { keccak256, toHex, formatUnits, parseUnits, BaseError, ContractFunctionRevertedError } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { pub, wallet, actor, deployer, abi, deployments, assertSolonet, ACTORS, CHAIN_ID, ROOT } from './lib.mjs';

await assertSolonet();
pub.pollingInterval = 250;
const D = deployments();
const U = (x) => parseUnits(String(x), 6);
const T = (x) => parseUnits(String(x), 18);
const fmtU = (x) => formatUnits(x, 6);
const fmtT = (x) => formatUnits(x, 18);

const C = {
  usdc: { address: D.usdc, abi: abi('MockToken') },
  pool: { address: D.pool, abi: abi('MockLendingPool') },
  tours: { address: D.tours, abi: abi('ToursToken') },
  factory: { address: D.factory, abi: abi('TripVaultFactory') },
  bookings: { address: D.bookings, abi: abi('Bookings') },
  rewards: { address: D.rewards, abi: abi('TourRewards') },
  perks: { address: D.perks, abi: abi('PerkMarket') },
};
const VAULT_ABI = abi('TripVault');
const ERR_ABI = [...C.usdc.abi, ...C.tours.abi, ...C.factory.abi, ...C.bookings.abi, ...C.rewards.abi, ...C.perks.abi, ...VAULT_ABI]
  .filter((x) => x.type === 'error');

const A = Object.fromEntries(Object.keys(ACTORS).map((k) => [k, actor(k)]));
A.relayer = deployer();
A.venue = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 10 });
const NAMES = { ...Object.fromEntries(Object.entries(ACTORS).map(([k, v]) => [k, v.name])), relayer: 'EmpowerTours/Hunt relayer (deployer)', venue: 'Foro venue' };
const W = Object.fromEntries(Object.entries(A).map(([k, a]) => [k, wallet(a)]));
for (const w of Object.values(W)) w.pollingInterval = 250;

const txs = [];
const fromBlock = Number(await pub.getBlockNumber());
const refusals = [];
let step = 0;
let section = '';
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

async function send(label, who, target, fn, args = []) {
  const contract = typeof target === 'string' ? C[target] : target;
  const cname = typeof target === 'string' ? target : target.name;
  const account = A[who];
  const params = { account, address: contract.address, abi: [...contract.abi, ...ERR_ABI], functionName: fn, args };
  const { request, result } = await pub.simulateContract(params);
  const est = await pub.estimateContractGas(params);
  const gas = (est * 110n) / 100n; // Monad charges the gas LIMIT: keep it tight
  const hash = await W[who].writeContract({ ...request, gas });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  const rec = {
    step: ++step, section, label, from: NAMES[who], call: `${cname}.${fn}`, hash, block: Number(rc.blockNumber),
    gasUsed: Number(rc.gasUsed), gasLimit: Number(gas), costMON: formatUnits(rc.gasUsed * rc.effectiveGasPrice, 18),
  };
  txs.push(rec);
  log(`#${rec.step} ${label}  gas ${rec.gasUsed}  ${hash}`);
  return { rc, result };
}

async function refuse(label, who, target, fn, args, expect) {
  const contract = typeof target === 'string' ? C[target] : target;
  try {
    await pub.simulateContract({ account: A[who], address: contract.address, abi: [...contract.abi, ...ERR_ABI], functionName: fn, args });
  } catch (e) {
    const reason = decodeErr(e);
    if (expect && !reason.startsWith(expect)) throw new Error(`${label}: expected ${expect}, got ${reason}`);
    refusals.push({ section, label, by: NAMES[who], reason });
    log(`   refused as expected: ${label} -> ${reason}`);
    return reason;
  }
  throw new Error(`${label}: expected a revert but the call would succeed`);
}

const read = (target, fn, args = []) => {
  const c = typeof target === 'string' ? C[target] : target;
  return pub.readContract({ address: c.address, abi: c.abi, functionName: fn, args });
};
const now = async () => Number((await pub.getBlock()).timestamp);
async function waitUntil(ts) {
  while ((await now()) < ts) await new Promise((r) => setTimeout(r, 1000));
}

// ------------------------------------------------------------------ 0. setup
section = '0. Partners set up (sponsored stops, listings, perks)';
for (const k of ['traveler', 'friend', 'guide', 'hostB', 'artist']) {
  await send(`faucet 1,000 mock USDC to ${NAMES[k]}`, k, 'usdc', 'faucet', [A[k].address, U(1000)]);
}
const stops = [
  { who: 'hostB', reward: U('0.75'), tours: T(5), kind: 0, loc: 'hunt:jardin-etnobotanico', name: 'Hunt cache · Jardín Etnobotánico', budget: U(300) },
  { who: 'guide', reward: U('1.00'), tours: T(8), kind: 1, loc: 'guide:santo-domingo', name: "Marisol's meeting point · Santo Domingo", budget: U(200) },
  { who: 'artist', reward: U('0.50'), tours: T(6), kind: 2, loc: 'mural:alcala-14', name: 'Lumbre mural · Calle Macedonio Alcalá', budget: U(100) },
  { who: 'artist', reward: U('0.50'), tours: T(10), kind: 3, loc: 'show:foro-lumbre', name: 'Lumbre live · Foro (Friday show)', budget: U(50) },
];
const campaignIds = [];
for (const s of stops) {
  await send(`${NAMES[s.who]} approves campaign budget`, s.who, 'usdc', 'approve', [D.rewards, s.budget]);
  const { result } = await send(`${NAMES[s.who]} sponsors stop "${s.name}" (${fmtU(s.budget)} USDC, 10% platform fee)`, s.who, 'rewards', 'createCampaign',
    [D.usdc, s.reward, s.tours, 500, s.kind, keccak256(toHex(s.loc)), s.name, s.budget]);
  campaignIds.push(Number(result));
}
const listingDefs = [
  { who: 'guide', kind: 0, price: U(45), max: 8, cw: 86400, title: 'Mezcal & Monte Albán day tour', place: 'Oaxaca centro' },
  { who: 'hostA', kind: 1, price: U(38), max: 7, cw: 86400, title: 'Casa Azul · garden room', place: 'Xochimilco, Oaxaca' },
  { who: 'hostB', kind: 1, price: U(42), max: 7, cw: 86400, title: 'Casita Jalatlaco · whole casita', place: 'Jalatlaco, Oaxaca' },
  { who: 'friend', kind: 1, price: U(25), max: 7, cw: 0, title: 'Random hostel (not on the leash)', place: 'Oaxaca' },
];
const listingIds = [];
for (const l of listingDefs) {
  const { result } = await send(`${NAMES[l.who]} lists "${l.title}" at ${fmtU(l.price)} USDC`, l.who, 'bookings', 'createListing',
    [l.kind, D.usdc, l.price, l.max, BigInt(l.cw), l.title, l.place]);
  listingIds.push(Number(result));
}
await send('EmpowerTours approves Marisol as a perk partner', 'relayer', 'perks', 'setPartner', [A.guide.address, true]);
const perkDefs = [
  { who: 'artist', price: T(150), supply: 20, max: 1, burn: true, title: 'Backstage pass · Lumbre live in Oaxaca', partner: 'Lumbre' },
  { who: 'guide', price: T(60), supply: 50, max: 2, burn: false, title: '10% off the Mezcal & Monte Albán tour', partner: 'Marisol Tours' },
];
const perkIds = [];
for (const p of perkDefs) {
  const { result } = await send(`${p.partner} lists perk "${p.title}" for ${fmtT(p.price)} $TOURS`, p.who, 'perks', 'listPerk',
    [p.price, p.supply, p.max, p.burn, p.title, p.partner]);
  perkIds.push(Number(result));
}

// ------------------------------------------------------------------ 1. trip
section = '1. Ana opens an Oaxaca trip vault with a leash; Luis chips in';
const t0 = await now();
const START = BigInt(t0 + Number(process.env.TRIP_START_DELAY || 150));
const END = BigInt(t0 + 30 * 86400);
const cfg = {
  owner: '0x0000000000000000000000000000000000000000', agent: '0x0000000000000000000000000000000000000000',
  asset: D.usdc, adapter: '0x0000000000000000000000000000000000000000', kind: 0, open: true,
  startTime: START, endTime: END, goal: U(500), totalCap: U(450), destination: 'Oaxaca, MX · March 2027',
  vendors: [A.guide.address, A.hostA.address, A.hostB.address], vendorCaps: [U(120), U(160), U(160)],
};
const { result: vaultAddr } = await send('Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450', 'traveler', 'factory', 'createVault', [cfg]);
const V = { address: vaultAddr, abi: VAULT_ABI, name: 'TripVault' };
log('   vault', vaultAddr);
await send('Ana approves 200 USDC', 'traveler', 'usdc', 'approve', [vaultAddr, U(200)]);
await send('Ana saves 200 USDC (auto-supplied to the lending pool)', 'traveler', V, 'deposit', [U(200), A.traveler.address]);
await send('Luis approves 100 USDC', 'friend', 'usdc', 'approve', [vaultAddr, U(100)]);
await send('Luis chips in 100 USDC to Ana\'s trip', 'friend', V, 'deposit', [U(100), A.friend.address]);
await refuse('Ana tries to pay Marisol before the trip window opens', 'traveler', V, 'payVendor', [A.guide.address, U(10), toHex('early', { size: 32 })], 'TripNotStarted');

// ------------------------------------------------------------------ 2. 12 days of check-ins
section = '2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip';
const today = Math.floor(t0 / 86400);
const rd = { name: 'EmpowerTours Rewards', version: '1', chainId: CHAIN_ID, verifyingContract: D.rewards };
const visitTypes = { Visit: [
  { name: 'user', type: 'address' }, { name: 'campaignId', type: 'uint256' }, { name: 'vault', type: 'address' },
  { name: 'visitedAt', type: 'uint64' }, { name: 'visitId', type: 'bytes32' }] };
async function signVisit(v) {
  return A.attester.signTypedData({ domain: rd, types: visitTypes, primaryType: 'Visit', message: v });
}
let lastVisit;
const visitLog = [];
for (let d = 0; d < 12; d++) {
  const day = today - 11 + d;
  const plan = [campaignIds[0], d % 3 === 2 ? campaignIds[2] : campaignIds[1]];
  if (d === 9) plan.push(campaignIds[3]); // Friday show
  for (let k = 0; k < plan.length; k++) {
    const visitedAt = BigInt(day * 86400 + 1800 + k * 900); // 00:30 UTC + 15 min per stop
    const v = { user: A.traveler.address, campaignId: BigInt(plan[k]), vault: vaultAddr, visitedAt, visitId: keccak256(toHex(`ana-${day}-${plan[k]}`)) };
    const sig = await signVisit(v);
    const { rc } = await send(`day ${d + 1}: visit "${stops[plan[k]].name}" relayed (Ana pays no gas)`, 'relayer', 'rewards', 'claim', [v, sig]);
    lastVisit = { v, sig };
    visitLog.push({ day: d + 1, stop: stops[plan[k]].name, block: Number(rc.blockNumber) });
  }
}
await refuse('replay the same signed visit', 'relayer', 'rewards', 'claim', [lastVisit.v, lastVisit.sig], 'VisitReused');
{
  const v = { ...lastVisit.v, visitId: keccak256(toHex('ana-dup')), visitedAt: lastVisit.v.visitedAt + 60n };
  await refuse('second claim at the same stop on the same day (new visit id)', 'relayer', 'rewards', 'claim', [v, await signVisit(v)], 'AlreadyClaimedToday');
}
{
  const v = { ...lastVisit.v, visitId: keccak256(toHex('forged')), user: A.friend.address, vault: vaultAddr };
  const forged = await A.friend.signTypedData({ domain: rd, types: visitTypes, primaryType: 'Visit', message: v });
  await refuse('Luis forges his own attestation', 'friend', 'rewards', 'claim', [v, forged], 'BadAttestation');
}

// ------------------------------------------------------------------ 3. yield, artist backing, perk
section = '3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS';
await send('DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time)', 'relayer', 'pool', 'fastForward', [30n * 86400n]);
const artistCfg = { ...cfg, kind: 1, goal: U(1500), totalCap: U(1500), destination: 'Lumbre · Oaxaca → CDMX tour',
  vendors: [A.venue.address], vendorCaps: [U(800)], startTime: START };
const { result: artistVault } = await send('Lumbre opens a fan-backed tour vault (venue on the leash)', 'artist', 'factory', 'createVault', [artistCfg]);
const AV = { address: artistVault, abi: VAULT_ABI, name: 'TripVault(artist)' };
await send('Luis approves 40 USDC', 'friend', 'usdc', 'approve', [artistVault, U(40)]);
await send('Luis backs Lumbre\'s tour with 40 USDC (perks, not a revenue share)', 'friend', AV, 'deposit', [U(40), A.friend.address]);
await send('Ana approves 20 USDC', 'traveler', 'usdc', 'approve', [artistVault, U(20)]);
await send('Ana backs Lumbre\'s tour with 20 USDC', 'traveler', AV, 'deposit', [U(20), A.traveler.address]);
const toursBefore = await read('tours', 'balanceOf', [A.traveler.address]);
await send('Ana approves PerkMarket for 150 $TOURS', 'traveler', 'tours', 'approve', [D.perks, perkDefs[0].price]);
await send('Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned)', 'traveler', 'perks', 'redeem', [BigInt(perkIds[0])]);
await refuse('Ana tries to send $TOURS to Luis (points mode)', 'traveler', 'tours', 'transfer', [A.friend.address, T(1)], 'NonTransferable');

// ------------------------------------------------------------------ 4. the trip
section = '4. Trip window opens: the vault books a guide and a stay through escrow';
log('   waiting for trip window to open at', Number(START));
await waitUntil(Number(START) + 1);
const startAt = BigInt(await now());
await refuse('book a hostel whose owner is not on the leash', 'traveler', V, 'book', [BigInt(listingIds[3]), 2, startAt], 'NotApprovedVendor');
await refuse('book 4 nights at Casita Jalatlaco (168 > 160 USDC cap)', 'traveler', V, 'book', [BigInt(listingIds[2]), 4, startAt], 'VendorCapExceeded');
const { result: tourId } = await send('vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow)', 'traveler', V, 'book', [BigInt(listingIds[0]), 2, startAt]);
const { result: stayA } = await send('vault books 3 nights at Casa Azul (114 USDC into escrow)', 'traveler', V, 'book', [BigInt(listingIds[1]), 3, startAt]);
await send('Casa Azul cancels → automatic full refund to the vault, leash allowance restored', 'hostA', 'bookings', 'hostCancel', [stayA]);
const { result: stayB } = await send('vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow)', 'traveler', V, 'book', [BigInt(listingIds[2]), 3, startAt]);
const atCheck = BigInt(await now());
const cd = { name: 'EmpowerTours Bookings', version: '1', chainId: CHAIN_ID, verifyingContract: D.bookings };
const ciSig = await A.attester.signTypedData({ domain: cd, primaryType: 'CheckIn', message: { bookingId: tourId, payer: vaultAddr, at: atCheck },
  types: { CheckIn: [{ name: 'bookingId', type: 'uint256' }, { name: 'payer', type: 'address' }, { name: 'at', type: 'uint64' }] } });
await send('Marisol submits the Hunt GPS check-in proof → tour escrow released (3% fee to treasury)', 'guide', 'bookings', 'confirmWithAttestation', [tourId, atCheck, ciSig]);
await send('Ana confirms check-in at Casita Jalatlaco → stay escrow released', 'traveler', V, 'confirmCheckIn', [stayB]);
const reviews = {
  [String(tourId)]: 'Marisol knew every palenque on the road to Monte Albán. Best day of the trip. 5/5',
  [String(stayB)]: 'Casita Jalatlaco was spotless, quiet and a short walk to the murals. 5/5',
};
await send('Ana anchors her tour review (rating 5 + keccak256 of the text)', 'traveler', 'bookings', 'anchorReview', [tourId, 5, keccak256(toHex(reviews[String(tourId)]))]);
await send('Ana anchors her stay review', 'traveler', 'bookings', 'anchorReview', [stayB, 5, keccak256(toHex(reviews[String(stayB)]))]);
await send('Lumbre pays the venue deposit from the tour vault (30 USDC, leashed)', 'artist', AV, 'payVendor', [A.venue.address, U(30), toHex('venue deposit', { size: 32 })]);
await send('Luis claims backing $TOURS (unlocked by the share of tour money actually spent)', 'friend', 'rewards', 'claimBacking', [artistVault]);

// ------------------------------------------------------------------ 5. final state
section = '5. Final state';
const st = {
  progressBps: Number(await read(V, 'progressBps')), totalAssets: await read(V, 'totalAssets'), totalSpent: await read(V, 'totalSpent'),
  yieldEarned: await read(V, 'yieldEarned'), totalPrincipal: await read(V, 'totalPrincipal'),
  anaShare: await read(V, 'balanceOfContributor', [A.traveler.address]), luisShare: await read(V, 'balanceOfContributor', [A.friend.address]),
  streak: await read('rewards', 'streakOf', [A.traveler.address]),
  anaTours: await read('tours', 'balanceOf', [A.traveler.address]), luisTours: await read('tours', 'balanceOf', [A.friend.address]),
  toursSupply: await read('tours', 'totalSupply'), burned: await read('perks', 'totalBurned'),
  treasuryUsdc: await read('usdc', 'balanceOf', [A.treasury.address]), bookingFees: await read('bookings', 'feesCollected'),
  sponsorFees: await read('rewards', 'feesCollected', [D.usdc]),
  guideUsdc: await read('usdc', 'balanceOf', [A.guide.address]), hostBUsdc: await read('usdc', 'balanceOf', [A.hostB.address]),
  vendorSpentHostA: await read(V, 'vendorSpent', [A.hostA.address]),
};
const summary = {
  vault: vaultAddr, artistVault,
  progress: `${(st.progressBps / 100).toFixed(2)}% funded (${fmtU(st.totalAssets + st.totalSpent)} / 500 USDC incl. ${fmtU(st.totalSpent)} already spent on bookings)`,
  vaultBalanceNow: fmtU(st.totalAssets), principal: fmtU(st.totalPrincipal), yieldEarned: fmtU(st.yieldEarned),
  streak: { current: Number(st.streak[1]), best: Number(st.streak[2]), daysVisited: Number(st.streak[3]) },
  visits: visitLog.length,
  anaTours: fmtT(st.anaTours), anaToursBeforePerk: fmtT(toursBefore), luisTours: fmtT(st.luisTours), toursSupply: fmtT(st.toursSupply), toursBurned: fmtT(st.burned),
  treasuryRevenueUSDC: { total: fmtU(st.treasuryUsdc), sponsorFees: fmtU(st.sponsorFees), bookingFees: fmtU(st.bookingFees) },
  hostACapAfterRefund: fmtU(st.vendorSpentHostA), guideReceived: fmtU(st.guideUsdc - U(1000) + U(200)), hostBReceivedFromStay: fmtU((126_000000n * 9700n) / 10000n),
};
log(JSON.stringify(summary, null, 2));

const totalGas = txs.reduce((a, t) => a + t.gasUsed, 0);
const totalMon = txs.reduce((a, t) => a + Number(t.costMON), 0);
const out = { network: { rpc: 'http://localhost:8080', chainId: CHAIN_ID, note: 'LOCAL Monad Solonet; mock USDC; nothing public' }, deployments: D, summary, refusals, txs, totalGas, totalMon };
writeFileSync(`${ROOT}demo/transcript.json`, JSON.stringify(out, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

let md = `# Demo transcript: Oaxaca trip that saves itself while you play\n\n`;
md += `Generated ${new Date().toISOString()} on LOCAL Monad Solonet (chain ${CHAIN_ID}, http://localhost:8080). Mock USDC, test accounts. Nothing public.\n\n`;
md += `Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.\n\n`;
md += `## Outcome\n\n`;
md += `- Trip vault \`${vaultAddr}\`: **${summary.progress}**\n- Vault balance now ${summary.vaultBalanceNow} USDC; principal ${summary.principal}; yield earned ${summary.yieldEarned} USDC (mock pool, 30 simulated days)\n`;
md += `- Streak: **${summary.streak.current} days** (best ${summary.streak.best}); ${summary.visits} proved visits\n`;
md += `- $TOURS: Ana ${summary.anaToursBeforePerk} earned → ${summary.anaTours} after a 150 perk (burned); Luis ${summary.luisTours} from backing; supply ${summary.toursSupply}\n`;
md += `- Treasury revenue: ${summary.treasuryRevenueUSDC.total} USDC (sponsor fees ${summary.treasuryRevenueUSDC.sponsorFees} + booking fees ${summary.treasuryRevenueUSDC.bookingFees})\n`;
md += `- Casa Azul cancellation: refunded automatically; Ana's leash allowance for that host back to ${summary.hostACapAfterRefund} USDC spent\n`;
md += `- ${txs.length} transactions, ${totalGas.toLocaleString()} gas, ${totalMon.toFixed(4)} MON at Solonet's 100 gwei base fee\n\n`;
md += `## Refused by the contracts (simulated, never sent)\n\n| Section | Attempt | By | Revert |\n|---|---|---|---|\n`;
for (const r of refusals) md += `| ${r.section.split('.')[0]} | ${r.label} | ${r.by} | \`${r.reason}\` |\n`;
let cur = '';
for (const t of txs) {
  if (t.section !== cur) { cur = t.section; md += `\n## ${cur}\n\n| # | Action | From | Call | Gas | Tx hash |\n|---|---|---|---|---|---|\n`; }
  md += `| ${t.step} | ${t.label} | ${t.from} | \`${t.call}\` | ${t.gasUsed.toLocaleString()} | \`${t.hash}\` |\n`;
}
writeFileSync(`${ROOT}demo/transcript.md`, md);

mkdirSync(`${ROOT}ui/public`, { recursive: true });
writeFileSync(`${ROOT}ui/public/demo-state.json`, JSON.stringify({
  fromBlock, vault: vaultAddr, artistVault, actors: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { address: a.address, name: NAMES[k] }])),
  campaigns: campaignIds.map((id, i) => ({ id, ...stops[i], reward: String(stops[i].reward), tours: String(stops[i].tours), budget: String(stops[i].budget) })),
  listings: listingIds, perks: perkIds, bookings: { tour: String(tourId), stayCancelled: String(stayA), stay: String(stayB) }, reviews,
}, null, 2));
log(`done: ${txs.length} txs, transcript at demo/transcript.md`);
