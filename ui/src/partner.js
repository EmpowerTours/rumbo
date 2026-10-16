import QRCode from 'qrcode';
import { I18N } from './i18n.js';
import { state, u, p, date, dateTime, dayLabel, esc } from './fmt.js';
import { short } from './data.js';

const mockBtn = (L, label) => `<button class="mock" title="${L.mockNote}"><span class="mk">${L.mock}</span> ${label}</button>`;
const stat = (v, k) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`;
const qrCache = new Map();
export async function qrSvg(text) {
  if (!qrCache.has(text)) qrCache.set(text, await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#2b1d14', light: '#ffffff' } }));
  return qrCache.get(text);
}

function stopStats(s, L, addr) {
  const camps = s.camps.filter((c) => s.eq(c.sponsor, addr));
  if (!camps.length) return '';
  return `<section class="card"><h3>${L.stopStats}</h3>${camps.map((c) => {
    const ev = s.visitsAll.filter((e) => Number(e.args.campaignId) === c.id);
    const users = new Set(ev.map((e) => e.args.user.toLowerCase())).size;
    const paid = ev.reduce((a, e) => a + e.args.reward, 0n), tours = ev.reduce((a, e) => a + e.args.tours, 0n);
    return `<div class="t" style="font-weight:700;margin-bottom:8px">${esc(c.name)}</div>
      <div class="stats">${stat(c.totalVisits, L.visits)}${stat(users, L.uniqueV)}${stat(u(paid), L.paidOut)}${stat(p(tours), L.toursIssued)}${stat(u(c.budget, 0), L.budgetLeft)}</div>`;
  }).join('<hr>')}</section>`;
}

function hostView(s, L, addr) {
  const listings = s.listings.filter((l) => s.eq(l.host, addr));
  const ids = new Set(listings.map((l) => l.id));
  const books = s.bookings.filter((b) => ids.has(Number(b.listingId)));
  const rel = s.released.filter((e) => s.eq(e.args.host, addr));
  const earned = rel.reduce((a, e) => a + e.args.hostAmount, 0n);
  const pending = books.filter((b) => b.status === 1).reduce((a, b) => a + b.amount, 0n);
  const startDay = Math.min(s.today, ...books.map((b) => Math.floor(Number(b.startAt) / 86400))) ;
  const cal = [...Array(21).keys()].map((k) => {
    const day = startDay + k;
    const b = books.find((x) => { const d0 = Math.floor(Number(x.startAt) / 86400); const l = s.listings[Number(x.listingId)]; return day >= d0 && day < d0 + (l.kind === 1 ? Number(x.units) : 1); });
    const cls = b ? (b.status === 3 ? 'ref' : 'booked') : 'open';
    return `<div class="day ${cls}" title="${b ? esc(s.listings[Number(b.listingId)].title) : ''}"><span>${dayLabel(day)}</span>${b ? `<i>${b.status === 3 ? '↩' : b.status === 2 ? '✓' : '•'}</i>` : ''}</div>`;
  }).join('');
  const reviews = s.reviewsEv.filter((e) => ids.has(Number(e.args.listingId)));
  const qrText = `empowertours://checkin?listing=${listings[0]?.id ?? 0}&host=${addr}&chain=20143`;
  return { qrText, html: `
  <div class="pgrid">
    <div class="col">
      <section class="card"><h3>${L.listings}</h3><div class="list">${listings.map((l) => `
        <div class="row"><div class="ico ${l.kind === 0 ? 'k1' : 'k0'}">${l.kind === 0 ? '🚐' : '🏡'}</div>
          <div><div class="t">${esc(l.title)}</div><div class="m">${esc(l.place)} · ${l.completed} ${L.completed} · ${l.reviewCount ? `★ ${(Number(l.ratingSum) / Number(l.reviewCount)).toFixed(1)}` : '—'}</div></div>
          <div class="r">${u(l.pricePerUnit, 0)} USDC<div class="m">${l.kind === 0 ? L.perPerson : L.perNight}</div></div></div>`).join('')}</div>
        <div class="actions">${mockBtn(L, L.newListing)}</div></section>
      <section class="card"><h3>${L.calendar}</h3><div class="cal">${cal}</div>
        <div class="legend" style="margin-top:8px"><span style="--c:#e2f3ee">${L.legendOpen}</span><span style="--c:var(--agave)">${L.legendBooked}</span><span style="--c:var(--terracotta)">${L.refunded}</span></div></section>
      ${stopStats(s, L, addr)}
    </div>
    <div class="col">
      <section class="card"><h3>${L.earnings}</h3><div class="tours">${u(earned)} <small>USDC ${L.released_}</small></div>
        <div class="sub">${u(pending)} USDC ${L.pendingEsc} · ${L.feeNote}</div><div class="actions">${mockBtn(L, L.withdraw)}</div></section>
      <section class="card qrcard"><h3>${L.qr}</h3><div class="qr" id="qr"></div><div class="hash">${esc(qrText.slice(0, 64))}…</div><div class="note">${L.qrNote}</div></section>
      <section class="card"><h3>${L.reviews}</h3><div class="list">${reviews.length ? reviews.map((e) => `
        <div><span class="stars">${'★'.repeat(e.args.rating)}</span> “${esc(s.demo.reviews[String(e.args.bookingId)] || '')}” <div class="m">${s.nameOf(e.args.reviewer)} · <span class="hash">${e.args.reviewHash.slice(0, 18)}…</span></div></div>`).join('') : `<div class="sub">${L.noReviews}</div>`}</div></section>
    </div>
  </div>` };
}

function venueView(s, L, vid) {
  const v = s.venues[vid];
  const shows = s.shows.filter((x) => Number(x.venueId) === vid);
  const fee = (x) => x.status === 2 ? (x.deposit * BigInt(10000 - Number(x.feeBps))) / 10000n : x.status === 4 || x.status === 5 ? x.cancelFee : 0n;
  const depositIn = shows.reduce((a, x) => a + fee(x), 0n);
  const ticketsIn = shows.reduce((a, x) => a + x.sales.toVenue, 0n);
  const cal = v.cal.map((c) => `<div class="day ${c.booked ? 'booked' : c.open ? 'open' : 'closed'}"><span>${dayLabel(c.day)}</span>${c.booked ? '<i>🎤</i>' : ''}</div>`).join('');
  const qrText = `empowertours://door?venue=${vid}&show=${shows[0]?.id ?? ''}&chain=20143`;
  const switcher = s.venues.filter((x) => s.fund.leash.some((l) => s.eq(l.a, x.owner)))
    .map((x) => `<a class="chip ${x.id === vid ? 'on' : ''}" href="#/partner/venue/${x.id}">${esc(x.name)}</a>`).join('');
  return { qrText, html: `
  <div class="chips" style="margin-bottom:14px">${switcher}</div>
  <div class="pgrid">
    <div class="col">
      <section class="card"><h3>${esc(v.name)} · ${esc(v.city)}</h3>
        <div class="kv"><span>${L.capacity}</span><b>${v.capacity}</b><span>${L.terms}</span><b>${v.venueTicketBps ? L.split(Number(v.venueTicketBps) / 100) : L.flat}</b>
          <span>${L.deposit_}</span><b>${u(v.deposit, 0)} USDC</b><span style="text-transform:capitalize">${L.cancelFee}</span><b>${u(v.cancelFee, 0)} USDC</b></div></section>
      <section class="card"><h3>${L.openDates}</h3><div class="cal">${cal}</div>
        <div class="legend" style="margin-top:8px"><span style="--c:#e2f3ee">${L.legendOpen}</span><span style="--c:var(--agave)">${L.legendBooked}</span><span style="--c:#eee">${L.legendClosed}</span></div>
        <div class="actions">${mockBtn(L, L.editDates)}</div></section>
      <section class="card"><h3>${L.requests}</h3><div class="list">${shows.map((x) => `
        <div class="row"><div class="ico k2">🎤</div><div><div class="t">${esc(x.title)}</div><div class="m">${s.nameOf(x.artist)} · ${s.nameOf(x.payer)} · ${dateTime(x.showTime)}</div>
          <div style="margin-top:4px"><span class="tag ${x.status === 2 ? 'ok' : x.status === 1 ? 'held' : 'ref'}">${L.status[x.status]}</span></div></div>
          <div class="r">${u(x.deposit, 0)} USDC<div class="m">${x.status === 2 ? L.depositRel : x.status === 3 || x.status === 6 ? L.depositRef : x.status >= 4 ? L.cancelKept : L.held}</div></div></div>`).join('')}</div>
        <div class="actions">${mockBtn(L, L.accept)}${mockBtn(L, L.cancelShow)}</div></section>
      ${stopStats(s, L, v.owner)}
    </div>
    <div class="col">
      <section class="card"><h3>${L.ticketSales}</h3><div class="list">${shows.map((x) => {
        const scanned = x.tickets.filter((t) => t.used).length, refunded = x.tickets.filter((t) => t.refunded).length;
        return `<div><div class="kv"><span>${esc(x.title)}</span><b>${x.sales.sold}/${x.maxTickets} ${L.sold}</b></div>
          <div class="vb"><div style="width:${Math.max(2, (Number(x.sales.sold) * 100) / Number(x.maxTickets))}%"></div></div>
          <div class="m">${scanned} ${L.scanned} · ${refunded} ${L.refundedN} · gross ${u(x.sales.gross + BigInt(refunded) * x.ticketPrice)} USDC</div></div>`;
      }).join('')}</div></section>
      <section class="card"><h3>${L.payouts}</h3><div class="tours">${u(depositIn + ticketsIn)} <small>USDC</small></div>
        <div class="kv"><span>${L.deposit_}</span><b>${u(depositIn)}</b><span>${L.ticketSales} (${L.toVenue})</span><b>${u(ticketsIn)}</b></div><div class="note">${L.feeNote}</div></section>
      <section class="card"><h3>${L.reliability}</h3><div class="stats">${stat(v.held, L.held_)}${stat(v.cancelled, L.cancelledN)}${stat(`${(Number(v.relBps) / 100).toFixed(0)}%`, L.reliability)}</div><div class="note">${L.relNote}</div></section>
      <section class="card qrcard"><h3>${L.qr}</h3><div class="qr" id="qr"></div><div class="note">${L.qrNote}</div></section>
    </div>
  </div>` };
}

function artistView(s, L) {
  const f = s.fund;
  const shows = s.shows.filter((x) => s.eq(x.payer, s.demo.artistVault));
  return { qrText: null, html: `
  <div class="pgrid">
    <div class="col">
      <section class="card"><h3>${L.tourFund}</h3><div class="t" style="font-weight:700">${esc(f.dest)}</div>
        <div class="big" style="font-size:34px;margin-top:8px">${u(f.assets, 0)} <small>USDC · ${L.spent} ${u(f.spent, 0)}</small></div>
        <div class="leash" style="margin-top:12px">${f.leash.map((x) => `<div><div class="kv"><span>${s.nameOf(x.a)}</span><b>${u(x.spent, 0)} / ${u(x.cap, 0)} USDC</b></div><div class="vb"><div style="width:${x.cap ? Number((x.spent * 100n) / x.cap) : 0}%"></div></div></div>`).join('')}</div>
        <div class="note">${L.fundNote}</div><div class="actions">${mockBtn(L, L.bookVenue)}</div></section>
      <section class="card"><h3>${L.venueBookings}</h3><div class="list">${shows.map((x) => `
        <div class="row"><div class="ico k2">🏛️</div><div><div class="t">${esc(s.venues[Number(x.venueId)].name)}</div><div class="m">${esc(x.title)} · ${dateTime(x.showTime)}</div>
          <div style="margin-top:4px"><span class="tag ${x.status === 2 ? 'ok' : x.status === 1 ? 'held' : 'ref'}">${L.status[x.status]}</span></div></div>
          <div class="r">${u(x.deposit, 0)} USDC<div class="m">${x.status === 2 ? L.depositRel : x.status === 3 ? L.depositRef : L.held}</div></div></div>`).join('')}</div></section>
      ${stopStats(s, L, s.demo.actors.artist.address)}
    </div>
    <div class="col">
      <section class="card"><h3>${L.backers}</h3><div class="list">${f.contribs.map((c, i) => `<div class="kv"><span>${s.nameOf(c)} <span class="hash">${short(c)}</span></span><b>${u(f.principals[i], 0)} USDC</b></div>`).join('')}</div>
        <div class="note">${L.backNote}</div></section>
      <section class="card"><h3>${L.ticketSales}</h3><div class="list">${shows.map((x) => {
        const refunded = x.tickets.filter((t) => t.refunded).length;
        return `<div><div class="kv"><span>${esc(x.title)}</span><b>${x.tickets.length} ${L.sold}</b></div>
          <div class="m">${x.sales.settled ? `${u(x.sales.toArtist)} ${L.toArtist} · ${u(x.sales.toVenue)} ${L.toVenue} · ${u(x.sales.fee)} ${L.fee}` : refunded ? `${refunded} ${L.refundedN} · ${L.status[x.status]}` : L.held}</div></div>`;
      }).join('<hr>')}</div></section>
    </div>
  </div>` };
}

export function renderPartner(s, role, sub) {
  const L = I18N[state.lang];
  const tab = (k, label) => `<a class="chip ${role === k ? 'on' : ''}" href="#/partner/${k}">${label}</a>`;
  const A = s.demo.actors;
  const view = role === 'guide' ? hostView(s, L, A.guide.address) : role === 'venue' ? venueView(s, L, Number(sub ?? 0)) : role === 'artist' ? artistView(s, L) : hostView(s, L, A.hostB.address);
  const who = { host: A.hostB.name, guide: A.guide.name, venue: s.venues[Number(sub ?? 0)]?.name, artist: A.artist.name }[role] || A.hostB.name;
  return { qrText: view.qrText, html: `
    <section class="card dest-hero"><div><div class="dest">${L.partnerTitle}</div><div class="sub">${esc(who)}</div></div>
      <div class="chips">${tab('host', L.roleHost)}${tab('guide', L.roleGuide)}${tab('venue', L.roleVenue)}${tab('artist', L.roleArtist)}<span class="sub" style="margin-left:auto">${L.mockNote}</span></div></section>
    ${view.html}` };
}
