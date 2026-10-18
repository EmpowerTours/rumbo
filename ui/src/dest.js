import { I18N } from './i18n.js';
import { state, u, dateTime, isoDay, esc } from './fmt.js';
import { destBySlug, destOf } from './destinations.js';
import { act } from './act.js';
import { T4 } from './i18n4.js';
import { urlOf } from './content.js';
import { wallet } from './auth/wallet.js';

// Schematic city maps: positions on a 600x420 canvas, matched by keyword in place/location strings.
const spot = (D, text, i) => {
  const t = String(text).toLowerCase();
  const hit = D.spots.find(([k]) => t.includes(k));
  const [x, y] = hit ? [hit[1], hit[2]] : [300, 300];
  return [x + ((i * 17) % 23) - 11, y + ((i * 11) % 19) - 9];
};
const COLORS = { guide: 'var(--agave)', stay: 'var(--terracotta)', show: 'var(--jacaranda)', venue: 'var(--sky)', stop: 'var(--marigold)' };

export const filters = { from: null, to: null, budget: 100, type: 'all' };

export function destItems(s, slug) {
  const L = I18N[state.lang];
  const here = (...t) => destOf(...t) === slug;
  const unit = (sh) => sh.ticketPrice;
  const leashOf = (addr) => s.trip.leash.find((x) => s.eq(x.a, addr));
  const fundLeash = (addr) => s.fund.leash.find((x) => s.eq(x.a, addr));
  const items = [];
  const T = T4[state.lang];
  for (const l of s.listings.filter((x) => !x.removed && x.active && here(x.meta?.city || '', x.place, x.title))) {
    const lz = leashOf(l.host);
    const m = l.meta;
    const rating = l.reviewCount ? (Number(l.ratingSum) / Number(l.reviewCount)).toFixed(1) : null;
    items.push({ type: l.kind === 0 ? 'guide' : 'stay', icon: l.kind === 0 ? '🚐' : '🏡', title: l.title, sub: `${s.nameOf(l.host)} · ${l.place}`, place: l.place, price: l.pricePerUnit,
      unit: l.kind === 0 ? L.perPerson : L.perNight, extra: `${l.completed} ${L.completed}${rating ? ` · ★ ${rating} (${l.reviewCount} ${L.ratingN})` : ''}`,
      label: lz ? { ok: true, text: L.onLeash(u(lz.cap - lz.spent, 0)) } : { ok: false, text: L.offLeash },
      btn: lz ? act('book', L.bookFromVault, { id: l.id }, { owner: s.trip.owner, enabled: s.nowTs >= Number(s.trip.start) && s.nowTs < Number(s.trip.end), why: L.windowClosed }) : '',
      photo: m?.photos?.[0] ? urlOf(m.photos[0]) : null, id: l.id, listing: true, rich: m ? listingDetails(s, l, m, T) : '' });
  }
  for (const v of s.venues.filter((x) => here(x.city, x.place, x.name))) {
    const fl = fundLeash(v.owner);
    const terms = v.venueTicketBps ? L.split(Number(v.venueTicketBps) / 100) : L.flat;
    items.push({ type: 'venue', icon: '🏛️', title: v.name, sub: `${v.place} · ${L.capacity} ${v.capacity}`, place: `${v.name} ${v.place}`, price: v.deposit, unit: L.deposit,
      extra: `${terms} · ${u(v.cancelFee, 0)} ${L.cancelFee} · ${L.reliability} ${v.held} ${L.held_} / ${v.cancelled} ${L.cancelledN}`,
      label: fl ? { ok: true, text: L.venueLeash } : { ok: false, text: L.venueOff }, photo: v.meta?.photos?.[0] ? urlOf(v.meta.photos[0]) : null });
    for (const sh of s.shows.filter((x) => Number(x.venueId) === v.id)) {
      const onSale = sh.status === 1 && !sh.pending && s.nowTs < Number(sh.showTime);
      const asks = sh.tickets.filter((t) => t.ask > 0n && !t.used && !t.refunded);
      const resale = asks.map((t) => `<div class="resale"><span class="tag held">${L.resaleTag}</span> #${t.id} · ${u(t.ask)} USDC <span class="m">(${L.faceN} ${u(unit(sh))} · ${L.byN} ${esc(s.nameOf(t.holder))})</span>
        ${s.eq(t.holder, s.me) ? act('cancelResale', L.unlist, { id: t.id }) : act('buyResale', L.buyResale, { id: t.id }, { kind: 'primary' })}</div>`).join('');
      items.push({ type: 'show', icon: '🎤', title: sh.title, sub: `${v.name} · ${dateTime(sh.showTime)}`, place: `${v.name} ${v.place}`, price: sh.ticketPrice, unit: L.perTicket, time: Number(sh.showTime),
        extra: `${sh.pending ? L.awaiting : L.status[sh.status]} · ${sh.sales.sold}/${sh.maxTickets} ${L.sold}${asks.length ? ` · ${asks.length} ${L.onResale}` : ''}`,
        label: { ok: sh.status === 1 || sh.status === 2, text: L.ticketNote }, resale,
        btn: onSale ? act('buyTicket', L.buyTicket(u(sh.ticketPrice)), { id: sh.id }, { kind: 'primary' }) : '' });
    }
  }
  for (const c of s.camps.filter((x) => here(x.name))) {
    items.push({ type: 'stop', icon: ['🧭', '🗺️', '🎨', '🎤'][c.kind], title: c.name, sub: `${L.kinds[c.kind]} · ${L.by} ${s.nameOf(c.sponsor)}`, place: `${c.name} ${String(c.locationId)}`,
      price: 0n, reward: c.rewardPerVisit, unit: '', extra: `+${u(c.rewardPerVisit)} USDC ${L.perVisitR} · ${c.totalVisits} ${L.visits} · ${u(c.budget, 0)} ${L.left}`, label: { ok: true, text: L.stopNote },
      btn: import.meta.env.DEV ? act('checkin', L.checkInDev, { id: c.id }) : '' });
  }
  return items;
}

// Listings created in the app carry metadata (description, photos, dates, policy, perks) by content hash.
function listingDetails(s, l, m, T) {
  const days = (m.dates || []).map((d) => Math.floor(Date.parse(d) / 86400000)).filter((d) => d >= s.today && (d > s.today || s.nowTs < d * 86400 + 20 * 3600));
  const pol = T.policies[m.policy?.key];
  const mine = s.eq(l.host, wallet.address);
  const book = mine ? '' : days.length ? `<div class="bookbox"><label>${T.date}<select id="bd-date-${l.id}">${days.map((d) => `<option value="${d}">${dayLabelLong(d)}</option>`).join('')}</select></label>
      <label>${T.units(l.kind)}<select id="bd-units-${l.id}">${[...Array(Math.min(Number(l.maxUnits), 10)).keys()].map((i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      ${act('bookDirect', `${T.bookWallet} · ${u(l.pricePerUnit)} USDC`, { id: l.id }, { kind: 'primary' })}</div>` : `<div class="m">${T.noDates}</div>`;
  return `${m.description ? `<div class="desc">${esc(m.description)}</div>` : ''}
    ${m.perks?.length ? `<div class="perks">${m.perks.map((p) => `<span class="perk">${esc(T.perkList[p] || p)}</span>`).join('')}</div>` : ''}
    ${pol ? `<div class="m">↩ ${T.policyT}: <b>${pol[0]}</b> — ${pol[1]}</div>` : ''}
    ${m.photos?.length > 1 ? `<div class="gallery sm">${m.photos.slice(1).map((ph) => `<img src="${esc(urlOf(ph))}" alt="" loading="lazy">`).join('')}</div>` : ''}
    ${book}`;
}
const dayLabelLong = (d) => new Date(d * 86400000).toLocaleDateString(state.lang === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function renderDest(s, slug) {
  const L = I18N[state.lang];
  const D = destBySlug(slug);
  if (!filters.from) { filters.from = isoDay(s.today); filters.to = isoDay(s.today + 14); }
  const fromTs = Date.parse(filters.from) / 1000, toTs = Date.parse(filters.to) / 1000 + 86400;
  const all = destItems(s, D.slug);
  const items = all.filter((it) => (filters.type === 'all' || it.type === filters.type || (filters.type === 'show' && it.type === 'venue'))
    && Number(it.price) / 1e6 <= filters.budget && (it.time == null || (it.time >= fromTs && it.time < toTs)));
  const pins = items.map((it, i) => { const [x, y] = spot(D, it.place + ' ' + it.title, i); return `<g class="pin" transform="translate(${x},${y})"><circle r="11" fill="${COLORS[it.type]}" stroke="#fff" stroke-width="2.5"/><text y="4" text-anchor="middle">${i + 1}</text></g>`; }).join('');
  const chip = (k, label) => `<button class="chip ${filters.type === k ? 'on' : ''}" data-type="${k}">${label}</button>`;
  return `
  <section class="card dest-hero">
    <div><div class="dest">${D.name[state.lang]}</div><div class="sub">${D.sub[state.lang]}</div></div>
    <div class="filters">
      <label>${L.from}<input type="date" id="f-from" value="${filters.from}"></label>
      <label>${L.to}<input type="date" id="f-to" value="${filters.to}"></label>
      <label>${L.budget} <b id="f-bv">${filters.budget} USDC</b><input type="range" id="f-budget" min="5" max="120" step="5" value="${filters.budget}"></label>
    </div>
    <div class="chips">${chip('all', L.all)}${chip('guide', L.guides)}${chip('stay', L.stays)}${chip('show', L.showsT)}${chip('stop', L.stopsT)}<span class="sub" style="margin-left:auto">${L.results(items.length)}</span></div>
  </section>
  <div class="dest-grid">
    <section class="card map-card">
      <svg viewBox="0 0 600 420" class="map" role="img" aria-label="${esc(D.name.en)} map">
        <rect width="600" height="420" fill="#f6efe4"/>
        ${D.map.river ? `<path d="${D.map.river}" stroke="#bcd7e3" stroke-width="14" fill="none" opacity=".8"/>` : ''}
        ${grid(D.map.grid)}
        ${D.map.greens.map(([x, y, w, h, t]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#dcebd5"/>${t ? `<text x="${x + w / 2}" y="${y + h + 14}" class="lbl" text-anchor="middle">${esc(t)}</text>` : ''}`).join('')}
        ${D.map.labels.map(([x, y, t, a]) => `<text x="${x}" y="${y}" class="lbl" text-anchor="${a}">${esc(t)}</text>`).join('')}
        <text x="560" y="404" class="lbl" text-anchor="end">N ↑</text>
        ${pins}
      </svg>
      <div class="note">${L.mapNote}</div>
    </section>
    <section class="card"><div class="list">${items.length ? items.map((it, i) => `
      <div class="row ${it.photo ? 'has-photo' : ''}" ${it.listing ? `data-listing="${it.id}"` : ''}><div class="num-pin" style="background:${COLORS[it.type]}">${i + 1}</div>${it.photo ? `<img class="thumb" src="${esc(it.photo)}" alt="">` : `<div class="ico k${{ guide: 1, stay: 0, show: 2, venue: 2, stop: 3 }[it.type]}">${it.icon}</div>`}
        <div><div class="t">${esc(it.title)}</div><div class="m">${esc(it.sub)}</div><div class="m">${esc(it.extra)}</div>
          <div style="margin-top:4px"><span class="tag ${it.label.ok ? 'ok' : 'no'}">${it.label.text}</span></div>
          ${it.rich || ''}${it.resale || ''}${it.btn ? `<div class="actions">${it.btn}</div>` : ''}</div>
        <div class="r">${it.type === 'stop' ? `+${u(it.reward)} USDC` : `${u(it.price, 0)} USDC`}<div class="m">${it.unit}</div></div></div>`).join('') : `<div class="sub">${L.noResults}</div>`}
    </div></section>
  </div>`;
}

function grid({ x0, y0, x1, y1, step }) {
  const v = [], h = [];
  for (let x = x0, i = 0; x <= x1; x += step, i++) v.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#eadfcd" stroke-width="${i % 3 ? 2 : 4}"/>`);
  for (let y = y0, i = 0; y <= y1; y += step, i++) h.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#eadfcd" stroke-width="${i % 3 ? 2 : 4}"/>`);
  return v.join('') + h.join('');
}

export function bindDest(rerender) {
  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
  on('f-from', 'change', (e) => { filters.from = e.target.value; rerender(); });
  on('f-to', 'change', (e) => { filters.to = e.target.value; rerender(); });
  on('f-budget', 'change', (e) => { filters.budget = Number(e.target.value); rerender(); });
  on('f-budget', 'input', (e) => { document.getElementById('f-bv').textContent = `${e.target.value} USDC`; });
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { filters.type = b.dataset.type; rerender(); }));
}
