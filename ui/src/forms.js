// Partner creation forms (round 4): host/guide listings, venue profile, artist profile, date requests and
// ticket-sale setup. Form state lives here (survives re-renders and language switches); validation is
// client-side and shown inline, and nothing is signed, priced or sent while a form has errors.
import { T4 } from './i18n4.js';
import { state, esc, dayLabel, isoDay, u } from './fmt.js';
import { DESTINATIONS, destBySlug, destOf } from './destinations.js';
import { urlOf } from './content.js';
import { act } from './act.js';
import { wallet, toast } from './auth/wallet.js';

export const forms = {};
export const POLICY = { flexible: 86400, moderate: 5 * 86400, strict: 14 * 86400 };
export const PERKS = ['breakfast', 'wifi', 'kitchen', 'pickup', 'bilingual', 'mezcal', 'bikes', 'transport'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO = 4 * 1024 * 1024;
const CDMX_OFFSET = 6 * 3600; // America/Mexico_City is UTC-6 all year (no DST since 2022)
export const toLocalInput = (ts) => new Date((Number(ts) - CDMX_OFFSET) * 1000).toISOString().slice(0, 16);
export const fromLocalInput = (v) => (v ? Math.floor(Date.parse(`${v}:00Z`) / 1000) + CDMX_OFFSET : NaN);
export const cityShort = (slug) => destBySlug(slug).name.en.split(' · ')[0];
const T = () => T4[state.lang];

export function form(key, init) {
  if (!forms[key]) forms[key] = { key, v: {}, photos: [], days: new Set(), errors: {}, ...init() };
  return forms[key];
}

// ---------- small render helpers ----------
const errText = (f, name) => {
  const e = f.errors[name];
  if (!e) return '';
  const [k, ...a] = e;
  const m = T().err[k];
  return `<span class="field-error" role="alert">${esc(typeof m === 'function' ? m(...a) : m)}</span>`;
};
const field = (f, name, label, input, help = '') => `<div class="field ${f.errors[name] ? 'bad' : ''}" data-field="${name}"><label class="lab" for="${f.key}-${name}">${label}</label>${input}${help ? `<span class="help">${help}</span>` : ''}${errText(f, name)}</div>`;
const inp = (f, name, { type = 'text', ph = '', step, min, max } = {}) => `<input id="${f.key}-${name}" type="${type}" data-k="${f.key}" data-f="${name}" value="${esc(f.v[name] ?? '')}" placeholder="${esc(ph)}"${step ? ` step="${step}"` : ''}${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''} ${type === 'number' ? 'inputmode="decimal"' : ''}>`;
const area = (f, name, ph = '') => `<textarea id="${f.key}-${name}" rows="4" data-k="${f.key}" data-f="${name}" placeholder="${esc(ph)}">${esc(f.v[name] ?? '')}</textarea>`;
const sel = (f, name, opts) => `<select id="${f.key}-${name}" data-k="${f.key}" data-f="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f.v[name]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const check = (f, name, label) => `<label class="check"><input type="checkbox" data-k="${f.key}" data-f="${name}" ${f.v[name] ? 'checked' : ''}> <span>${label}</span></label>`;
const days = (f, from, n, isOn = () => true) => `<div class="daychips">${[...Array(n).keys()].map((k) => from + k).filter(isOn).map((d) =>
  `<button type="button" class="daychip ${f.days.has(d) ? 'on' : ''}" data-k="${f.key}" data-day="${d}" aria-pressed="${f.days.has(d)}">${dayLabel(d)}</button>`).join('')}</div>`;
const photos = (f, max = 6) => `<div class="photos">${f.photos.map((p, i) => `<div class="ph"><img src="${esc(p.url)}" alt=""><button type="button" class="rm" data-k="${f.key}" data-rmphoto="${i}" aria-label="${T().removePhoto}">×</button></div>`).join('')}
  ${f.photos.length < max ? `<label class="ph add"><input type="file" accept="${PHOTO_TYPES.join(',')}" ${max > 1 ? 'multiple' : ''} data-k="${f.key}" data-photos="${max}"><span>＋<br>${T().addPhotos}</span></label>` : ''}</div>`;
const cityOpts = () => DESTINATIONS.map((d) => [d.slug, d.name[state.lang]]);

// ---------- validation ----------
const len = (e, f, k, a, b) => { const s = String(f.v[k] ?? '').trim(); if (!s) e[k] = ['required']; else if (s.length < a) e[k] = ['short', a]; else if (s.length > b) e[k] = ['long', b]; };
const money = (e, f, k, { zero = false, max = 10000, code = 'price' } = {}) => {
  const s = String(f.v[k] ?? '').trim(); const n = Number(s);
  if (s === '' || !Number.isFinite(n) || n < 0 || (!zero && n === 0) || n > max || !/^\d+(\.\d{1,2})?$/.test(s)) e[k] = [code];
};
const int = (e, f, k, a, b) => { const n = Number(f.v[k]); if (!Number.isInteger(n) || n < a || n > b) e[k] = ['int', a, b]; };
const photoCount = (e, f, min) => { if (f.photos.length < min) e.photos = ['photos']; };

export function validateListing(f, needProfile) {
  const e = {};
  len(e, f, 'title', 3, 80); len(e, f, 'desc', 20, 1000); len(e, f, 'place', 2, 60);
  if (!f.v.city) e.city = ['required'];
  money(e, f, 'price'); int(e, f, 'cap', 1, 50);
  if (!f.days.size) e.days = ['dates'];
  photoCount(e, f, 1);
  if (needProfile) { len(e, f, 'hostName', 2, 40); if (String(f.v.hostBio || '').length > 300) e.hostBio = ['long', 300]; }
  return e;
}
export function validateVenue(f) {
  const e = {};
  len(e, f, 'name', 3, 60); len(e, f, 'place', 2, 60); if (!f.v.city) e.city = ['required'];
  int(e, f, 'cap', 1, 5000); money(e, f, 'deposit', { zero: true, max: 100000, code: 'amount' }); money(e, f, 'fee', { zero: true, max: 100000, code: 'amount' });
  if (!e.deposit && !e.fee && Number(f.v.fee) > Number(f.v.deposit)) e.fee = ['fee'];
  int(e, f, 'share', 0, 100); if (e.share) e.share = ['pct'];
  photoCount(e, f, 1);
  return e;
}
export function validateArtist(f) {
  const e = {};
  len(e, f, 'name', 2, 60); if (String(f.v.genre || '').length > 40) e.genre = ['long', 40]; if (String(f.v.bio || '').length > 600) e.bio = ['long', 600];
  return e;
}
export function validateRequest(f, v, nowTs) {
  const e = {};
  const ts = fromLocalInput(f.v.when);
  if (!Number.isFinite(ts)) e.when = ['required'];
  else if (ts <= nowTs + 60) e.when = ['future'];
  else {
    const day = Math.floor(ts / 86400), c = v.cal.find((x) => x.day === day);
    if (c?.booked) e.when = ['taken'];
    else if (!c?.open) e.when = ['closed'];
  }
  len(e, f, 'title', 3, 80);
  return e;
}
export function validateSales(f, cap) {
  const e = {};
  money(e, f, 'price'); int(e, f, 'supply', 1, cap); if (e.supply && Number(f.v.supply) > cap) e.supply = ['overCap', cap];
  return e;
}

/** Marks the errors on the form and toasts a friendly summary. Throws so runAction stops before quoting. */
export function invalid(f, e, title) {
  f.errors = e;
  f.scroll = true;
  const n = Object.keys(e).length;
  toast({ state: 'error', title, body: T().fix(n) });
  const err = new Error('ValidationFailed'); err.revertName = 'ValidationFailed'; err.fields = Object.keys(e); throw err;
}

// ---------- pages ----------
export function listingForm(s, kindOrId) {
  const L = T();
  const editId = /^\d+$/.test(String(kindOrId)) ? Number(kindOrId) : null;
  const l = editId != null ? s.listings[editId] : null;
  const f = form(editId != null ? `edit-${editId}` : 'new-listing', () => {
    if (!l) return { v: { kind: kindOrId === 'tour' ? '0' : '1', city: 'oaxaca', policy: 'moderate', cap: '', price: '' } };
    const m = l.meta || {};
    const policy = m.policy?.key || Object.entries(POLICY).find(([, w]) => w === Number(l.cancelWindow))?.[0] || 'moderate';
    return { editId, v: { kind: String(l.kind), title: l.title, desc: m.description || '', city: m.city || destOf(l.place, l.title), place: m.place || l.place.split(',')[0],
      price: String(Number(l.pricePerUnit) / 1e6), cap: String(l.maxUnits), policy, other: (m.perks || []).filter((p) => !PERKS.includes(p)).join(', '),
      ...Object.fromEntries(PERKS.map((p) => [`perk_${p}`, (m.perks || []).includes(p)])) },
      photos: (m.photos || []).map((uri) => ({ uri, url: urlOf(uri) })), days: new Set((m.dates || []).map((d) => Math.floor(Date.parse(d) / 86400000))) };
  });
  if (kindOrId === 'tour' || kindOrId === 'stay') f.v.kind = kindOrId === 'tour' ? '0' : '1';
  const k = Number(f.v.kind);
  const needProfile = editId == null && !s.hostProfiles[wallet.address?.toLowerCase()];
  const mine = !l || s.eq(l.host, wallet.address);
  if (l && !mine) return `<section class="card"><div class="sub">${esc(L.edit)} · ${esc(l.title)} — ${L.signInFirst}</div></section>`;
  const status = l ? (l.removed ? `<span class="tag ref">${L.removedTag}</span>` : l.active ? `<span class="tag ok">${L.live}</span>` : `<span class="tag no">${L.paused}</span>`) : '';
  return `
  <form class="card pform" data-form="${f.key}" novalidate onsubmit="return false">
    <h2>${editId != null ? `${L.editListing} #${editId}` : L.createListing(k)} ${status}</h2>
    ${editId == null ? `<div class="seg" role="radiogroup" aria-label="${L.kind}">${[['0', L.kindTour], ['1', L.kindStay]].map(([v, t]) =>
      `<a class="chip ${f.v.kind === v ? 'on' : ''}" href="#/create/listing/${v === '0' ? 'tour' : 'stay'}${location.search ? '' : ''}">${v === '0' ? '🚐' : '🏡'} ${t}</a>`).join('')}</div>` : ''}
    <div class="fgrid">
      ${field(f, 'title', L.title, inp(f, 'title', { ph: L.titlePh }))}
      ${field(f, 'city', L.city, sel(f, 'city', cityOpts()))}
      ${field(f, 'desc', L.desc, area(f, 'desc', L.descPh))}
      ${field(f, 'place', L.place, inp(f, 'place', { ph: L.placePh }))}
      ${field(f, 'price', L.price(k), inp(f, 'price', { type: 'number', step: '0.01', min: 0, ph: '35' }))}
      ${field(f, 'cap', L.capacity(k), inp(f, 'cap', { type: 'number', step: '1', min: 1, ph: k === 0 ? '8' : '5' }))}
    </div>
    ${field(f, 'photos', L.photos, photos(f), L.photosHelp)}
    ${field(f, 'days', L.dates, days(f, s.today, 28), L.datesHelp)}
    <div class="fgrid">
      ${field(f, 'policy', L.policy, sel(f, 'policy', Object.entries(L.policies).map(([key, [n, d]]) => [key, `${n} — ${d}`])))}
      <div class="field"><span class="lab">${L.perks}</span><div class="checks">${PERKS.map((p) => check(f, `perk_${p}`, L.perkList[p])).join('')}</div>
        ${inp(f, 'other', { ph: L.otherPerks })}</div>
    </div>
    ${needProfile ? `<fieldset class="profile"><legend>${L.profileSection}</legend><div class="help">${L.profileHelp}</div><div class="fgrid">
      ${field(f, 'hostName', L.displayName, inp(f, 'hostName'))}${field(f, 'hostBio', L.bio, inp(f, 'hostBio'))}</div></fieldset>` : ''}
    <div class="actions sticky">
      ${act('saveListing', editId != null ? L.save : L.publish, { form: f.key }, { kind: 'primary', enabled: !l?.removed })}
      ${l && !l.removed ? listingAdmin(s, l) : ''}
    </div>
  </form>`;
}

/** Pause/resume + two-step delete for one of my listings (also used on the host dashboard). */
export function listingAdmin(s, l) {
  const L = T();
  if (l.removed) return `<span class="tag ref">${L.removedTag}</span>`;
  const f = form(`adm-${l.id}`, () => ({}));
  return `${act('toggleListing', l.active ? L.pause : L.resume, { id: l.id, active: l.active ? '0' : '1' }, { owner: l.host })}
    ${f.confirmDel ? `<span class="delbox"><span class="m">${L.delWarn}</span>${act('removeListing', L.delConfirm, { id: l.id }, { owner: l.host, kind: 'danger' })}<button type="button" class="act" data-k="${f.key}" data-delcancel="1">${L.cancel}</button></span>`
      : `<button type="button" class="act ghost-danger" data-k="${f.key}" data-delask="1" ${s.eq(l.host, wallet.address) ? '' : 'disabled'}>${L.del}</button>`}`;
}

export function venueForm(s) {
  const L = T();
  const f = form('new-venue', () => ({ v: { city: 'oaxaca', share: '0', deposit: '', fee: '', manual: true, scanner: true }, days: new Set([...Array(7).keys()].map((i) => s.today + i)) }));
  return `
  <form class="card pform" data-form="${f.key}" novalidate onsubmit="return false">
    <h2>🏛️ ${L.venueForm}</h2>
    <div class="fgrid">
      ${field(f, 'name', L.venueName, inp(f, 'name', { ph: 'Foro …' }))}
      ${field(f, 'city', L.city, sel(f, 'city', cityOpts()))}
      ${field(f, 'place', L.place, inp(f, 'place', { ph: L.placePh }))}
      ${field(f, 'cap', L.capacityV, inp(f, 'cap', { type: 'number', step: '1', min: 1, ph: '150' }))}
      ${field(f, 'deposit', L.deposit, inp(f, 'deposit', { type: 'number', step: '0.01', min: 0, ph: '60' }))}
      ${field(f, 'fee', L.cancelFee, inp(f, 'fee', { type: 'number', step: '0.01', min: 0, ph: '15' }))}
      ${field(f, 'share', L.share, inp(f, 'share', { type: 'number', step: '1', min: 0, max: 100 }), L.shareHelp)}
      <div class="field"><span class="lab">&nbsp;</span>${check(f, 'manual', `✋ ${L.manual}`)}${check(f, 'scanner', `📷 ${L.scannerSelf}`)}</div>
    </div>
    ${field(f, 'photos', L.photos, photos(f), L.photosHelp)}
    ${field(f, 'days', L.openDatesF, days(f, s.today, 14), L.datesHelp)}
    <div class="actions sticky">${act('createVenue', L.publishVenue, { form: f.key }, { kind: 'primary' })}</div>
  </form>`;
}

export function artistForm(s) {
  const L = T();
  const p = s.artistProfiles[wallet.address?.toLowerCase()];
  const f = form('artist', () => ({ v: { name: p?.name || '', genre: p?.genre || '', city: p?.city || 'oaxaca', bio: p?.bio || '' }, photos: p?.photo ? [{ uri: p.photo, url: urlOf(p.photo) }] : [] }));
  return `
  <form class="card pform" data-form="${f.key}" novalidate onsubmit="return false">
    <h2>🎤 ${L.artistForm}</h2>
    <div class="fgrid">
      ${field(f, 'name', L.artistName, inp(f, 'name', { ph: 'Lumbre' }))}
      ${field(f, 'genre', L.genre, inp(f, 'genre', { ph: 'cumbia psicodélica' }))}
      ${field(f, 'city', L.homeCity, sel(f, 'city', cityOpts()))}
      ${field(f, 'bio', L.bio, area(f, 'bio'))}
    </div>
    ${field(f, 'photos', L.photo, photos(f, 1))}
    <div class="actions sticky">${act('saveArtist', L.saveArtist, { form: f.key }, { kind: 'primary' })}</div>
  </form>`;
}

/** Request-a-date card for one venue (artist dashboard). */
export function requestForm(s, v) {
  const L = T();
  const f = form(`req-${v.id}`, () => ({ v: { when: '', title: '' } }));
  const openDays = v.cal.filter((c) => c.open && !c.booked);
  const photo = v.meta?.photos?.[0];
  return `<div class="vcard" data-form="${f.key}">
    ${photo ? `<img class="thumb" src="${esc(urlOf(photo))}" alt="">` : '<div class="thumb ico k2">🏛️</div>'}
    <div class="vbody"><div class="t">${esc(v.name)} · ${esc(v.city)}</div>
      <div class="m">${esc(v.place)} · ${v.capacity} · ${u(v.deposit, 0)} USDC · ${v.manual ? '✋' : '⚡'}</div>
      <div class="m">${L.openDaysList}: ${openDays.length ? openDays.map((c) => `<button type="button" class="daychip mini" data-k="${f.key}" data-pick="${c.day}">${dayLabel(c.day)}</button>`).join('') : '—'}</div>
      <div class="fgrid">
        ${field(f, 'when', `${L.when} <span class="m">(CDMX)</span>`, inp(f, 'when', { type: 'datetime-local' }))}
        ${field(f, 'title', L.showTitle, inp(f, 'title', { ph: L.showTitlePh }))}
      </div>
      <div class="note">${L.depositNote(u(v.deposit, 2), u(v.cancelFee, 2))}</div>
      <div class="actions">${act('requestDate', L.requestDate, { venue: v.id, form: f.key }, { kind: 'primary' })}</div></div></div>`;
}

/** Ticket-sale setup for an accepted show with no price yet. */
export function salesForm(s, x) {
  const L = T();
  const cap = Number(s.venues[Number(x.venueId)].capacity);
  const f = form(`sale-${x.id}`, () => ({ v: { price: '', supply: String(Math.min(cap, 100)) } }));
  return `<div class="salesform" data-form="${f.key}"><div class="t">🎟️ ${L.salesSetup}</div><div class="fgrid">
    ${field(f, 'price', L.ticketPrice, inp(f, 'price', { type: 'number', step: '0.01', min: 0, ph: '12' }))}
    ${field(f, 'supply', L.supply(cap), inp(f, 'supply', { type: 'number', step: '1', min: 1, max: cap }))}</div>
    <div class="note">♻️ ${L.resaleShown(s.resale.capBps / 100, s.resale.royaltyBps / 100)}</div>
    <div class="actions">${act('openSales', L.openSales, { id: x.id, form: f.key }, { kind: 'primary', owner: x.artist })}</div></div>`;
}

// ---------- binding ----------
export function bindForms(rerender) {
  document.querySelectorAll('[data-f]').forEach((el) => {
    const upd = () => {
      const f = forms[el.dataset.k]; if (!f) return;
      f.v[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      if (f.errors[el.dataset.f]) { delete f.errors[el.dataset.f]; const box = el.closest('.field'); box?.classList.remove('bad'); box?.querySelector('.field-error')?.remove(); }
    };
    el.addEventListener('input', upd); el.addEventListener('change', upd);
  });
  document.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const f = forms[b.dataset.k]; const d = Number(b.dataset.day);
    if (f.days.has(d)) f.days.delete(d); else f.days.add(d);
    b.classList.toggle('on'); b.setAttribute('aria-pressed', String(f.days.has(d)));
    if (f.errors.days) { delete f.errors.days; const box = b.closest('.field'); box?.classList.remove('bad'); box?.querySelector('.field-error')?.remove(); }
  }));
  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    // prefill a time inside that (UTC) calendar day: 17:00 CDMX = 23:00 UTC
    const f = forms[b.dataset.k]; const d = Number(b.dataset.pick);
    f.v.when = toLocalInput(d * 86400 + 23 * 3600); delete f.errors.when; rerender();
  }));
  document.querySelectorAll('[data-photos]').forEach((el) => el.addEventListener('change', () => {
    const f = forms[el.dataset.k]; const max = Number(el.dataset.photos);
    delete f.errors.photos;
    for (const file of el.files) {
      if (!PHOTO_TYPES.includes(file.type)) { f.errors.photos = ['photoType']; continue; }
      if (file.size > MAX_PHOTO) { f.errors.photos = ['photoTooBig']; continue; }
      if (f.photos.length >= max) { f.errors.photos = ['tooMany']; break; }
      f.photos.push({ file, url: URL.createObjectURL(file) });
    }
    rerender();
  }));
  document.querySelectorAll('[data-rmphoto]').forEach((b) => b.addEventListener('click', () => { forms[b.dataset.k].photos.splice(Number(b.dataset.rmphoto), 1); rerender(); }));
  document.querySelectorAll('[data-delask]').forEach((b) => b.addEventListener('click', () => { forms[b.dataset.k].confirmDel = true; rerender(); }));
  document.querySelectorAll('[data-delcancel]').forEach((b) => b.addEventListener('click', () => { forms[b.dataset.k].confirmDel = false; rerender(); }));
  // after a failed submit: bring the first bad field into view
  const f = Object.values(forms).find((x) => x.scroll);
  if (f) {
    f.scroll = false;
    const bad = document.querySelector(`[data-form="${f.key}"] .field.bad`);
    if (bad) { bad.scrollIntoView({ block: 'center' }); bad.querySelector('input,textarea,select')?.focus({ preventScroll: true }); }
  }
}

export const dayIso = isoDay;
