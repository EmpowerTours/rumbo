// Shared helpers for the LOCAL Solonet demo. Never points at mainnet: chain id is asserted.
import { readFileSync, existsSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export const RPC = process.env.RPC_URL || 'http://localhost:8080';
export const CHAIN_ID = 20143;
export const PK_FILE = process.env.PK_FILE || '/workspace/solonet-test/.pk';
export const ROOT = new URL('..', import.meta.url).pathname;

export const solonet = defineChain({
  id: CHAIN_ID,
  name: 'Monad Solonet (local)',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

export const pub = createPublicClient({ chain: solonet, transport: http(RPC) });

export async function assertSolonet() {
  const id = await pub.getChainId();
  if (id !== CHAIN_ID) throw new Error(`refusing to run: chain ${id} is not Solonet ${CHAIN_ID}`);
}

// Public, well-known devnet mnemonic (Foundry/anvil "test ... junk"); Solonet prefunds these.
const MNEMONIC = 'test test test test test test test test test test test junk';
export const ACTORS = {
  traveler: { idx: 1, name: 'Ana (traveler)' },
  friend:   { idx: 2, name: 'Luis (friend)' },
  guide:    { idx: 3, name: 'Marisol (local guide)' },
  hostA:    { idx: 4, name: 'Casa Azul (host)' },
  hostB:    { idx: 5, name: 'Casita Jalatlaco (host)' },
  artist:   { idx: 6, name: 'Lumbre (artist)' },
  attester: { idx: 7, name: 'Hunt attester' },
  treasury: { idx: 8, name: 'EmpowerTours treasury' },
};
export function actor(key) {
  return mnemonicToAccount(MNEMONIC, { addressIndex: ACTORS[key].idx });
}
export function deployerKey() {
  if (!existsSync(PK_FILE)) throw new Error(`missing devnet key ${PK_FILE}`);
  const k = readFileSync(PK_FILE, 'utf8').trim();
  return k.startsWith('0x') ? k : `0x${k}`;
}
export function deployer() { return privateKeyToAccount(deployerKey()); }

export function wallet(account) {
  return createWalletClient({ account, chain: solonet, transport: http(RPC) });
}

export function abi(name) {
  const j = JSON.parse(readFileSync(`${ROOT}contracts/out/${name}.sol/${name}.json`, 'utf8'));
  return j.abi;
}

export function deployments() {
  return JSON.parse(readFileSync(`${ROOT}contracts/deployments/solonet.json`, 'utf8'));
}
