// Every button that moves money or changes state. Each one is a real transaction signed by the
// signed-in wallet (Mera passkey, or a DEV test account) against local Solonet.
import { parseUnits, zeroAddress } from 'viem';
import ABIS from '../abis.json';
import { wallet, send, toast } from './auth/wallet.js';
import { client } from './data.js';
import { state } from './fmt.js';

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
    scanTicket: (id) => `Door scan · ticket #${id}`, openDates: 'Open the next 7 days', gas: 'Devnet gas for a new wallet (5 MON)' },
  es: { approve: (a) => `Aprobar ${a} USDC`, approveT: 'Aprobar $TOURS', contribute: (a) => `Aportar ${a} USDC al viaje`, faucet: 'Obtener 1,000 USDC de prueba',
    checkin: (n) => `Check-in en ${n}`, redeem: (n) => `Canjear «${n}»`, buy: (n) => `Comprar boleto · ${n}`, buyResale: (id) => `Comprar boleto de reventa #${id}`,
    list: (id, p) => `Revender boleto #${id} a ${p} USDC`, cancelList: (id) => `Retirar boleto #${id} de reventa`, book: (n) => `Reservar ${n} desde la bóveda`,
    confirmStay: (id) => `Confirmar llegada · reserva #${id}`, backing: 'Reclamar $TOURS de respaldo', hostAccept: (id) => `Aceptar reserva #${id}`, hostCancel: (id) => `Cancelar reserva #${id} (reembolso total)`,
    hostScanner: 'Usar esta cartera como escáner de check-in', hostScan: (id) => `Escanear huésped · reserva #${id}`, venueScanner: 'Usar esta cartera como escáner de puerta',
    venueAccept: (id) => `Aceptar solicitud de show #${id}`, venueDecline: (id) => `Rechazar solicitud #${id} (reembolso total)`, venueCancel: (id) => `Cancelar show #${id}`,
    scanTicket: (id) => `Escaneo en puerta · boleto #${id}`, openDates: 'Abrir los próximos 7 días', gas: 'Gas de devnet para cartera nueva (5 MON)' },
};

async function tx(c, functionName, args, label) {
  return send({ ...c, functionName, args, label, lang: state.lang });
}
async function ensureGas() {
  const d = await dev();
  if (!d) return;
  const L = LBL[state.lang];
  if ((await client.getBalance({ address: wallet.address })) >= 10n ** 18n) return;
  const upd = toast({ state: 'pending', title: L.gas, body: 'DEV ONLY' });
  try { await d.dripGas(wallet.address); upd({ state: 'confirmed', body: 'DEV ONLY · +5 MON' }); } catch (e) { upd({ state: 'error', body: e.shortMessage || e.message }); throw e; }
}
async function approveUsdc(s, spender, amount) {
  const have = await client.readContract({ ...s.C.usdc, functionName: 'allowance', args: [wallet.address, spender] });
  if (have < amount) await tx(s.C.usdc, 'approve', [spender, amount], LBL[state.lang].approve(Number(amount) / 1e6));
}

export const ACTIONS = {
  async faucet(d, s) { await tx(s.C.usdc, 'faucet', [wallet.address, U(1000)], LBL[state.lang].faucet); },
  async contribute(d, s) {
    const amt = U(d.amt || 25);
    await approveUsdc(s, s.trip.address, amt);
    await tx({ address: s.trip.address, abi: ABIS.TripVault }, 'deposit', [amt, wallet.address], LBL[state.lang].contribute(d.amt || 25));
  },
  async checkin(d, s) {
    const devmod = await dev();
    if (!devmod) throw new Error('Check-ins are signed by the Hunt GPS service, which is not part of this local build.');
    const c = s.camps.find((x) => x.id === Number(d.id));
    const visitedAt = (await at()) - 5n;
    const vault = s.trip.mine ? s.trip.address : zeroAddress;
    const { batch, sig } = await devmod.attestVisits(s.dep.rewards, wallet.address, vault, [BigInt(c.id)], [visitedAt]);
    await tx(s.C.rw, 'claimBatch', [batch, sig], LBL[state.lang].checkin(c.name));
  },
  async redeem(d, s) {
    const k = s.perks[Number(d.id)].p;
    const have = await client.readContract({ ...s.C.tours, functionName: 'allowance', args: [wallet.address, s.dep.perks] });
    if (have < k.price) await tx(s.C.tours, 'approve', [s.dep.perks, k.price], LBL[state.lang].approveT);
    await tx(s.C.pk, 'redeem', [BigInt(d.id)], LBL[state.lang].redeem(k.title));
  },
  async buyTicket(d, s) {
    const sh = s.shows[Number(d.id)];
    await approveUsdc(s, s.dep.tickets, sh.ticketPrice);
    return tx(s.C.tk, 'buy', [BigInt(sh.id), 1, sh.ticketPrice], LBL[state.lang].buy(sh.title));
  },
  async buyResale(d, s) {
    const ask = await client.readContract({ ...s.C.tk, functionName: 'askPrice', args: [BigInt(d.id)] });
    await approveUsdc(s, s.dep.tickets, ask);
    await tx(s.C.tk, 'buyResale', [BigInt(d.id), ask], LBL[state.lang].buyResale(d.id));
  },
  async listResale(d, s) {
    const price = BigInt(d.price);
    await tx(s.C.tk, 'listForResale', [BigInt(d.id), price], LBL[state.lang].list(d.id, (Number(price) / 1e6).toFixed(2)));
  },
  async cancelResale(d, s) { await tx(s.C.tk, 'cancelResale', [BigInt(d.id)], LBL[state.lang].cancelList(d.id)); },
  async book(d, s) {
    const l = s.listings[Number(d.id)];
    const startAt = [(await at()) + 120n, s.trip.start].reduce((a, b) => (a > b ? a : b));
    await tx({ address: s.trip.address, abi: ABIS.TripVault }, 'book', [BigInt(l.id), 1, startAt], LBL[state.lang].book(l.title));
  },
  async confirmStay(d, s) { await tx({ address: s.trip.address, abi: ABIS.TripVault }, 'confirmCheckIn', [BigInt(d.id)], LBL[state.lang].confirmStay(d.id)); },
  async claimBacking(d, s) { await tx(s.C.rw, 'claimBacking', [s.demo.artistVault], LBL[state.lang].backing); },
  async hostAccept(d, s) { await tx(s.C.bk, 'acceptBooking', [BigInt(d.id)], LBL[state.lang].hostAccept(d.id)); },
  async hostCancel(d, s) { await tx(s.C.bk, 'hostCancel', [BigInt(d.id)], LBL[state.lang].hostCancel(d.id)); },
  async hostScanner(d, s) { await tx(s.C.bk, 'setScanner', [wallet.address, true], LBL[state.lang].hostScanner); },
  async hostScan(d, s) {
    // The scanner (this wallet, registered by the host) signs the guest's arrival; anyone may submit it.
    const b = s.bookings[Number(d.id)];
    const t = await at();
    const sig = await wallet.account.signTypedData({
      domain: { name: 'EmpowerTours Bookings', version: '1', chainId: 20143, verifyingContract: s.dep.bookings }, primaryType: 'CheckIn',
      types: { CheckIn: [{ name: 'bookingId', type: 'uint256' }, { name: 'payer', type: 'address' }, { name: 'at', type: 'uint64' }] },
      message: { bookingId: BigInt(b.id), payer: b.payer, at: t } });
    await tx(s.C.bk, 'confirmWithAttestation', [BigInt(b.id), t, sig], LBL[state.lang].hostScan(d.id));
  },
  async venueScanner(d, s) { await tx(s.C.vn, 'setScanner', [BigInt(d.id), wallet.address, true], LBL[state.lang].venueScanner); },
  async venueAccept(d, s) { await tx(s.C.vn, 'acceptShow', [BigInt(d.id)], LBL[state.lang].venueAccept(d.id)); },
  async venueDecline(d, s) { await tx(s.C.vn, 'declineShow', [BigInt(d.id)], LBL[state.lang].venueDecline(d.id)); },
  async venueCancel(d, s) { await tx(s.C.vn, 'venueCancel', [BigInt(d.id)], LBL[state.lang].venueCancel(d.id)); },
  async scanTicket(d, s) {
    const tkt = s.shows.flatMap((x) => x.tickets).find((x) => String(x.id) === String(d.id));
    const t = await at();
    const sig = await wallet.account.signTypedData({
      domain: { name: 'EmpowerTours Tickets', version: '1', chainId: 20143, verifyingContract: s.dep.tickets }, primaryType: 'TicketScan',
      types: { TicketScan: [{ name: 'ticketId', type: 'uint256' }, { name: 'holder', type: 'address' }, { name: 'at', type: 'uint64' }] },
      message: { ticketId: tkt.id, holder: tkt.holder, at: t } });
    await tx(s.C.tk, 'scan', [tkt.id, t, sig], LBL[state.lang].scanTicket(d.id));
  },
  async openDates(d, s) {
    await tx(s.C.vn, 'setOpenDates', [BigInt(d.id), [...Array(7).keys()].map((i) => s.today + i), true], LBL[state.lang].openDates);
  },
};

/** Runs an action: devnet gas first (dev builds), then the transaction(s); errors are already toasted. */
export async function runAction(name, dataset, s) {
  if (!wallet.account) throw new Error('not signed in');
  await ensureGas();
  return ACTIONS[name](dataset, s);
}
