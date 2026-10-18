// Rumbo → Monad TESTNET (10143) deploy wrapper. Never mainnet.
//   node scripts/deploy-testnet.mjs                dry run on a local anvil fork of testnet (default)
//   node scripts/deploy-testnet.mjs --solonet      dry run on local Solonet (Monad gas schedule; uses Rumbo Test USDC)
//   node scripts/deploy-testnet.mjs --broadcast    REAL testnet deploy (refuses if the deployer can't cover the estimate)
// The deployer key is read from DEPLOYER_KEY_FILE (default /home/box/.rumbo/deployer.key, chmod 600, outside the
// repo), passed to forge via env only, and never printed. The address is derived and shown.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, copyFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';

const ROOT = new URL('..', import.meta.url).pathname;
const C = `${ROOT}contracts`;
const BIN = `${process.env.HOME}/.foundry/bin`;
const arg = (f) => process.argv.includes(f);
const MODE = arg('--broadcast') ? 'broadcast' : arg('--solonet') ? 'solonet' : 'fork';
const TESTNET_RPC = process.env.TESTNET_RPC || 'https://rpc-testnet.monadinfra.com';
const MULT = process.env.GAS_MULT || '130'; // Monad charges the gas LIMIT: keep the estimate multiplier modest
const rpcCall = async (url, method, params = []) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
};
const keyFrom = (file) => { const k = readFileSync(file, 'utf8').trim(); return k.startsWith('0x') ? k : `0x${k}`; };

let rpc, pk, chainId, anvil;
if (MODE === 'solonet') {
  rpc = process.env.SOLONET_RPC || 'http://localhost:8080';
  pk = keyFrom(process.env.PK_FILE || '/workspace/solonet-test/.pk'); // LOCAL-only devnet key (public Anvil #9)
  chainId = 20143;
} else {
  pk = keyFrom(process.env.DEPLOYER_KEY_FILE || '/home/box/.rumbo/deployer.key');
  chainId = 10143;
  if (MODE === 'fork') {
    const port = process.env.FORK_PORT || '8547';
    anvil = spawn(`${BIN}/anvil`, ['--fork-url', TESTNET_RPC, '--port', port, '--silent'], { stdio: 'ignore' });
    rpc = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await rpcCall(rpc, 'eth_chainId'); break; } catch { if (i > 60) throw new Error('anvil fork did not start'); await new Promise((r) => setTimeout(r, 500)); } }
  } else rpc = TESTNET_RPC;
}
const me = privateKeyToAccount(pk).address;
const cid = Number(await rpcCall(rpc, 'eth_chainId'));
if (cid === 143) throw new Error('refusing Monad mainnet');
if (cid !== chainId) throw new Error(`expected chain ${chainId}, RPC is ${cid}`);
const fees = { base: BigInt((await rpcCall(MODE === 'solonet' ? rpc : TESTNET_RPC, 'eth_getBlockByNumber', ['latest', false])).baseFeePerGas), gasPrice: BigInt(await rpcCall(MODE === 'solonet' ? rpc : TESTNET_RPC, 'eth_gasPrice')) };
const realBal = MODE === 'solonet' ? null : BigInt(await rpcCall(TESTNET_RPC, 'eth_getBalance', [me, 'latest']));
console.log(`mode ${MODE} · chain ${cid} · deployer ${me}${realBal !== null ? ` · testnet balance ${Number(realBal) / 1e18} MON` : ''}`);
if (MODE === 'fork') await rpcCall(rpc, 'anvil_setBalance', [me, '0x3635C9ADC5DEA00000']); // 1000 MON inside the fork only

const OUT = MODE === 'broadcast' ? 'deployments/monad-testnet.json' : `deployments/monad-testnet-dryrun-${MODE}.json`;
const forgeArgs = ['script', 'script/DeployTestnet.s.sol', '--rpc-url', rpc, '--broadcast', '--slow', '--gas-estimate-multiplier', MULT];
if (MODE === 'broadcast') {
  // simulate first (no --broadcast) to get forge's estimate, then refuse if the balance can't cover it
  const sim = spawnSync(`${BIN}/forge`, forgeArgs.filter((a) => a !== '--broadcast'), { cwd: C, env: { ...process.env, DEPLOYER_PK: pk, OUT: 'deployments/monad-testnet-sim.json' }, encoding: 'utf8' });
  const m = /Estimated amount required:\s*([\d.]+) ETH/.exec(sim.stdout || '');
  if (sim.status !== 0 || !m) { console.error(sim.stdout?.slice(-2000), sim.stderr?.slice(-2000)); throw new Error('simulation failed'); }
  rmSync(`${C}/deployments/monad-testnet-sim.json`, { force: true });
  const need = BigInt(Math.ceil(Number(m[1]) * 1e18));
  console.log(`forge estimate: ${m[1]} MON required`);
  if (realBal < need) throw new Error(`deployer has ${Number(realBal) / 1e18} MON, needs ≥ ${m[1]} MON; fund ${me} at faucet.monad.xyz`);
}
const recDir = `${C}/broadcast/DeployTestnet.s.sol/${cid}`;
const bak = `${recDir}.real-bak`;
if (MODE !== 'broadcast' && existsSync(recDir)) renameSync(recDir, bak); // never clobber a real testnet record
const r = spawnSync(`${BIN}/forge`, forgeArgs, { cwd: C, env: { ...process.env, DEPLOYER_PK: pk, OUT }, encoding: 'utf8' });
anvil?.kill();
const est = /Estimated total gas used for script:\s*([\d,]+)/.exec(r.stdout || '');
const req = /Estimated amount required:\s*([\d.]+) ETH/.exec(r.stdout || '');
const restore = () => { if (existsSync(bak)) { rmSync(recDir, { recursive: true, force: true }); renameSync(bak, recDir); } };
if (r.status !== 0) { restore(); console.error((r.stdout || '').slice(-3000), (r.stderr || '').slice(-3000)); process.exit(r.status ?? 1); }

// actual gas used and gas limits from the broadcast record
const rec = JSON.parse(readFileSync(`${recDir}/run-latest.json`, 'utf8'));
let used = 0n, limit = 0n;
for (const t of rec.transactions) limit += BigInt(t.transaction.gas);
for (const x of rec.receipts) used += BigInt(x.gasUsed);
const mon = (g, p) => (Number(g * p) / 1e18).toFixed(3);
console.log(`txs ${rec.transactions.length} · gas used ${used} · gas limits (charged on Monad) ${limit} at ×${Number(MULT) / 100}`);
console.log(`testnet base fee ${Number(fees.base) / 1e9} gwei, gasPrice ${Number(fees.gasPrice) / 1e9} gwei`);
console.log(`cost ≈ ${mon(limit, fees.gasPrice)} MON at gasPrice (limit-charged) · ${mon(used, fees.gasPrice)} MON if only used gas were charged`);
if (est) console.log(`forge: estimated total gas ${est[1]}, amount required ${req?.[1]} MON (at forge's max fee)`);
if (MODE !== 'broadcast') {
  // keep dry-run records out of the real testnet record path
  const dry = `${C}/broadcast/DeployTestnet.s.sol/${cid}-dryrun-${MODE}`;
  rmSync(dry, { recursive: true, force: true }); renameSync(recDir, dry); restore();
  console.log(`dry run only; addresses (throwaway) in contracts/${OUT}`);
} else {
  mkdirSync(`${ROOT}deployments`, { recursive: true });
  copyFileSync(`${C}/${OUT}`, `${ROOT}deployments/monad-testnet.json`);
  console.log('DEPLOYED. deployments/monad-testnet.json written; commit it so the app flips from coming-soon.');
}
