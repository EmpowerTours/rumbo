// The signed-in account and the one path every money action takes: simulate → estimate → sign → wait.
// Primary account: a Mera passkey wallet (auth/passkey.js, ported from EmpowerTours Hunt) — the private
// key is derived inside this tab from the passkey's PRF output and never stored. Dev builds also offer
// the public Solonet test accounts (auth/dev.js); production builds do not contain them.
import { createWalletClient, http, BaseError, ContractFunctionRevertedError } from 'viem';
import { client, rpc } from '../data.js';

export const solonet = {
  id: 20143, name: 'Monad Solonet (local)', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};

/** kind: 'passkey' (Mera) | 'dev' (Solonet test account, dev builds only) | null */
export const wallet = { kind: null, account: null, address: null, label: '', session: null, noteKey: null };
const listeners = new Set();
export const onWalletChange = (fn) => listeners.add(fn);
export function setWallet(next) {
  if (wallet.session && wallet.session !== next.session) { try { wallet.session.end(); } catch { /* already ended */ } }
  Object.assign(wallet, { kind: null, account: null, address: null, label: '', session: null, noteKey: null }, next);
  listeners.forEach((fn) => fn());
}
export const signOut = () => setWallet({});

// ---------------------------------------------------------------- toasts (pending / confirmed / error)
const toasts = [];
let toastSeq = 0;
function drawToasts() {
  let el = document.getElementById('toasts');
  if (!el) { el = document.createElement('div'); el.id = 'toasts'; document.body.appendChild(el); }
  el.innerHTML = toasts.slice(-4).map((t) => `<div class="toast ${t.state}" data-toast="${t.id}">
    <b>${t.state === 'pending' ? '⏳' : t.state === 'confirmed' ? '✓' : '⚠'} ${t.title}</b>
    <div>${t.body || ''}</div>${t.hash ? `<div class="hash">${t.hash.slice(0, 22)}…</div>` : ''}</div>`).join('');
}
export function toast(t) {
  const id = ++toastSeq;
  toasts.push({ id, ...t });
  drawToasts();
  return (patch) => { Object.assign(toasts.find((x) => x.id === id), patch); drawToasts(); };
}
export const clearToasts = () => { toasts.length = 0; drawToasts(); };

/** Decodes a revert into the contract's custom error name (e.g. "PriceAboveCap"). */
export function revertName(err) {
  if (err instanceof BaseError) {
    const rev = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (rev?.data?.errorName) return rev.data.errorName;
    return err.shortMessage || err.message;
  }
  return err?.message || String(err);
}

const COPY = {
  en: { pending: 'Waiting for Solonet…', signing: 'Signing with your wallet…', confirmed: 'Confirmed', failed: 'Not sent', reverted: 'Reverted on-chain', gas: 'gas', signIn: 'Sign in first' },
  es: { pending: 'Esperando a Solonet…', signing: 'Firmando con tu cartera…', confirmed: 'Confirmado', failed: 'No se envió', reverted: 'Revertido en cadena', gas: 'gas', signIn: 'Primero inicia sesión' },
};

/**
 * Sends one contract call from the signed-in account. Solonet charges the gas LIMIT, so the limit is
 * the estimate + 10% (same rule as the demo scripts). Simulating first turns reverts into readable
 * errors before anything is signed.
 */
export async function send({ address, abi, functionName, args = [], value, label, lang = 'en' }) {
  const T = COPY[lang] || COPY.en;
  if (!wallet.account) { toast({ state: 'error', title: label, body: T.signIn }); throw new Error('not signed in'); }
  const upd = toast({ state: 'pending', title: label, body: T.signing });
  try {
    const call = { account: wallet.account, address, abi, functionName, args, value, chain: solonet };
    const { result } = await client.simulateContract(call);
    const est = await client.estimateContractGas(call);
    const w = createWalletClient({ account: wallet.account, chain: solonet, transport: http(rpc) });
    const hash = await w.writeContract({ ...call, gas: (est * 110n) / 100n });
    upd({ body: T.pending, hash });
    const rc = await client.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') { upd({ state: 'error', body: T.reverted, hash }); throw new Error('reverted'); }
    // Monad serves receipts before 'latest' state catches up: wait until reads include this block,
    // so the balances / lists re-read right after a confirmation are not stale.
    for (let i = 0; i < 40 && (await client.getBlockNumber()) < rc.blockNumber + 1n; i++) await new Promise((r) => setTimeout(r, 250));
    upd({ state: 'confirmed', body: `${T.confirmed} · ${T.gas} ${Number(rc.gasUsed).toLocaleString()} · #${rc.blockNumber}`, hash });
    return { result, receipt: rc, hash };
  } catch (err) {
    const name = revertName(err);
    if (name !== 'reverted') upd({ state: 'error', body: `${T.failed}: ${name}` });
    err.revertName = name;
    throw err;
  }
}
