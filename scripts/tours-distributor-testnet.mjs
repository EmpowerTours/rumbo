// End-to-end rehearsal of the shared-$TOURS claim path, entirely on Monad TESTNET (10143):
//   1. deploy ToursTokenStandIn (ToursTokenV2 interface, "tTOURS", not the real token) + ToursClaimDistributor
//   2. snapshot the Rumbo QA stack's $TOURS ledger (scripts/tours-snapshot.mjs) for that distributor
//   3. fund exactly the epoch, publish the root, claim for real wallets (relayed: anyone may relay)
//   4. attack attempts (simulated against the live contract; every one must revert)
// Writes audits/tours-distributor-testnet.json. Refuses any chain but 10143. Mainnet is never touched.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getAddress, parseEther, formatEther, decodeErrorResult } from 'viem';
import { pub, wallet, deployer, assertSolonet, ROOT, rpcStats } from './testnet-lib.mjs';

await assertSolonet();
const art = (n, dir = n) => JSON.parse(readFileSync(`${ROOT}contracts/out/${dir}.sol/${n}.json`, 'utf8'));
const tokArt = art('ToursTokenStandIn'); const distArt = art('ToursClaimDistributor');
const me = deployer(); const w = wallet(me);
const cfg = JSON.parse(readFileSync(`${ROOT}scripts/tours-epoch.config.json`, 'utf8'));
const INTERVAL = BigInt(process.env.INTERVAL_S || 90);
const log = { chainId: 10143, startedAt: new Date().toISOString(), txs: [], claims: [], attacks: [] };
const send = async (what, p) => { const hash = await p; const r = await pub.waitForTransactionReceipt({ hash }); if (r.status !== 'success') throw new Error(`${what} reverted`); log.txs.push({ what, hash, gas: Number(r.gasUsed), block: Number(r.blockNumber) }); console.log(`✓ ${what} (${hash.slice(0, 10)}…, gas ${r.gasUsed})`); return r; };

const tokR = await send('deploy ToursTokenStandIn', w.deployContract({ abi: tokArt.abi, bytecode: tokArt.bytecode.object }));
const token = tokR.contractAddress;
const distR = await send('deploy ToursClaimDistributor', w.deployContract({ abi: distArt.abi, bytecode: distArt.bytecode.object, args: [me.address, me.address, token, parseEther(String(cfg.epochBudget)), parseEther(String(cfg.perWalletPerEpoch)), parseEther(String(cfg.maxPerWallet)), INTERVAL] }));
const dist = distR.contractAddress;
log.token = token; log.distributor = dist;
const D = { address: dist, abi: distArt.abi }; const T = { address: token, abi: tokArt.abi };

// rehearsal policy: same as proposed, except every QA venue counts as verified (the QA stack's venues are our test actors)
const rehearsalCfg = `${ROOT}audits/.tours-epoch.rehearsal.json`;
writeFileSync(rehearsalCfg, JSON.stringify({ ...cfg, verifiedVenueOwners: null }));
const snap1 = `${ROOT}audits/tours-epoch-1.testnet.json`;
execFileSync('node', [`${ROOT}scripts/tours-snapshot.mjs`, '--deployments', `${ROOT}contracts/deployments/monad-testnet-qa.json`, '--distributor', dist, '--chain-id', '10143', '--config', rehearsalCfg, '--out', snap1], { stdio: 'inherit' });
const S = JSON.parse(readFileSync(snap1, 'utf8'));
log.snapshot = { file: 'audits/tours-epoch-1.testnet.json', wallets: S.claims.length, dropped: S.dropped.length, cumulativeTotal: formatEther(BigInt(S.cumulativeTotal)), root: S.root, ledgerMintCrossCheck: S.checks.match };

const sim = async (what, fn, args, account = me.address) => {
  try { await pub.simulateContract({ ...D, functionName: fn, args, account }); log.attacks.push({ what, refused: false }); console.log(`✗ NOT refused: ${what}`); }
  catch (e) { const name = e?.cause?.data?.errorName || e?.cause?.reason || e?.shortMessage?.split('\n')[0]; log.attacks.push({ what, refused: true, error: name }); console.log(`✓ refused: ${what} → ${name}`); }
};
// publishing before funding must fail
await sim('publish root before the distributor is funded', 'publishEpoch', [S.root, BigInt(S.cumulativeTotal), S.snapshotHash]);
await send(`fund distributor with exactly ${formatEther(BigInt(S.cumulativeTotal))} tTOURS`, w.writeContract({ ...T, functionName: 'transfer', args: [dist, BigInt(S.cumulativeTotal)] }));
await sim('publish by a non-publisher', 'publishEpoch', [S.root, BigInt(S.cumulativeTotal), S.snapshotHash], S.claims[0].address);
await sim('publish a total above the per-epoch ceiling', 'publishEpoch', [S.root, parseEther(String(cfg.epochBudget)) + 1n, S.snapshotHash]);
await send('publish epoch 1 root', w.writeContract({ ...D, functionName: 'publishEpoch', args: [S.root, BigInt(S.cumulativeTotal), S.snapshotHash] }));

const claimers = S.claims.slice(0, Number(process.env.CLAIMS || 6));
for (const c of claimers) {
  const before = await pub.readContract({ ...T, functionName: 'balanceOf', args: [c.address] });
  await send(`claim ${formatEther(BigInt(c.cumulative))} tTOURS for ${c.address.slice(0, 8)}… (relayed)`, w.writeContract({ ...D, functionName: 'claim', args: [c.address, BigInt(c.cumulative), c.proof] }));
  const after = await pub.readContract({ ...T, functionName: 'balanceOf', args: [c.address] });
  if (after - before !== BigInt(c.cumulative)) throw new Error('claim paid the wrong amount');
  log.claims.push({ address: c.address, amount: formatEther(after - before) });
}
const c0 = claimers[0]; const c1 = claimers[1]; const other = S.claims[claimers.length] || c1;
await sim('double claim', 'claim', [c0.address, BigInt(c0.cumulative), c0.proof]);
await sim('claim with an inflated amount', 'claim', [other.address, BigInt(other.cumulative) + 1n, other.proof]);
await sim('claim someone else\'s entitlement to a sybil wallet', 'claim', ['0x000000000000000000000000000000000000bEEF', BigInt(other.cumulative), other.proof]);
await sim('claim above the per-wallet epoch cap', 'claim', [other.address, parseEther(String(cfg.perWalletPerEpoch)) + 1n, other.proof]);
await sim('publish epoch 2 before the interval', 'publishEpoch', [S.root, BigInt(S.cumulativeTotal), S.snapshotHash]);
await sim('owner withdraws tokens that are owed to claimers', 'withdrawSurplus', [me.address, 1n]);
await send(`block ${other.address.slice(0, 8)}… (flagged)`, w.writeContract({ ...D, functionName: 'setBlocked', args: [other.address, true] }));
await sim('blocked wallet claims', 'claim', [other.address, BigInt(other.cumulative), other.proof]);
await send(`unblock ${other.address.slice(0, 8)}…`, w.writeContract({ ...D, functionName: 'setBlocked', args: [other.address, false] }));
await send('pause the stand-in token (as ToursTokenV2\'s owner could)', w.writeContract({ ...T, functionName: 'pause' }));
await sim('claim while the token is paused', 'claim', [other.address, BigInt(other.cumulative), other.proof]);
await send('unpause the stand-in token', w.writeContract({ ...T, functionName: 'unpause' }));

const totalClaimed = await pub.readContract({ ...D, functionName: 'totalClaimed' });
const bal = await pub.readContract({ ...T, functionName: 'balanceOf', args: [dist] });
log.final = { totalClaimed: formatEther(totalClaimed), distributorBalance: formatEther(bal), owed: formatEther(BigInt(S.cumulativeTotal) - totalClaimed), solvent: bal >= BigInt(S.cumulativeTotal) - totalClaimed };
log.summary = { claims: log.claims.length, attacks: log.attacks.length, refused: log.attacks.filter((a) => a.refused).length, txs: log.txs.length, gas: log.txs.reduce((s, t) => s + t.gas, 0), rpc: rpcStats };
log.finishedAt = new Date().toISOString();
writeFileSync(`${ROOT}audits/tours-distributor-testnet.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify({ token, dist, ...log.summary, final: log.final }, null, 1));
if (log.summary.refused !== log.summary.attacks) process.exit(1);
