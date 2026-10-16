// End-to-end LOCAL Solonet scenario for the "trip that saves itself while you play" loop.
// Writes demo/transcript.md + demo/transcript.json (tx hashes, gas) and ui/public/demo-state.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { keccak256, toHex, formatUnits, parseUnits, BaseError, ContractFunctionRevertedError } from 'viem';
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
  venues: { address: D.venues, abi: abi('Venues') },
  tickets: { address: D.tickets, abi: abi('Tickets') },
};
const VAULT_ABI = abi('TripVault');
const ERR_ABI = [...C.usdc.abi, ...C.tours.abi, ...C.factory.abi, ...C.bookings.abi, ...C.rewards.abi, ...C.perks.abi, ...C.venues.abi, ...C.tickets.abi, ...VAULT_ABI]
  .filter((x) => x.type === 'error');

const A = Object.fromEntries(Object.keys(ACTORS).map((k) => [k, actor(k)]));
A.relayer = deployer();
const NAMES = { ...Object.fromEntries(Object.entries(ACTORS).map(([k, v]) => [k, v.name])), relayer: 'EmpowerTours admin (deployer)' };
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
for (const k of ['venueOax', 'venueCdmx', 'fan', 'hostCdmx', 'uiDrip']) {
  if ((await pub.getBalance({ address: A[k].address })) < parseUnits('20', 18)) {
    const hash = await W.relayer.sendTransaction({ to: A[k].address, value: parseUnits(k === 'uiDrip' ? '500' : '50', 18) });
    const rc = await pub.waitForTransactionReceipt({ hash });
    txs.push({ step: ++step, section, label: `devnet: send ${k === 'uiDrip' ? 500 : 50} MON gas money to ${NAMES[k]}`, from: NAMES.relayer, call: 'transfer', hash, block: Number(rc.blockNumber), gasUsed: Number(rc.gasUsed), gasLimit: Number(rc.gasUsed), costMON: formatUnits(rc.gasUsed * rc.effectiveGasPrice, 18) });
  }
}
for (const k of ['traveler', 'friend', 'guide', 'hostB', 'artist', 'venueOax', 'venueCdmx', 'fan']) {
  await send(`faucet 1,000 mock USDC to ${NAMES[k]}`, k, 'usdc', 'faucet', [A[k].address, U(1000)]);
}
const stops = [
  { who: 'hostB', reward: U('0.75'), tours: T(5), kind: 0, loc: 'hunt:jardin-etnobotanico', name: 'Hunt cache · Jardín Etnobotánico', budget: U(300) },
  { who: 'guide', reward: U('1.00'), tours: T(8), kind: 1, loc: 'guide:santo-domingo', name: "Marisol's meeting point · Santo Domingo", budget: U(200) },
  { who: 'artist', reward: U('0.50'), tours: T(6), kind: 2, loc: 'mural:alcala-14', name: 'Lumbre mural · Calle Macedonio Alcalá', budget: U(100) },
  { who: 'venueOax', reward: U('0.50'), tours: T(6), kind: 3, loc: 'venue:foro-lumbre-patio', name: 'Foro Lumbre Oaxaca · patio murals', budget: U(80) },
  { who: 'venueCdmx', reward: U('0.40'), tours: T(5), kind: 3, loc: 'cdmx:roma-murals', name: 'Foro Indie CDMX · Roma mural walk', budget: U(60) },
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
  { who: 'guide', kind: 0, price: U(35), max: 8, cw: 86400, title: 'Coyoacán & Frida walk', place: 'Coyoacán, CDMX' },
  { who: 'hostCdmx', kind: 1, price: U(55), max: 7, cw: 86400, title: 'Casa Roma · garden loft', place: 'Roma Norte, CDMX' },
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

const t00 = await now();
const dayNow = Math.floor(t00 / 86400);
const venueDefs = [
  { who: 'venueOax', cap: 120, bps: 3000, dep: U(50), fee: U(20), name: 'Foro Lumbre Oaxaca', city: 'Oaxaca', place: 'Jalatlaco, Oaxaca', terms: '70/30 ticket split, 50 USDC deposit, 20 cancel fee' },
  { who: 'venueCdmx', cap: 300, bps: 0, dep: U(80), fee: U(30), name: 'Foro Indie CDMX', city: 'Ciudad de México', place: 'Roma Norte, CDMX', terms: 'flat fee 80 USDC, 30 cancel fee' },
  { who: 'hostA', cap: 60, bps: 2000, dep: U(10), fee: U(0), name: 'Bar La Cantina (not on the leash)', city: 'Oaxaca', place: 'Xochimilco, Oaxaca', terms: '80/20' },
];
const venueIds = [];
for (const v of venueDefs) {
  const { result } = await send(`${NAMES[v.who]} lists venue "${v.name}" (${v.terms})`, v.who, 'venues', 'listVenue',
    [D.usdc, v.cap, v.bps, v.dep, v.fee, v.name, v.city, v.place]);
  venueIds.push(Number(result));
  await send(`${v.name} opens its calendar (next 14 days)`, v.who, 'venues', 'setOpenDates', [result, [...Array(14).keys()].map((i) => dayNow + i), true]);
}
// Round 3: every venue and host registers ITS OWN scanner key (no global attester for escrows).
await send('Foro Lumbre Oaxaca registers its door-scanner key', 'venueOax', 'venues', 'setScanner', [BigInt(venueIds[0]), A.scanOax.address, true]);
await send('Foro Indie CDMX registers its door-scanner key', 'venueCdmx', 'venues', 'setScanner', [BigInt(venueIds[1]), A.scanCdmx.address, true]);
await send('Foro Indie CDMX turns on manual approval (bookings arrive as requests)', 'venueCdmx', 'venues', 'setManualApproval', [BigInt(venueIds[1]), true]);
for (const h of ['guide', 'hostA', 'hostB', 'hostCdmx']) await send(`${NAMES[h]} registers its own phone as check-in scanner`, h, 'bookings', 'setScanner', [A[h].address, true]);

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
const batchTypes = { VisitBatch: [
  { name: 'user', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'campaignIds', type: 'uint256[]' },
  { name: 'visitedAts', type: 'uint64[]' }, { name: 'batchId', type: 'bytes32' }] };
const signBatch = (b, who = A.attester) => who.signTypedData({ domain: rd, types: batchTypes, primaryType: 'VisitBatch', message: b });
let lastBatch;
const visitLog = [];
for (let d = 0; d < 12; d++) {
  const day = today - 12 + d; // 12 days ending yesterday; the show ticket scan today makes it 13
  const plan = [campaignIds[0], d % 3 === 2 ? campaignIds[2] : campaignIds[1]];
  if (d % 4 === 3) plan.push(campaignIds[3]); // the venue-sponsored stop
  const b = { user: A.traveler.address, vault: vaultAddr, campaignIds: plan.map(BigInt),
    visitedAts: plan.map((_, k) => BigInt(day * 86400 + 1800 + k * 900)), batchId: keccak256(toHex(`ana-day-${day}`)) };
  const sig = await signBatch(b);
  const { rc } = await send(`day ${d + 1}: ${plan.length} visits (${plan.map((c) => stops[c].name.split(' · ')[0]).join(', ')}) in ONE batched claim (Ana submits it and pays her own gas)`, 'traveler', 'rewards', 'claimBatch', [b, sig]);
  lastBatch = { b, sig };
  for (const c of plan) visitLog.push({ day: d + 1, stop: stops[c].name, block: Number(rc.blockNumber) });
}
await refuse('replay the same signed batch', 'traveler', 'rewards', 'claimBatch', [lastBatch.b, lastBatch.sig], 'VisitReused');
{
  const v = { user: A.traveler.address, campaignId: lastBatch.b.campaignIds[0], vault: vaultAddr, visitedAt: lastBatch.b.visitedAts[0] + 60n, visitId: keccak256(toHex('ana-dup')) };
  await refuse('single claim for a stop already claimed in that day\'s batch', 'traveler', 'rewards', 'claim', [v, await signVisit(v)], 'AlreadyClaimedToday');
}
{
  const b = { ...lastBatch.b, user: A.friend.address, batchId: keccak256(toHex('forged')) };
  await refuse('Luis forges his own batch attestation', 'friend', 'rewards', 'claimBatch', [b, await signBatch(b, A.friend)], 'BadAttestation');
}

// ------------------------------------------------------------------ 3. yield, artist backing, perk
section = '3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS';
await send('DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time)', 'relayer', 'pool', 'fastForward', [30n * 86400n]);
const artistCfg = { ...cfg, kind: 1, goal: U(1500), totalCap: U(1500), destination: 'Lumbre · Oaxaca → CDMX tour',
  vendors: [A.venueOax.address, A.venueCdmx.address], vendorCaps: [U(100), U(150)], startTime: START };
const { result: artistVault } = await send('Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150)', 'artist', 'factory', 'createVault', [artistCfg]);
const AV = { address: artistVault, abi: VAULT_ABI, name: 'TripVault(artist)' };
await send('Lumbre approves 200 USDC', 'artist', 'usdc', 'approve', [artistVault, U(200)]);
await send('Lumbre puts 200 USDC of her own into the tour fund', 'artist', AV, 'deposit', [U(200), A.artist.address]);
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
const ciSig = await A.guide.signTypedData({ domain: cd, primaryType: 'CheckIn', message: { bookingId: tourId, payer: vaultAddr, at: atCheck },
  types: { CheckIn: [{ name: 'bookingId', type: 'uint256' }, { name: 'payer', type: 'address' }, { name: 'at', type: 'uint64' }] } });
await refuse('a check-in proof signed by the global Hunt key no longer releases a host escrow', 'guide', 'bookings', 'confirmWithAttestation',
  [tourId, atCheck, await A.attester.signTypedData({ domain: cd, primaryType: 'CheckIn', message: { bookingId: tourId, payer: vaultAddr, at: atCheck },
    types: { CheckIn: [{ name: 'bookingId', type: 'uint256' }, { name: 'payer', type: 'address' }, { name: 'at', type: 'uint64' }] } })], 'BadAttestation');
await send('Marisol accepts the booking', 'guide', 'bookings', 'acceptBooking', [tourId]);
await send('Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury)', 'guide', 'bookings', 'confirmWithAttestation', [tourId, atCheck, ciSig]);
await send('Ana confirms check-in at Casita Jalatlaco → stay escrow released', 'traveler', V, 'confirmCheckIn', [stayB]);
const reviews = {
  [String(tourId)]: 'Marisol knew every palenque on the road to Monte Albán. Best day of the trip. 5/5',
  [String(stayB)]: 'Casita Jalatlaco was spotless, quiet and a short walk to the murals. 5/5',
};
await send('Ana anchors her tour review (rating 5 + keccak256 of the text)', 'traveler', 'bookings', 'anchorReview', [tourId, 5, keccak256(toHex(reviews[String(tourId)]))]);
await send('Ana anchors her stay review', 'traveler', 'bookings', 'anchorReview', [stayB, 5, keccak256(toHex(reviews[String(stayB)]))]);

// ------------------------------------------------------------------ 5. Lumbre's tour: venues, tickets, a show, a cancellation
section = '5. Lumbre\'s tour: venue bookings, ticket sales, a show and a cancellation';
const tNow = await now();
const showTimeO = BigInt(tNow + Number(process.env.SHOW_DELAY || 120));
const showTimeC = BigInt(tNow + 86400);
await refuse('tour fund books a venue that is not on the leash', 'artist', AV, 'bookVenue', [BigInt(venueIds[2]), showTimeO, U(10), 50, 'x'], 'NotApprovedVendor');
const { result: showO } = await send('tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split)', 'artist', AV, 'bookVenue', [BigInt(venueIds[0]), showTimeO, U(12), 120, 'Lumbre live · Oaxaca']);
const { result: showC } = await send('tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow)', 'artist', AV, 'bookVenue', [BigInt(venueIds[1]), showTimeC, U(15), 300, 'Lumbre live · CDMX']);
await refuse('fans try to buy CDMX tickets before the venue accepts the request', 'fan', 'tickets', 'buy', [showC, 1, U(15)], 'AwaitingApproval');
await send('Foro Indie CDMX accepts Lumbre\'s booking request → tickets go on sale', 'venueCdmx', 'venues', 'acceptShow', [showC]);
const ticketIds = {};
async function buy(who, show, qty, price, label) {
  await send(`${NAMES[who]} approves ${fmtU(price * BigInt(qty))} USDC`, who, 'usdc', 'approve', [D.tickets, price * BigInt(qty)]);
  const { result } = await send(label, who, 'tickets', 'buy', [show, qty, price * BigInt(qty)]);
  (ticketIds[`${who}-${show}`] = ticketIds[`${who}-${show}`] || []).push(...[...Array(qty).keys()].map((i) => result + BigInt(i)));
}
await buy('traveler', showO, 1, U(12), 'Ana buys 1 ticket for Oaxaca (escrow)');
await buy('traveler', showC, 1, U(15), 'Ana buys 1 ticket for CDMX (escrow)');
await buy('friend', showO, 2, U(12), 'Luis buys 2 tickets for Oaxaca');
await buy('fan', showO, 2, U(12), 'Sofía buys 2 tickets for Oaxaca');
await buy('fan', showC, 2, U(15), 'Sofía buys 2 tickets for CDMX');
await send('Luis claims backing $TOURS (unlocked by the share of tour money actually spent)', 'friend', 'rewards', 'claimBacking', [artistVault]);
log('   waiting for the Oaxaca show at', Number(showTimeO));
await waitUntil(Number(showTimeO) + 1);
const vd = { name: 'EmpowerTours Venues', version: '1', chainId: CHAIN_ID, verifyingContract: D.venues };
const atShow = BigInt(await now());
const td = { name: 'EmpowerTours Tickets', version: '1', chainId: CHAIN_ID, verifyingContract: D.tickets };
const scanTypes = { TicketScan: [{ name: 'ticketId', type: 'uint256' }, { name: 'holder', type: 'address' }, { name: 'at', type: 'uint64' }] };
async function scanTicket(who, id) {
  const at = BigInt(await now());
  const sig = await A.scanOax.signTypedData({ domain: td, types: scanTypes, primaryType: 'TicketScan', message: { ticketId: id, holder: A[who].address, at } });
  await send(`door scan: ${NAMES[who]}'s ticket #${id} (check-in → $TOURS + streak; venue submits, pays gas)`, 'venueOax', 'tickets', 'scan', [id, at, sig]);
  return { at, sig };
}
const anaScan = await scanTicket('traveler', ticketIds[`traveler-${showO}`][0]);
for (const id of ticketIds[`friend-${showO}`]) await scanTicket('friend', id);
await scanTicket('fan', ticketIds[`fan-${showO}`][0]);
await refuse('door-scalping lock: after the first scan Sofía tries to pass her spare ticket to Marisol (holds none)', 'fan', 'tickets', 'transferTicket', [ticketIds[`fan-${showO}`][1], A.guide.address], 'TransferLocked');
await send('Sofía passes her spare ticket to Luis (already a holder → allowed)', 'fan', 'tickets', 'transferTicket', [ticketIds[`fan-${showO}`][1], A.friend.address]);
await refuse('scan Ana\'s ticket a second time', 'venueOax', 'tickets', 'scan', [ticketIds[`traveler-${showO}`][0], anaScan.at, anaScan.sig], 'AlreadyUsed');
await refuse('the global Hunt key can no longer attest a show', 'venueOax', 'venues', 'confirmShow', [showO, atShow,
  await A.attester.signTypedData({ domain: vd, primaryType: 'ShowAttestation', message: { showId: showO, outcome: 1, at: atShow },
    types: { ShowAttestation: [{ name: 'showId', type: 'uint256' }, { name: 'outcome', type: 'uint8' }, { name: 'at', type: 'uint64' }] } })], 'BadAttestation');
const showSig = await A.scanOax.signTypedData({ domain: vd, primaryType: 'ShowAttestation', message: { showId: showO, outcome: 1, at: atShow },
  types: { ShowAttestation: [{ name: 'showId', type: 'uint256' }, { name: 'outcome', type: 'uint8' }, { name: 'at', type: 'uint64' }] } });
await send('Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee)', 'venueOax', 'venues', 'confirmShow', [showO, atShow, showSig]);
await send('settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% (Lumbre triggers it)', 'artist', 'tickets', 'settle', [showO]);
await send('Foro Indie CDMX cancels → Lumbre\'s tour fund refunded automatically (80 USDC), leash restored', 'venueCdmx', 'venues', 'venueCancel', [showC]);
await send('refund every CDMX ticket holder in one call (anyone can trigger; the venue does)', 'venueCdmx', 'tickets', 'refundAll', [showC, 50n]);
await refuse('buy a ticket for the cancelled CDMX show', 'fan', 'tickets', 'buy', [showC, 1, U(15)], 'NotOnSale');

// ------------------------------------------------------------------ 5b. round 3: resale with a cap, door-scalping lock, pending requests
section = '5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI';
const t2 = await now();
const showTimeO2 = BigInt(t2 + 3 * 86400);
const showTimeC2 = BigInt(t2 + 5 * 86400);
const { result: showO2 } = await send('tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit)', 'artist', AV, 'bookVenue', [BigInt(venueIds[0]), showTimeO2, U(12), 120, 'Lumbre live · Oaxaca (night 2)']);
await buy('friend', showO2, 2, U(12), 'Luis buys 2 tickets for Oaxaca night 2');
await buy('fan', showO2, 1, U(12), 'Sofía buys 1 ticket for Oaxaca night 2');
const [l1, l2] = ticketIds[`friend-${showO2}`];
await refuse('Luis lists a ticket at 13.21 USDC (cap is 110% of 12 = 13.20)', 'friend', 'tickets', 'listForResale', [l1, U('13.21')], 'PriceAboveCap');
await send('Luis lists ticket at 13.20 USDC (110% of face)', 'friend', 'tickets', 'listForResale', [l1, U('13.20')]);
await send('Ana approves 13.20 USDC', 'traveler', 'usdc', 'approve', [D.tickets, U('13.20')]);
await send('Ana buys Luis\'s resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis', 'traveler', 'tickets', 'buyResale', [l1, U('13.20')]);
await send('Luis lists his second ticket at 12.60 USDC (left open for the UI)', 'friend', 'tickets', 'listForResale', [l2, U('12.60')]);
(ticketIds[`traveler-${showO2}`] = ticketIds[`traveler-${showO2}`] || []).push(l1);
ticketIds[`friend-${showO2}`] = [l2];
// door lock on night 1: Sofía's spare ticket (night 1 is Played, so it is locked entirely)
const { result: showC2 } = await send('tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue)', 'artist', AV, 'bookVenue', [BigInt(venueIds[1]), showTimeC2, U(15), 300, 'Lumbre live · CDMX (rescheduled)']);
const startAt2 = BigInt(await now()) + 30n;
const { result: stayPending } = await send('vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI)', 'traveler', V, 'book', [BigInt(listingIds[1]), 1, startAt2]);

// ------------------------------------------------------------------ 5. final state
section = '6. Final state';
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
  venueFees: await read('venues', 'feesCollected'), ticketFees: await read('tickets', 'feesCollected'),
  salesO: await read('tickets', 'sales', [showO]), salesC: await read('tickets', 'sales', [showC]),
  relO: await read('venues', 'reliability', [BigInt(venueIds[0])]), relC: await read('venues', 'reliability', [BigInt(venueIds[1])]),
  fundAssets: await read(AV, 'totalAssets'), fundSpent: await read(AV, 'totalSpent'), fundOpen: await read(AV, 'openBookings'),
  ticketEscrow: await read('usdc', 'balanceOf', [D.tickets]), venueEscrow: await read('usdc', 'balanceOf', [D.venues]),
};
const summary = {
  vault: vaultAddr, artistVault,
  progress: `${(st.progressBps / 100).toFixed(2)}% funded (${fmtU(st.totalAssets + st.totalSpent)} / 500 USDC incl. ${fmtU(st.totalSpent)} already spent on bookings)`,
  vaultBalanceNow: fmtU(st.totalAssets), principal: fmtU(st.totalPrincipal), yieldEarned: fmtU(st.yieldEarned),
  streak: { current: Number(st.streak[1]), best: Number(st.streak[2]), daysVisited: Number(st.streak[3]) },
  visits: visitLog.length,
  anaTours: fmtT(st.anaTours), anaToursBeforePerk: fmtT(toursBefore), luisTours: fmtT(st.luisTours), toursSupply: fmtT(st.toursSupply), toursBurned: fmtT(st.burned),
  treasuryRevenueUSDC: { total: fmtU(st.treasuryUsdc), sponsorFees: fmtU(st.sponsorFees), bookingFees: fmtU(st.bookingFees), venueDepositFees: fmtU(st.venueFees), ticketFees: fmtU(st.ticketFees) },
  oaxacaShow: { gross: fmtU(st.salesO[0]), sold: Number(st.salesO[1]), toArtist: fmtU(st.salesO[5]), toVenue: fmtU(st.salesO[6]), fee: fmtU(st.salesO[7]), venueDepositReleased: fmtU(U(50) * 9700n / 10000n) },
  cdmxShow: { status: 'VenueCancelled', ticketsRefunded: 3, grossLeftInEscrow: fmtU(st.salesC[0]), depositRefundedToFund: '80' },
  venueReliability: { oaxaca: { held: Number(st.relO[0]), cancelled: Number(st.relO[1]), bps: Number(st.relO[2]) }, cdmx: { held: Number(st.relC[0]), cancelled: Number(st.relC[1]), bps: Number(st.relC[2]) } },
  tourFund: { balance: fmtU(st.fundAssets), spent: fmtU(st.fundSpent), openBookings: Number(st.fundOpen) },
  escrowsAfter: { tickets: fmtU(st.ticketEscrow), venues: fmtU(st.venueEscrow) },
  batchedClaims: 12,
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
md += `- Check-ins: ${summary.visits} visits in **12 batched claims** (one per day) + Ana's show ticket scan → streak ${summary.streak.current}\n`;
md += `- Oaxaca show: ${summary.oaxacaShow.sold} tickets, gross ${summary.oaxacaShow.gross} USDC → Lumbre ${summary.oaxacaShow.toArtist}, Foro Oaxaca ${summary.oaxacaShow.toVenue}, fee ${summary.oaxacaShow.fee}; venue deposit released ${summary.oaxacaShow.venueDepositReleased}\n`;
md += `- CDMX show: venue cancelled → 80 USDC back to Lumbre's tour fund, 3 tickets (45 USDC) refunded; escrows now tickets ${summary.escrowsAfter.tickets} / venues ${summary.escrowsAfter.venues}\n`;
md += `- Venue reliability: Oaxaca ${summary.venueReliability.oaxaca.held} held / ${summary.venueReliability.oaxaca.cancelled} cancelled; CDMX ${summary.venueReliability.cdmx.held} / ${summary.venueReliability.cdmx.cancelled}\n`;
md += `- Treasury fee breakdown: sponsor ${summary.treasuryRevenueUSDC.sponsorFees} + bookings ${summary.treasuryRevenueUSDC.bookingFees} + venue deposits ${summary.treasuryRevenueUSDC.venueDepositFees} + tickets ${summary.treasuryRevenueUSDC.ticketFees}\n`;
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
  listings: listingIds, perks: perkIds, venues: venueIds, venueDefs: venueDefs.map((v) => ({ ...v, dep: String(v.dep), fee: String(v.fee) })),
  shows: { oaxaca: String(showO), cdmx: String(showC), oaxaca2: String(showO2), cdmx2: String(showC2) },
  resaleOpen: String(l2), pendingBooking: String(stayPending), tickets: Object.fromEntries(Object.entries(ticketIds).map(([k, v]) => [k, v.map(String)])), bookings: { tour: String(tourId), stayCancelled: String(stayA), stay: String(stayB) }, reviews,
}, null, 2));
log(`done: ${txs.length} txs, transcript at demo/transcript.md`);
