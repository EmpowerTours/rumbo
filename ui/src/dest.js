import { I18N } from './i18n.js';
import { state, u, dateTime, isoDay, esc } from './fmt.js';

// Schematic Oaxaca centro: positions on a 600x420 canvas, matched by keyword in place/location strings.
const SPOTS = [
  ['etnobot', 338, 128], ['santo-domingo', 300, 150], ['santo domingo', 300, 150], ['alcal', 282, 196], ['jalatlaco', 420, 170],
  ['foro-lumbre', 436, 196], ['foro lumbre', 436, 196], ['xochimilco', 236, 86], ['monte alb', 70, 360], ['centro', 282, 262], ['oaxaca', 300, 300],
];
const spot = (text, i) => {
  const t = String(text).toLowerCase();
  const hit = SPOTS.find(([k]) => t.includes(k));
  const [x, y] = hit ? [hit[1], hit[2]] : [300, 300];
  return [x + ((i * 17) % 23) - 11, y + ((i * 11) % 19) - 9];
};
const COLORS = { guide: 'var(--agave)', stay: 'var(--terracotta)', show: 'var(--jacaranda)', venue: 'var(--sky)', stop: 'var(--marigold)' };

export const filters = { from: null, to: null, budget: 50, type: 'all' };

export function destItems(s) {
  const L = I18N[state.lang];
  const leashOf = (addr) => s.trip.leash.find((x) => s.eq(x.a, addr));
  const fundLeash = (addr) => s.fund.leash.find((x) => s.eq(x.a, addr));
  const items = [];
  for (const l of s.listings) {
    const lz = leashOf(l.host);
    const rating = l.reviewCount ? (Number(l.ratingSum) / Number(l.reviewCount)).toFixed(1) : null;
    items.push({ type: l.kind === 0 ? 'guide' : 'stay', icon: l.kind === 0 ? '🚐' : '🏡', title: l.title, sub: `${s.nameOf(l.host)} · ${l.place}`, place: l.place, price: l.pricePerUnit,
      unit: l.kind === 0 ? L.perPerson : L.perNight, extra: `${l.completed} ${L.completed}${rating ? ` · ★ ${rating} (${l.reviewCount} ${L.ratingN})` : ''}`,
      label: lz ? { ok: true, text: L.onLeash(u(lz.cap - lz.spent, 0)) } : { ok: false, text: L.offLeash } });
  }
  for (const v of s.venues.filter((v) => v.city === 'Oaxaca')) {
    const fl = fundLeash(v.owner);
    const terms = v.venueTicketBps ? L.split(Number(v.venueTicketBps) / 100) : L.flat;
    items.push({ type: 'venue', icon: '🏛️', title: v.name, sub: `${v.place} · ${L.capacity} ${v.capacity}`, place: `${v.name} ${v.place}`, price: v.deposit, unit: L.deposit,
      extra: `${terms} · ${u(v.cancelFee, 0)} ${L.cancelFee} · ${L.reliability} ${v.held} ${L.held_} / ${v.cancelled} ${L.cancelledN}`,
      label: fl ? { ok: true, text: L.venueLeash } : { ok: false, text: L.venueOff } });
    for (const sh of s.shows.filter((x) => Number(x.venueId) === v.id)) {
      items.push({ type: 'show', icon: '🎤', title: sh.title, sub: `${v.name} · ${dateTime(sh.showTime)}`, place: `${v.name} ${v.place}`, price: sh.ticketPrice, unit: L.perTicket, time: Number(sh.showTime),
        extra: `${L.status[sh.status]} · ${sh.sales.sold}/${sh.maxTickets} ${L.sold}`, label: { ok: sh.status === 1 || sh.status === 2, text: L.ticketNote } });
    }
  }
  for (const c of s.camps) {
    items.push({ type: 'stop', icon: ['🧭', '🗺️', '🎨', '🎤'][c.kind], title: c.name, sub: `${L.kinds[c.kind]} · ${L.by} ${s.nameOf(c.sponsor)}`, place: `${c.name} ${String(c.locationId)}`,
      price: 0n, reward: c.rewardPerVisit, unit: '', extra: `+${u(c.rewardPerVisit)} USDC ${L.perVisitR} · ${c.totalVisits} ${L.visits} · ${u(c.budget, 0)} ${L.left}`, label: { ok: true, text: L.stopNote } });
  }
  return items;
}

export function renderDest(s) {
  const L = I18N[state.lang];
  if (!filters.from) { filters.from = isoDay(s.today); filters.to = isoDay(s.today + 14); }
  const fromTs = Date.parse(filters.from) / 1000, toTs = Date.parse(filters.to) / 1000 + 86400;
  const all = destItems(s);
  const items = all.filter((it) => (filters.type === 'all' || it.type === filters.type || (filters.type === 'show' && it.type === 'venue'))
    && Number(it.price) / 1e6 <= filters.budget && (it.time == null || (it.time >= fromTs && it.time < toTs)));
  const pins = items.map((it, i) => { const [x, y] = spot(it.place + ' ' + it.title, i); return `<g class="pin" transform="translate(${x},${y})"><circle r="11" fill="${COLORS[it.type]}" stroke="#fff" stroke-width="2.5"/><text y="4" text-anchor="middle">${i + 1}</text></g>`; }).join('');
  const chip = (k, label) => `<button class="chip ${filters.type === k ? 'on' : ''}" data-type="${k}">${label}</button>`;
  return `
  <section class="card dest-hero">
    <div><div class="dest">${L.destTitle}</div><div class="sub">${L.destSub}</div></div>
    <div class="filters">
      <label>${L.from}<input type="date" id="f-from" value="${filters.from}"></label>
      <label>${L.to}<input type="date" id="f-to" value="${filters.to}"></label>
      <label>${L.budget} <b id="f-bv">${filters.budget} USDC</b><input type="range" id="f-budget" min="5" max="120" step="5" value="${filters.budget}"></label>
    </div>
    <div class="chips">${chip('all', L.all)}${chip('guide', L.guides)}${chip('stay', L.stays)}${chip('show', L.showsT)}${chip('stop', L.stopsT)}<span class="sub" style="margin-left:auto">${L.results(items.length)}</span></div>
  </section>
  <div class="dest-grid">
    <section class="card map-card">
      <svg viewBox="0 0 600 420" class="map" role="img" aria-label="Oaxaca map">
        <rect width="600" height="420" fill="#f6efe4"/>
        <path d="M0 330 C 120 300, 200 360, 330 345 S 520 300, 600 320" stroke="#bcd7e3" stroke-width="14" fill="none" opacity=".8"/>
        <path d="M40 420 L 120 300 L 190 250 L 260 250" fill="none" stroke="#e1d3bf" stroke-width="6" stroke-dasharray="2 8" stroke-linecap="round"/>
        ${[...Array(12).keys()].map((i) => `<line x1="${150 + i * 30}" y1="60" x2="${150 + i * 30}" y2="300" stroke="#eadfcd" stroke-width="${i % 3 ? 2 : 4}"/>`).join('')}
        ${[...Array(9).keys()].map((i) => `<line x1="150" y1="${60 + i * 30}" x2="480" y2="${60 + i * 30}" stroke="#eadfcd" stroke-width="${i % 3 ? 2 : 4}"/>`).join('')}
        <rect x="262" y="246" width="40" height="32" rx="4" fill="#dcebd5"/><text x="282" y="292" class="lbl" text-anchor="middle">Zócalo</text>
        <rect x="318" y="112" width="42" height="30" rx="4" fill="#dcebd5"/><text x="300" y="108" class="lbl" text-anchor="middle">Santo Domingo</text>
        <text x="420" y="150" class="lbl" text-anchor="middle">Jalatlaco</text><text x="236" y="66" class="lbl" text-anchor="middle">Xochimilco</text>
        <text x="282" y="214" class="lbl" text-anchor="end" dx="-14">Alcalá</text><text x="70" y="392" class="lbl" text-anchor="middle">→ Monte Albán · 10 km</text>
        <text x="560" y="404" class="lbl" text-anchor="end">N ↑</text>
        ${pins}
      </svg>
      <div class="note">${L.mapNote}</div>
    </section>
    <section class="card"><div class="list">${items.length ? items.map((it, i) => `
      <div class="row"><div class="num-pin" style="background:${COLORS[it.type]}">${i + 1}</div><div class="ico k${{ guide: 1, stay: 0, show: 2, venue: 2, stop: 3 }[it.type]}">${it.icon}</div>
        <div><div class="t">${esc(it.title)}</div><div class="m">${esc(it.sub)}</div><div class="m">${esc(it.extra)}</div>
          <div style="margin-top:4px"><span class="tag ${it.label.ok ? 'ok' : 'no'}">${it.label.text}</span></div></div>
        <div class="r">${it.type === 'stop' ? `+${u(it.reward)} USDC` : `${u(it.price, 0)} USDC`}<div class="m">${it.unit}</div></div></div>`).join('') : `<div class="sub">${L.noResults}</div>`}
    </div></section>
  </div>`;
}

export function bindDest(rerender) {
  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
  on('f-from', 'change', (e) => { filters.from = e.target.value; rerender(); });
  on('f-to', 'change', (e) => { filters.to = e.target.value; rerender(); });
  on('f-budget', 'change', (e) => { filters.budget = Number(e.target.value); rerender(); });
  on('f-budget', 'input', (e) => { document.getElementById('f-bv').textContent = `${e.target.value} USDC`; });
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { filters.type = b.dataset.type; rerender(); }));
}
