// Round 4 actions: partner creation flows. Same rules as actions.js — every step is a real transaction
// from the signed-in wallet, priced first, top-up sheet if short, no sponsorship. Forms are validated
// (and photos + metadata written to the LOCAL content store) before anything is priced or signed.
import { parseUnits } from 'viem';
import { wallet } from './auth/wallet.js';
import { client } from './data.js';
import { state } from './fmt.js';
import { put, putJson } from './content.js';
import { GAS } from './gas.js';
import { forms, POLICY, PERKS, validateListing, validateVenue, validateArtist, validateRequest, validateSales, invalid, fromLocalInput, cityShort, dayIso } from './forms.js';

const U = (x) => parseUnits(String(x), 6);
const step = (c, functionName, args, label, extra = {}) => ({ ...c, functionName, args, label, ...extra });
const now = async () => BigInt((await client.getBlock()).timestamp);

export const LBL4 = {
  en: { approve: (a) => `Approve ${a} USDC`, hostProfile: 'Save host profile', createListing: (t) => `Publish “${t}”`, editListing: (t) => `Save “${t}”`,
    pause: (id) => `Pause listing #${id}`, resume: (id) => `Resume listing #${id}`, remove: (id) => `Delete listing #${id}`,
    createVenue: (n) => `Publish venue “${n}”`, openDates: (n) => `Open ${n} dates`, scanner: 'Use this wallet as door scanner', artist: 'Save artist profile',
    request: (n) => `Request a date at ${n} (deposit into escrow)`, openSales: (id) => `Start ticket sales · show #${id}`, settle: (id) => `Settle show #${id}`,
    cancel: (id) => `Withdraw request #${id}`, confirm: (id) => `Confirm show #${id} played`, noShow: (id) => `No-show claim · show #${id}`, book: (t) => `Book “${t}”` },
  es: { approve: (a) => `Aprobar ${a} USDC`, hostProfile: 'Guardar perfil de anfitrión', createListing: (t) => `Publicar «${t}»`, editListing: (t) => `Guardar «${t}»`,
    pause: (id) => `Pausar publicación #${id}`, resume: (id) => `Reactivar publicación #${id}`, remove: (id) => `Eliminar publicación #${id}`,
    createVenue: (n) => `Publicar foro «${n}»`, openDates: (n) => `Abrir ${n} fechas`, scanner: 'Usar esta cartera como escáner de puerta', artist: 'Guardar perfil de artista',
    request: (n) => `Solicitar fecha en ${n} (depósito en garantía)`, openSales: (id) => `Abrir venta de boletos · show #${id}`, settle: (id) => `Liquidar show #${id}`,
    cancel: (id) => `Retirar solicitud #${id}`, confirm: (id) => `Confirmar que el show #${id} ocurrió`, noShow: (id) => `Reclamo por no presentarse · show #${id}`, book: (t) => `Reservar «${t}»` },
};
const L = () => LBL4[state.lang];

async function approve(s, spender, amount) {
  if (amount === 0n) return [];
  const have = await client.readContract({ ...s.C.usdc, functionName: 'allowance', args: [wallet.address, spender] });
  return have < amount ? [step(s.C.usdc, 'approve', [spender, amount], L().approve(Number(amount) / 1e6))] : [];
}
/** Upload new photo files (once) and return their content URIs. */
async function photoUris(f) {
  for (const p of f.photos) if (!p.uri) {
    try { p.uri = await put(p.file, p.file.type); } catch (e) { if (e.message === 'photoTooBig' || e.message === 'photoType') invalid(f, { photos: [e.message] }, state.lang === 'es' ? 'Fotos' : 'Photos'); throw e; }
  }
  return f.photos.map((p) => p.uri);
}
const goTo = (hash) => () => { location.hash = hash; };

async function signShow(s, showId, outcome) {
  const at = await now();
  const sig = await wallet.account.signTypedData({
    domain: { name: 'EmpowerTours Venues', version: '1', chainId: 20143, verifyingContract: s.dep.venues }, primaryType: 'ShowAttestation',
    types: { ShowAttestation: [{ name: 'showId', type: 'uint256' }, { name: 'outcome', type: 'uint8' }, { name: 'at', type: 'uint64' }] },
    message: { showId: BigInt(showId), outcome, at } });
  return { at, sig };
}

export const ACTIONS4 = {
  async saveListing(d, s) {
    const f = forms[d.form];
    const edit = f.editId != null;
    const me = wallet.address.toLowerCase();
    const needProfile = !edit && !s.hostProfiles[me];
    const title = String(f.v.title || '').trim() || '…';
    const e = validateListing(f, needProfile);
    if (Object.keys(e).length) invalid(f, e, edit ? L().editListing(title) : L().createListing(title));
    const photos = await photoUris(f);
    const perks = [...PERKS.filter((p) => f.v[`perk_${p}`]), ...String(f.v.other || '').split(',').map((x) => x.trim()).filter(Boolean)].slice(0, 12);
    const placeName = String(f.v.place).trim();
    const meta = { v: 1, kind: 'listing', description: String(f.v.desc).trim(), city: f.v.city, place: placeName, photos,
      dates: [...f.days].sort((a, b) => a - b).map(dayIso), policy: { key: f.v.policy, window: POLICY[f.v.policy] }, perks };
    const metaURI = await putJson(meta);
    const price = U(Number(f.v.price).toFixed(2)), cap = Number(f.v.cap), win = BigInt(POLICY[f.v.policy]);
    const place = `${placeName}, ${cityShort(f.v.city)}`;
    const steps = [];
    if (needProfile) steps.push(step(s.C.bk, 'setHostProfile', [await putJson({ v: 1, kind: 'host', name: String(f.v.hostName).trim(), bio: String(f.v.hostBio || '').trim() })], L().hostProfile));
    if (edit) steps.push(step(s.C.bk, 'editListing', [BigInt(f.editId), price, cap, win, title, place, metaURI], L().editListing(title)));
    else steps.push(step(s.C.bk, 'createListingWithMeta', [Number(f.v.kind), s.dep.usdc, price, cap, win, title, place, metaURI], L().createListing(title)));
    const role = Number(f.v.kind) === 0 ? 'guide' : 'host';
    return { steps, after: () => { delete forms[d.form]; goTo(`#/partner/${role}`)(); } };
  },
  async toggleListing(d, s) {
    const l = s.listings[Number(d.id)];
    const on = d.active === '1';
    return { steps: [step(s.C.bk, 'updateListing', [BigInt(l.id), l.pricePerUnit, on], on ? L().resume(l.id) : L().pause(l.id))] };
  },
  async removeListing(d, s) {
    return { steps: [step(s.C.bk, 'removeListing', [BigInt(d.id)], L().remove(d.id))], after: () => { delete forms[`adm-${d.id}`]; delete forms[`edit-${d.id}`]; } };
  },
  async createVenue(d, s) {
    const f = forms[d.form];
    const name = String(f.v.name || '').trim() || '…';
    const e = validateVenue(f);
    if (Object.keys(e).length) invalid(f, e, L().createVenue(name));
    const photos = await photoUris(f);
    const placeName = String(f.v.place).trim();
    const metaURI = await putJson({ v: 1, kind: 'venue', city: f.v.city, place: placeName, photos, manual: !!f.v.manual });
    const predicted = await client.readContract({ ...s.C.vn, functionName: 'venueCount' });
    const days = [...f.days].sort((a, b) => a - b);
    // later steps take the real id from step 1's return value (fix) — no race on a predicted id
    const idOf = (sent) => sent[0].result;
    const steps = [step(s.C.vn, 'listVenueWithMeta', [s.dep.usdc, Number(f.v.cap), Number(f.v.share) * 100, U(Number(f.v.deposit).toFixed(2)), U(Number(f.v.fee).toFixed(2)),
      name, cityShort(f.v.city), placeName, !!f.v.manual, metaURI], L().createVenue(name))];
    if (days.length) steps.push(step(s.C.vn, 'setOpenDates', [predicted, days, true], L().openDates(days.length), { gas: 70_000 + 32_000 * days.length, fix: (sent) => [idOf(sent), days, true] }));
    if (f.v.scanner) steps.push(step(s.C.vn, 'setScanner', [predicted, wallet.address, true], L().scanner, { fix: (sent) => [idOf(sent), wallet.address, true] }));
    return { steps, after: (sent) => { delete forms[d.form]; goTo(`#/partner/venue/${idOf(sent)}`)(); } };
  },
  async saveArtist(d, s) {
    const f = forms[d.form];
    const e = validateArtist(f);
    if (Object.keys(e).length) invalid(f, e, L().artist);
    const [photo] = await photoUris(f);
    const uri = await putJson({ v: 1, kind: 'artist', name: String(f.v.name).trim(), genre: String(f.v.genre || '').trim(), city: f.v.city, bio: String(f.v.bio || '').trim(), photo: photo || null });
    return { steps: [step(s.C.vn, 'setArtistProfile', [uri], L().artist)], after: () => { delete forms[d.form]; goTo('#/partner/artist')(); } };
  },
  async requestDate(d, s) {
    const v = s.venues[Number(d.venue)];
    const f = forms[d.form];
    const e = validateRequest(f, v, Number(await now()));
    if (Object.keys(e).length) invalid(f, e, L().request(v.name));
    const ts = BigInt(fromLocalInput(f.v.when));
    return { usdc: v.deposit, steps: [...await approve(s, s.dep.venues, v.deposit),
      step(s.C.vn, 'bookShow', [BigInt(v.id), ts, 0n, 0, String(f.v.title).trim(), v.deposit], L().request(v.name))], after: () => { delete forms[d.form]; } };
  },
  async openSales(d, s) {
    const x = s.shows[Number(d.id)];
    const f = forms[d.form];
    const e = validateSales(f, Number(s.venues[Number(x.venueId)].capacity));
    if (Object.keys(e).length) invalid(f, e, L().openSales(x.id));
    return { steps: [step(s.C.vn, 'openSales', [BigInt(x.id), U(Number(f.v.price).toFixed(2)), Number(f.v.supply), ''], L().openSales(x.id))], after: () => { delete forms[d.form]; } };
  },
  async settleShow(d, s) { return { steps: [step(s.C.tk, 'settle', [BigInt(d.id)], L().settle(d.id))] }; },
  async artistCancel(d, s) { return { steps: [step(s.C.vn, 'artistCancel', [BigInt(d.id)], L().cancel(d.id))] }; },
  async confirmShow(d, s) {
    const { at, sig } = await signShow(s, d.id, 1);
    return { steps: [step(s.C.vn, 'confirmShow', [BigInt(d.id), at, sig], L().confirm(d.id))] };
  },
  async noShowClaim(d, s) {
    const { at, sig } = await signShow(s, d.id, 2);
    return { steps: [step(s.C.vn, 'claimArtistNoShow', [BigInt(d.id), at, sig], L().noShow(d.id))] };
  },
  async bookDirect(d, s) {
    const l = s.listings[Number(d.id)];
    const day = Number(document.getElementById(`bd-date-${l.id}`)?.value);
    const units = Number(document.getElementById(`bd-units-${l.id}`)?.value || 1);
    const t = await now();
    let startAt = BigInt(day * 86400 + 16 * 3600); // 10:00 in Oaxaca / CDMX
    if (startAt < t + 600n) startAt = t + 600n;
    const amount = l.pricePerUnit * BigInt(units);
    return { usdc: amount, steps: [...await approve(s, s.dep.bookings, amount), step(s.C.bk, 'book', [BigInt(l.id), units, startAt, amount], L().book(l.title), { gas: GAS.bookDirect })] };
  },
};
