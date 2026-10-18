// Snapshot Rumbo's TESTNET $TOURS ledger into a claim epoch for ToursClaimDistributor (intended: Monad
// mainnet, paying the one shared $TOURS). READ-ONLY: reads testnet logs/state, writes a JSON file.
// It never signs or sends anything; publishing the root is a separate, approved step.
//
//   node scripts/tours-snapshot.mjs --distributor 0x… --chain-id 143 \
//        [--deployments contracts/deployments/monad-testnet.json] [--prev snapshots/epoch-1.json] \
//        [--to-block N] [--deny denylist.json] [--config scripts/tours-epoch.config.json] [--out snapshots/epoch-2.json]
//
// Earned points per wallet come from events in (prev.toBlock, toBlock]: TourRewards.VisitRewarded (attested
// visits, incl. batches), Tickets.TicketScanned (door scans; the only check-in source), TourRewards.BackingRewarded
// (artist backing). Scans are split by whether the show's venue owner is on `verifiedVenueOwners`, because
// listing a venue is permissionless and a farmer could scan tickets for their own sybil wallets.
// The ledger token's own mint total is cross-checked against the sum.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createPublicClient, http, parseAbi, parseAbiItem, keccak256, stringToHex, getAddress, formatEther, parseEther } from 'viem';
import { allocate, leafOf, buildTree, proofOf, verify } from './tours-epoch-lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : a), []));
const RPC = process.env.TESTNET_RPC || 'https://rpc-testnet.monadinfra.com';
const CHUNK = BigInt(process.env.LOG_CHUNK || 100);
const RPS = Number(process.env.RPC_RPS || 15);
if (!args.distributor || !args['chain-id']) { console.error('need --distributor and --chain-id'); process.exit(2); }
const dep = JSON.parse(readFileSync(args.deployments || `${ROOT}contracts/deployments/monad-testnet.json`, 'utf8'));
const cfgRaw = JSON.parse(readFileSync(args.config || `${ROOT}scripts/tours-epoch.config.json`, 'utf8'));
const W = (n) => parseEther(String(n)).toString();
const policy = { ...cfgRaw, backingCapPerWalletPerEpoch: W(cfgRaw.backingCapPerWalletPerEpoch), minClaim: W(cfgRaw.minClaim), perWalletPerEpoch: W(cfgRaw.perWalletPerEpoch), maxPerWallet: W(cfgRaw.maxPerWallet), epochBudget: W(cfgRaw.epochBudget) };
const prevFile = args.prev ? JSON.parse(readFileSync(args.prev, 'utf8')) : null;
if (prevFile && getAddress(prevFile.distributor) !== getAddress(args.distributor)) throw new Error('previous epoch belongs to another distributor');

let next = 0;
const fetchFn = async (url, init) => {
  for (let a = 0; ; a++) {
    const now = Date.now(); const at = Math.max(now, next); next = at + 1000 / RPS;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    const res = await fetch(url, init);
    if (res.status !== 429 || a > 10) return res;
    await new Promise((r) => setTimeout(r, 300 * 2 ** Math.min(a, 5)));
  }
};
const client = createPublicClient({ transport: http(RPC, { fetchFn, retryCount: 4, timeout: 30_000 }) });
const ledgerChain = await client.getChainId();
if (ledgerChain !== 10143 || dep.chainId !== 10143) throw new Error(`ledger must be Rumbo on Monad testnet (10143), got ${ledgerChain}`);

const head = await client.getBlockNumber();
const toBlock = args['to-block'] ? BigInt(args['to-block']) : head - 5n;
const fromBlock = prevFile ? BigInt(prevFile.toBlock) + 1n : BigInt(dep.fromBlock);
if (toBlock < fromBlock) throw new Error('nothing new since the previous epoch');
const epoch = prevFile ? prevFile.epoch + 1 : 1;

const events = [
  parseAbiItem('event VisitRewarded(uint256 indexed campaignId, address indexed user, address indexed vault, uint256 reward, uint256 tours, uint32 streak, bytes32 visitId)'),
  parseAbiItem('event BackingRewarded(address indexed vault, address indexed backer, uint256 tours)'),
];
const scanEv = parseAbiItem('event TicketScanned(uint256 indexed ticketId, uint256 indexed showId, address indexed holder, uint256 tours)');
const verified = cfgRaw.verifiedVenueOwners ? new Set(cfgRaw.verifiedVenueOwners.map((a) => a.toLowerCase())) : null;
const showAbi = parseAbi(['function showInfo(uint256) view returns ((uint8 status, uint64 showTime, uint32 maxTickets, uint16 venueTicketBps, uint128 ticketPrice, address artist, address venueOwner, address asset))']);
const venueOwnerOf = new Map();
async function venueOwner(showId) {
  if (!venueOwnerOf.has(showId)) venueOwnerOf.set(showId, (await client.readContract({ address: dep.venues, abi: showAbi, functionName: 'showInfo', args: [showId] })).venueOwner.toLowerCase());
  return venueOwnerOf.get(showId);
}
const mintEv = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const earned = new Map(); let fromEvents = 0n; let minted = 0n; let logCalls = 0;
const add = (u, k, v) => { const a = u.toLowerCase(); const e = earned.get(a) || { visit: 0n, checkin: 0n, checkinUnverified: 0n, backing: 0n }; e[k] += v; earned.set(a, e); fromEvents += v; };
for (let b = fromBlock; b <= toBlock; b += CHUNK) {
  const to = b + CHUNK - 1n > toBlock ? toBlock : b + CHUNK - 1n;
  const [logs, scans, mints] = await Promise.all([
    client.getLogs({ address: dep.rewards, events, fromBlock: b, toBlock: to }),
    client.getLogs({ address: dep.tickets, event: scanEv, fromBlock: b, toBlock: to }),
    client.getLogs({ address: dep.tours, event: mintEv, args: { from: '0x0000000000000000000000000000000000000000' }, fromBlock: b, toBlock: to }),
  ]);
  logCalls += 3;
  for (const l of logs) {
    if (l.eventName === 'VisitRewarded') add(l.args.user, 'visit', l.args.tours);
    else add(l.args.backer, 'backing', l.args.tours);
  }
  for (const sc of scans) {
    if (sc.args.tours === 0n) continue;
    const ok = verified === null || verified.has(await venueOwner(sc.args.showId));
    add(sc.args.holder, ok ? 'checkin' : 'checkinUnverified', sc.args.tours);
  }
  for (const m of mints) minted += m.args.value;
  if (logCalls % 300 === 0) process.stderr.write(`  …block ${to} (${Number(to - fromBlock) * 100 / Number(toBlock - fromBlock + 1n) | 0}%)\n`);
}

// exclusions: protocol/admin keys, contracts, manual denylist
const excluded = new Map();
for (const k of ['admin', 'attester', 'deployer', 'treasury', 'partner']) if (dep[k]) excluded.set(dep[k].toLowerCase(), `protocol key (${k})`);
if (args.deny) for (const [a, why] of Object.entries(JSON.parse(readFileSync(args.deny, 'utf8')))) excluded.set(a.toLowerCase(), `denylist: ${why}`);
const streakAbi = parseAbi(['function streakOf(address) view returns (uint32 lastDay, uint32 current, uint32 best, uint32 daysVisited)']);
const activity = new Map();
for (const a of earned.keys()) {
  if (excluded.has(a)) continue;
  const code = await client.getCode({ address: a });
  if (code && code !== '0x') { excluded.set(a, 'contract, not a person'); continue; }
  const [, , , daysVisited] = await client.readContract({ address: dep.rewards, abi: streakAbi, functionName: 'streakOf', args: [a] });
  activity.set(a, { daysVisited: Number(daysVisited) });
}

const prev = new Map(Object.entries(prevFile?.cumulative || {}));
const res = allocate({ earned, activity, prev, excluded, epoch, p: policy });
const entries = [...res.cumulative].filter(([, v]) => v > 0n).map(([a, v]) => ({ address: getAddress(a), cumulative: v })).sort((x, y) => (x.address.toLowerCase() < y.address.toLowerCase() ? -1 : 1));
if (!entries.length) throw new Error('no eligible wallets this epoch');
const leaves = entries.map((e) => leafOf(args['chain-id'], args.distributor, e.address, e.cumulative));
const tree = buildTree(leaves);
entries.forEach((e, i) => { e.proof = proofOf(tree, i); if (!verify(e.proof, tree.root, leaves[i])) throw new Error('proof self-check failed'); });
const cumulativeTotal = entries.reduce((s, e) => s + e.cumulative, 0n);
const prevTotal = BigInt(prevFile?.cumulativeTotal || 0);
const canonical = JSON.stringify(entries.map((e) => [e.address, e.cumulative.toString()]));
const out = {
  kind: 'rumbo-tours-epoch', epoch, ledger: { chainId: 10143, rewards: dep.rewards, tours: dep.tours }, distributor: getAddress(args.distributor), distributorChainId: Number(args['chain-id']),
  fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), createdAt: new Date().toISOString(), policy: cfgRaw,
  root: tree.root, cumulativeTotal: cumulativeTotal.toString(), epochIncrease: (cumulativeTotal - prevTotal).toString(), snapshotHash: keccak256(stringToHex(canonical)),
  checks: { earnedFromEvents: fromEvents.toString(), mintedOnLedger: minted.toString(), match: fromEvents === minted, scaledBps: Number(res.scaledBps), logCalls },
  cumulative: Object.fromEntries(entries.map((e) => [e.address, e.cumulative.toString()])),
  thisEpoch: res.rows.filter((r) => r.amount > 0n).map((r) => ({ address: r.address, amount: r.amount.toString(), hitCap: r.capped, daysVisited: r.daysVisited, earned: { visit: r.source.visit.toString(), checkin: r.source.checkin.toString(), checkinUnverified: r.source.checkinUnverified.toString(), backing: r.source.backing.toString() } })),
  dropped: res.dropped,
  claims: entries.map((e) => ({ address: e.address, cumulative: e.cumulative.toString(), proof: e.proof })),
};
const file = args.out || `${ROOT}snapshots/epoch-${epoch}.json`;
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`epoch ${epoch}: blocks ${fromBlock}..${toBlock}, ${entries.length} wallets, +${formatEther(cumulativeTotal - prevTotal)} TOURS (cumulative ${formatEther(cumulativeTotal)}), ${res.dropped.length} dropped, ledger mint cross-check ${out.checks.match ? 'OK' : 'MISMATCH'} → ${file}`);
console.log(`root ${tree.root}  snapshotHash ${out.snapshotHash}`);
