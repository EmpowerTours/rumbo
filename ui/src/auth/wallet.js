// The signed-in account and the one path every money action takes: simulate → estimate → sign → wait.
// Primary account: a Mera passkey wallet (auth/passkey.js, ported from EmpowerTours Hunt) — the private
// key is derived inside this tab from the passkey's PRF output and never stored. Dev builds also offer
// the public Solonet test accounts (auth/dev.js); production builds do not contain them.
import { CHAIN } from '../chain.js';
import { createWalletClient, http, BaseError, ContractFunctionRevertedError } from 'viem';
import { client, rpc } from '../data.js';
import { GAS } from '../gas.js';

export const solonet = {
  id: CHAIN.id, name: CHAIN.name, nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
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
  en: { pending: `Waiting for ${CHAIN.short}…`, signing: 'Signing with your wallet…', confirmed: 'Confirmed', failed: 'Not sent', reverted: 'Reverted on-chain', gas: 'gas', signIn: 'Sign in first' },
  es: { pending: `Esperando a ${CHAIN.short}…`, signing: 'Firmando con tu cartera…', confirmed: 'Confirmado', failed: 'No se envió', reverted: 'Revertido en cadena', gas: 'gas', signIn: 'Primero inicia sesión' },
};

/**
 * Prices a list of steps before anything is signed. Monad charges the gas LIMIT, so the cost is
 * Σ (estimate × 1.10) × maxFeePerGas — the most the wallet can be charged. Estimating works from a
 * 0-MON account. A step that depends on an earlier one (buy after approve) cannot be estimated yet;
 * it uses the measured limit from gas.js. A revert on the FIRST step is a real error and is thrown.
 *
 * Reserve balance: Monad's consensus check needs the sum of gas fees of a sender's in-flight txs to fit
 * in min(10 MON, balance as of ~3 blocks ago). Our calls carry no MON value, so the execution-time
 * "don't dip below 10 MON" rule never applies; the steps run one at a time, so balance ≥ cost is the
 * whole rule — plus waiting a few blocks after a top-up so the lagged balance sees it (topup.js).
 */
export async function quote(steps) {
  const fees = await client.estimateFeesPerGas();
  const limits = [];
  for (const [i, st] of steps.entries()) {
    let lim;
    try {
      const est = await client.estimateContractGas({ account: wallet.account, address: st.address, abi: st.abi, functionName: st.functionName, args: st.args, value: st.value });
      lim = (est * 110n) / 100n;
    } catch (e) {
      if (i === 0 && !/insufficient funds/i.test(e.message || '')) throw e;
      lim = BigInt(st.gas ?? GAS[st.functionName] ?? 500_000);
    }
    limits.push(lim);
  }
  const gas = limits.reduce((a, b) => a + b, 0n);
  return { limits, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, need: gas * fees.maxFeePerGas };
}

/**
 * Sends one contract call from the signed-in account. Solonet charges the gas LIMIT, so the limit is
 * the estimate + 10% (same rule as the demo scripts), and the fee caps are passed explicitly so the
 * worst case is exactly what quote() showed. Simulating first turns reverts into readable errors
 * before anything is signed.
 */
export async function send({ address, abi, functionName, args = [], value, label, lang = 'en', fees }) {
  const T = COPY[lang] || COPY.en;
  if (!wallet.account) { toast({ state: 'error', title: label, body: T.signIn }); throw new Error('not signed in'); }
  const upd = toast({ state: 'pending', title: label, body: T.signing });
  try {
    const call = { account: wallet.account, address, abi, functionName, args, value, chain: solonet };
    const { result } = await client.simulateContract(call);
    const est = await client.estimateContractGas(call);
    const f = fees || await client.estimateFeesPerGas();
    const w = createWalletClient({ account: wallet.account, chain: solonet, transport: http(rpc) });
    const gas = (est * 110n) / 100n;
    const hash = await w.writeContract({ ...call, gas, maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas });
    upd({ body: T.pending, hash });
    const rc = await client.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') { upd({ state: 'error', body: T.reverted, hash }); throw new Error('reverted'); }
    // Monad serves receipts before 'latest' state catches up: wait until reads include this block,
    // so the balances / lists re-read right after a confirmation are not stale.
    for (let i = 0; i < 40 && (await client.getBlockNumber()) < rc.blockNumber + 1n; i++) await new Promise((r) => setTimeout(r, 250));
    const paid = Number(rc.gasUsed * rc.effectiveGasPrice) / 1e18;
    upd({ state: 'confirmed', body: `${T.confirmed} · ${T.gas} ${Number(rc.gasUsed).toLocaleString()} · ${paid.toFixed(4)} MON · #${rc.blockNumber}`, hash });
    return { result, receipt: rc, hash, gasLimit: gas };
  } catch (err) {
    const name = revertName(err);
    if (name !== 'reverted') upd({ state: 'error', body: `${T.failed}: ${name}` });
    err.revertName = name;
    throw err;
  }
}
