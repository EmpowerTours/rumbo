// Shared helpers for Rumbo smoke/load tests on Monad TESTNET (10143). Never mainnet: chain id is asserted.
// Targets the QA stack (contracts/deployments/monad-testnet-qa.json: same DeployTestnet script, but with the
// Rumbo Test USDC faucet token) so test listings never show up in the production app.
// Test wallets are throwaway keys generated once into /home/box/.rumbo/qa-wallets.json (outside the repo).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

export const RPC = process.env.TESTNET_RPC || 'https://rpc-testnet.monadinfra.com';
export const CHAIN_ID = 10143;
export const ROOT = new URL('..', import.meta.url).pathname;
const WALLETS = process.env.QA_WALLETS || '/home/box/.rumbo/qa-wallets.json';
const DEPLOYER_KEY_FILE = process.env.DEPLOYER_KEY_FILE || '/home/box/.rumbo/deployer.key';

export const testnet = defineChain({
  id: CHAIN_ID, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
// Public testnet RPCs rate-limit (HTTP 429). Every client shares one throttled fetch: at most RPC_RPS requests/s,
// and a 429 is retried with backoff (safe for eth_sendRawTransaction: a rate-limited tx was never accepted).
const RPS = Number(process.env.RPC_RPS || 20);
let nextSlot = 0;
export const rpcStats = { requests: 0, rateLimited: 0 };
async function throttledFetch(url, init) {
  for (let attempt = 0; ; attempt++) {
    const now = Date.now(); const at = Math.max(now, nextSlot); nextSlot = at + 1000 / RPS;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    rpcStats.requests++;
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= 12) return res;
    rpcStats.rateLimited++;
    await new Promise((r) => setTimeout(r, Math.min(8000, 300 * 2 ** attempt) + Math.random() * 200));
  }
}
const transport = () => http(RPC, { fetchFn: throttledFetch, retryCount: 4, retryDelay: 500, timeout: 30_000 });
export const pub = createPublicClient({ chain: testnet, transport: transport() });

export async function assertSolonet() { // name kept so the scenario port is a drop-in
  const id = await pub.getChainId();
  if (id === 143) throw new Error('refusing Monad mainnet');
  if (id !== CHAIN_ID) throw new Error(`refusing to run: chain ${id} is not Monad testnet ${CHAIN_ID}`);
}

export const ACTORS = {
  traveler: { idx: 1, name: 'Ana (traveler)' },
  friend:   { idx: 2, name: 'Luis (friend)' },
  guide:    { idx: 3, name: 'Marisol (local guide)' },
  hostA:    { idx: 4, name: 'Casa Azul (host)' },
  hostB:    { idx: 5, name: 'Casita Jalatlaco (host)' },
  artist:   { idx: 6, name: 'Lumbre (artist)' },
  attester: { idx: 7, name: 'forged attester (NOT allowlisted)' },
  treasury: { idx: 8, name: 'treasury (unused on testnet; deployer is treasury)' },
  venueOax: { idx: 10, name: 'Foro Lumbre Oaxaca (venue)' },
  venueCdmx: { idx: 11, name: 'Foro Indie CDMX (venue)' },
  fan:      { idx: 12, name: 'Sofía (fan)' },
  scanOax:  { idx: 13, name: 'Foro Lumbre door scanner' },
  scanCdmx: { idx: 14, name: 'Foro Indie door scanner' },
  hostCdmx: { idx: 18, name: 'Casa Roma (host)' },
  uiDrip:   { idx: 19, name: 'unused' },
};
function loadKeys() {
  const j = existsSync(WALLETS) ? JSON.parse(readFileSync(WALLETS, 'utf8')) : {};
  let dirty = false;
  const need = (name) => { if (!j[name]) { j[name] = generatePrivateKey(); dirty = true; } return j[name]; };
  for (const k of Object.keys(ACTORS)) need(`actor:${k}`);
  for (let i = 0; i < 64; i++) need(`load:${i}`);
  if (dirty) writeFileSync(WALLETS, JSON.stringify(j, null, 1), { mode: 0o600 });
  return j;
}
const KEYS = loadKeys();
export function actor(key) { return privateKeyToAccount(KEYS[`actor:${key}`]); }
export function loadWallet(i) { return privateKeyToAccount(KEYS[`load:${i}`]); }
export function deployerKey() {
  const k = readFileSync(DEPLOYER_KEY_FILE, 'utf8').trim();
  return k.startsWith('0x') ? k : `0x${k}`;
}
export function deployer() { return privateKeyToAccount(deployerKey()); }
export function wallet(account) { return createWalletClient({ account, chain: testnet, transport: transport() }); }
export function abi(name) {
  return JSON.parse(readFileSync(`${ROOT}contracts/out/${name}.sol/${name}.json`, 'utf8')).abi;
}
export function deployments() {
  return JSON.parse(readFileSync(process.env.DEPLOYMENTS || `${ROOT}contracts/deployments/monad-testnet-qa.json`, 'utf8'));
}
