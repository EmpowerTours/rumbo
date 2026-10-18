// Every button that moves money or changes state. Each one is a real transaction signed by the
// signed-in wallet (Mera passkey, or a DEV test account) against local Solonet, and paid for with the
// wallet's own MON — there is no gas sponsorship. Browsing never needs MON; only these do.
import { parseUnits, zeroAddress } from 'viem';
import ABIS from '../abis.json';
import { wallet, send, toast, quote, revertName } from './auth/wallet.js';
import { topUp } from './topup.js';
import { mon } from './gas.js';
import { client } from './data.js';
import { state } from './fmt.js';
import { ACTIONS4 } from './actions4.js';

const U = (x) => parseUnits(String(x), 6);
const dev = () => (import.meta.env.DEV ? import('./auth/dev.js') : Promise.resolve(null));
const at = async () => BigInt((await client.getBlock()).timestamp);

const LBL = {
  en: { approve: (a) => `Approve ${a} USDC`, approveT: 'Approve $TOURS', contribute: (a) => `Contribute ${a} USDC to the trip`, faucet: 'Get 1,000 test USDC',
    checkin: (n) => `Check in at ${n}`, redeem: (n) => `Redeem “${n}”`, buy: (n) => `Buy a ticket · ${n}`, buyResale: (id) => `Buy resale ticket #${id}`,
    list: (id, p) => `List ticket #${id} at ${p} USDC`, cancelList: (id) => `Take ticket #${id} off resale`, book: (n) => `Book ${n} from the trip vault`,
    confirmStay: (id) => `Confirm arrival · booking #${id}`, backing: 'Claim backing $TOURS', hostAccept: (id) => `Accept booking #${id}`, hostCancel: (id) => `Cancel booking #${id} (full refund)`,
    hostScanner: 'Use this wallet as check-in scanner', hostScan: (id) => `Scan guest in · booking #${id}`, venueScanner: 'Use this wallet as door scanner',
    venueAccept: (id) => `Accept show request #${id}`, venueDecline: (id) => `Decline show request #${id} (full refund)`, venueCancel: (id) => `Cancel show #${id}`,
    scanTicket: (id) => `Door scan · ticket #${id}`, openDates: 'Open the next 7 days', gas: 'DEV drip: 5 test MON (opt-in)' },
  es: { approve: (a) => `Aprobar ${a} USDC`, approveT: 'Aprobar $TOURS', contribute: (a) => `Aportar ${a} USDC al viaje`, faucet: 'Obtener 1,000 USDC de prueba',
    checkin: (n) => `Check-in en ${n}`, redeem: (n) => `Canjear «${n}»`, buy: (n) => `Comprar boleto · ${n}`, buyResale: (id) => `Comprar boleto de reventa #${id}`,
    list: (id, p) => `Revender boleto #${id} a ${p} USDC`, cancelList: (id) => `Retirar boleto #${id} de reventa`, book: (n) => `Reservar ${n} desde la bóveda`,
    confirmStay: (id) => `Confirmar llegada · reserva #${id}`, backing: 'Reclamar $TOURS de respaldo', hostAccept: (id) => `Aceptar reserva #${id}`, hostCancel: (id) => `Cancelar reserva #${id} (reembolso total)`,
    hostScanner: 'Usar esta cartera como escáner de check-in', hostScan: (id) => `Escanear huésped · reserva #${id}`, venueScanner: 'Usar esta cartera como escáner de puerta',
    venueAccept: (id) => `Aceptar solicitud de show #${id}`, venueDecline: (id) => `Rechazar solicitud #${id} (reembolso total)`, venueCancel: (id) => `Cancelar show #${id}`,
    scanTicket: (id) => `Escaneo en puerta · boleto #${id}`, openDates: 'Abrir los próximos 7 días', gas: 'Goteo DEV: 5 MON de prueba (opcional)' },
};

// A step is one contract call: { ...contract, functionName, args, label }.
const step = (c, functionName, args, label) => ({ ...c, functionName, args, label });

/** DEV ONLY, opt-in: ?drip=1 (or the toggle in the DEV sign-in box) tops a new wallet up from a test account. Off by default. */
export const dripEnabled = () => import.meta.env.DEV && (new URLSearchParams(location.search).get('drip') === '1' || localStorage.getItem('tours.drip') === '1');
async function devDrip() {
  const d = await dev();
  if (!d || !dripEnabled()) return;
  const L = LBL[state.lang];
  if ((await client.getBalance({ address: wallet.address })) >= 10n ** 18n) return;
  const upd = toast({ state: 'pending', title: L.gas, body: 'DEV ONLY · ?drip=1' });
  try { await d.dripGas(wallet.address); upd({ state: 'confirmed', body: 'DEV ONLY · +5 MON' }); } catch (e) { upd({ state: 'error', body: e.shortMessage || e.message }); throw e; }
}
async function approveUsdc(s, spender, amount) {
  const have = await client.readContract({ ...s.C.usdc, functionName: 'allowance', args: [wallet.address, spender] });
  return have < amount ? [step(s.C.usdc, 'approve', [spender, amount], LBL[state.lang].approve(Number(amount) / 1e6))] : [];
}

// Each action returns a plan: the steps it will send (approvals included only when needed), plus the
// USDC it spends so a USDC shortfall is reported plainly instead of as a gas problem. Signatures that a
// step needs (scanner attestations, GPS-attested visits) are made here, before anything is priced.
export const ACTIONS = {
  async faucet(d, s) { return { steps: [step(s.C.usdc, 'faucet', [wallet.address, U(1000)], LBL[state.lang].faucet)] }; },
  async contribute(d, s) {
    const amt = U(d.amt || 25);
    return { usdc: amt, steps: [...await approveUsdc(s, s.trip.address, amt),
      step({ address: s.trip.address, abi: ABIS.TripVault }, 'deposit', [amt, wallet.address], LBL[state.lang].contribute(d.amt || 25))] };
  },
  async checkin(d, s) {
    const devmod = await dev();
    if (!devmod) throw new Error('Check-ins are signed by the Hunt GPS service, which is not part of this local build.');
    const c = s.camps.find((x) => x.id === Number(d.id));
    const visitedAt = (await at()) - 5n;
    const vault = s.trip.mine ? s.trip.address : zeroAddress;
    const { batch, sig } = await devmod.attestVisits(s.dep.rewards, wallet.address, vault, [BigInt(c.id)], [visitedAt]);
    return { steps: [step(s.C.rw, 'claimBatch', [batch, sig], LBL[state.lang].checkin(c.name))] };
  },
  async redeem(d, s) {
    const k = s.perks[Number(d.id)].p;
    const have = await client.readContract({ ...s.C.tours, functionName: 'allowance', args: [wallet.address, s.dep.perks] });
    return { steps: [...(have < k.price ? [step(s.C.tours, 'approve', [s.dep.perks, k.price], LBL[state.lang].approveT)] : []),
      step(s.C.pk, 'redeem', [BigInt(d.id)], LBL[state.lang].redeem(k.title))] };
  },
  async buyTicket(d, s) {
    const sh = s.shows[Number(d.id)];
    return { usdc: sh.ticketPrice, steps: [...await approveUsdc(s, s.dep.tickets, sh.ticketPrice),
      step(s.C.tk, 'buy', [BigInt(sh.id), 1, sh.ticketPrice], LBL[state.lang].buy(sh.title))] };
  },
  async buyResale(d, s) {
    const ask = await client.readContract({ ...s.C.tk, functionName: 'askPrice', args: [BigInt(d.id)] });
    return { usdc: ask, steps: [...await approveUsdc(s, s.dep.tickets, ask), step(s.C.tk, 'buyResale', [BigInt(d.id), ask], LBL[state.lang].buyResale(d.id))] };
  },
  async listResale(d, s) {
    const price = BigInt(d.price);
    return { steps: [step(s.C.tk, 'listForResale', [BigInt(d.id), price], LBL[state.lang].list(d.id, (Number(price) / 1e6).toFixed(2)))] };
  },
  async cancelResale(d, s) { return { steps: [step(s.C.tk, 'cancelResale', [BigInt(d.id)], LBL[state.lang].cancelList(d.id))] }; },
  async book(d, s) {
    const l = s.listings[Number(d.id)];
    const startAt = [(await at()) + 600n, s.trip.start].reduce((a, b) => (a > b ? a : b)); // headroom in case a top-up comes first
    return { steps: [step({ address: s.trip.address, abi: ABIS.TripVault }, 'book', [BigInt(l.id), 1, startAt], LBL[state.lang].book(l.title))] };
  },
  async confirmStay(d, s) { return { steps: [step({ address: s.trip.address, abi: ABIS.TripVault }, 'confirmCheckIn', [BigInt(d.id)], LBL[state.lang].confirmStay(d.id))] }; },
  async claimBacking(d, s) { return { steps: [step(s.C.rw, 'claimBacking', [s.demo.artistVault], LBL[state.lang].backing)] }; },
  async hostAccept(d, s) { return { steps: [step(s.C.bk, 'acceptBooking', [BigInt(d.id)], LBL[state.lang].hostAccept(d.id))] }; },
  async hostCancel(d, s) { return { steps: [step(s.C.bk, 'hostCancel', [BigInt(d.id)], LBL[state.lang].hostCancel(d.id))] }; },
  async hostScanner(d, s) { return { steps: [step(s.C.bk, 'setScanner', [wallet.address, true], LBL[state.lang].hostScanner)] }; },
  async hostScan(d, s) {
    // The scanner (this wallet, registered by the host) signs the guest's arrival; anyone may submit it.
    const b = s.bookings[Number(d.id)];
    const t = await at();
    const sig = await wallet.account.signTypedData({
      domain: { name: 'EmpowerTours Bookings', version: '1', chainId: 20143, verifyingContract: s.dep.bookings }, primaryType: 'CheckIn',
      types: { CheckIn: [{ name: 'bookingId', type: 'uint256' }, { name: 'payer', type: 'address' }, { name: 'at', type: 'uint64' }] },
      message: { bookingId: BigInt(b.id), payer: b.payer, at: t } });
    return { steps: [step(s.C.bk, 'confirmWithAttestation', [BigInt(b.id), t, sig], LBL[state.lang].hostScan(d.id))] };
  },
  async venueScanner(d, s) { return { steps: [step(s.C.vn, 'setScanner', [BigInt(d.id), wallet.address, true], LBL[state.lang].venueScanner)] }; },
  async venueAccept(d, s) { return { steps: [step(s.C.vn, 'acceptShow', [BigInt(d.id)], LBL[state.lang].venueAccept(d.id))] }; },
  async venueDecline(d, s) { return { steps: [step(s.C.vn, 'declineShow', [BigInt(d.id)], LBL[state.lang].venueDecline(d.id))] }; },
  async venueCancel(d, s) { return { steps: [step(s.C.vn, 'venueCancel', [BigInt(d.id)], LBL[state.lang].venueCancel(d.id))] }; },
  async scanTicket(d, s) {
    const tkt = s.shows.flatMap((x) => x.tickets).find((x) => String(x.id) === String(d.id));
    const t = await at();
    const sig = await wallet.account.signTypedData({
      domain: { name: 'EmpowerTours Tickets', version: '1', chainId: 20143, verifyingContract: s.dep.tickets }, primaryType: 'TicketScan',
      types: { TicketScan: [{ name: 'ticketId', type: 'uint256' }, { name: 'holder', type: 'address' }, { name: 'at', type: 'uint64' }] },
      message: { ticketId: tkt.id, holder: tkt.holder, at: t } });
    return { steps: [step(s.C.tk, 'scan', [tkt.id, t, sig], LBL[state.lang].scanTicket(d.id))] };
  },
  async openDates(d, s) {
    return { steps: [step(s.C.vn, 'setOpenDates', [BigInt(d.id), [...Array(7).keys()].map((i) => s.today + i), true], LBL[state.lang].openDates)] };
  },
  ...ACTIONS4,
};

// Contract reverts → plain words (EN/ES). Anything not listed is shown by name.
const FRIENDLY = {
  en: { NotOpen: 'the venue is not open that day', AlreadyBooked: 'that day is already taken', BadShowTime: 'the show time must be in the future',
    TooManyTickets: 'more tickets than the venue holds', AlreadyOnSale: 'tickets are already on sale', Removed: 'this listing was deleted', BadConfig: 'some values are out of range',
    TooLate: 'too late for that now', TooEarly: 'too early — wait until show time', AwaitingApproval: 'the venue has not accepted yet', NotArtist: 'only the artist can do this',
    BadAttestation: 'this wallet is not a door scanner for the venue', NotBooked: 'the show is no longer booked', PriceAboveMax: 'the price changed — reload and try again', BadStart: 'pick another date' },
  es: { NotOpen: 'el foro no abre ese día', AlreadyBooked: 'ese día ya está ocupado', BadShowTime: 'la hora del show debe ser futura',
    TooManyTickets: 'más boletos que el aforo del foro', AlreadyOnSale: 'los boletos ya están a la venta', Removed: 'esta publicación fue eliminada', BadConfig: 'algún valor está fuera de rango',
    TooLate: 'ya es demasiado tarde para eso', TooEarly: 'muy pronto — espera a la hora del show', AwaitingApproval: 'el foro aún no acepta', NotArtist: 'solo el artista puede hacerlo',
    BadAttestation: 'esta cartera no es escáner de puerta del foro', NotBooked: 'el show ya no está reservado', PriceAboveMax: 'cambió el precio — recarga e intenta de nuevo', BadStart: 'elige otra fecha' },
};
export const friendly = (n) => (FRIENDLY[state.lang] || FRIENDLY.en)[n] || n;

const MSG = {
  en: { usdc: (n, h) => `This needs ${n} USDC and the wallet holds ${h} USDC. Add USDC first — no MON was spent.`, notSent: 'Not sent' },
  es: { usdc: (n, h) => `Esto requiere ${n} USDC y la cartera tiene ${h} USDC. Agrega USDC primero — no se gastó MON.`, notSent: 'No se envió' },
};

/**
 * Runs an action: plan → USDC check → price the gas (limit × maxFee) → compare with the balance →
 * top-up sheet if short (auto-continues once funded) → send each step. Nothing is signed or sent while
 * the balance is short. Errors are toasted. Returns { sent, quote } so callers / tests can see what ran.
 */
export async function runAction(name, dataset, s) {
  if (!wallet.account) throw new Error('not signed in');
  const M = MSG[state.lang] || MSG.en;
  const plan = await ACTIONS[name](dataset, s);
  const what = plan.steps[plan.steps.length - 1].label;
  if (plan.usdc) {
    const have = await client.readContract({ ...s.C.usdc, functionName: 'balanceOf', args: [wallet.address] });
    if (have < plan.usdc) {
      toast({ state: 'error', title: what, body: M.usdc((Number(plan.usdc) / 1e6).toFixed(2), (Number(have) / 1e6).toFixed(2)) });
      const e = new Error('InsufficientUSDC'); e.revertName = 'InsufficientUSDC'; throw e;
    }
  }
  await devDrip();
  let q;
  try { q = await quote(plan.steps); } catch (e) {
    const n = revertName(e); toast({ state: 'error', title: what, body: `${M.notSent}: ${friendly(n)}` }); e.revertName = n; throw e;
  }
  const bal = await client.getBalance({ address: wallet.address });
  window.__lastQuote = { action: name, gas: q.gas.toString(), limits: q.limits.map(String), maxFeePerGas: q.maxFeePerGas.toString(), need: q.need.toString(), balance: bal.toString(), mon: mon(q.need) };
  if (bal < q.need) {
    const ok = await topUp({ address: wallet.address, need: q.need, balance: bal, what, lang: state.lang,
      onClose: (msg) => toast({ state: 'error', title: what, body: msg }) });
    if (!ok) { const e = new Error('TopUpCancelled'); e.revertName = 'TopUpCancelled'; throw e; }
    window.__lastQuote.toppedUp = true;
  }
  const fees = { maxFeePerGas: q.maxFeePerGas, maxPriorityFeePerGas: q.maxPriorityFeePerGas };
  const sent = [];
  for (const st of plan.steps) sent.push(await send({ ...st, ...(st.fix ? { args: st.fix(sent) } : {}), lang: state.lang, fees }));
  window.__lastQuote.gasUsed = sent.map((x) => x.receipt.gasUsed.toString());
  window.__lastQuote.paidWei = sent.reduce((a, x) => a + x.receipt.gasUsed * x.receipt.effectiveGasPrice, 0n).toString();
  plan.after?.(sent);
  return { sent, quote: q };
}
