import { CHAIN } from './chain.js';
import QRCode from 'qrcode';
import { I18N } from './i18n.js';
import { state, u, p, date, dateTime, dayLabel, esc } from './fmt.js';
import { short } from './data.js';
import { act } from './act.js';
import { wallet } from './auth/wallet.js';
import { T4 } from './i18n4.js';
import { listingAdmin, requestForm, salesForm } from './forms.js';
import { urlOf } from './content.js';
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
  const T = T4[state.lang];
  const mine = s.eq(addr, wallet.address);
  const listings = s.listings.filter((l) => s.eq(l.host, addr) && (mine || !l.removed));
  const ids = new Set(listings.map((l) => l.id));
  const books = s.bookings.filter((b) => ids.has(Number(b.listingId)));
  const rel = s.released.filter((e) => s.eq(e.args.host, addr));
  const earned = rel.reduce((a, e) => a + e.args.hostAmount, 0n);
  const pending = books.filter((b) => b.status === 1).reduce((a, b) => a + b.amount, 0n);
  const startDay = Math.min(s.today, ...books.map((b) => Math.floor(Number(b.startAt) / 86400))) ;
  const cal = [...Array(21).keys()].map((k) => {
    const day = startDay + k;
    const b = books.filter((x) => { const d0 = Math.floor(Number(x.startAt) / 86400); const l = s.listings[Number(x.listingId)]; return day >= d0 && day < d0 + (l.kind === 1 ? Number(x.units) : 1); })
      .sort((x, y) => (x.status === 3) - (y.status === 3))[0]; // a live/released booking wins over a refunded one
    const cls = b ? (b.status === 3 ? 'ref' : 'booked') : 'open';
    return `<div class="day ${cls}" title="${b ? esc(s.listings[Number(b.listingId)].title) : ''}"><span>${dayLabel(day)}</span>${b ? `<i>${b.status === 3 ? '↩' : b.status === 2 ? '✓' : '•'}</i>` : ''}</div>`;
  }).join('');
  const open = books.filter((b) => b.status === 1);
  const iScan = !!s.hostScanner[addr.toLowerCase()];
  const reviews = s.reviewsEv.filter((e) => ids.has(Number(e.args.listingId)));
  const qrText = `empowertours://checkin?listing=${listings[0]?.id ?? 0}&host=${addr}&chain=${CHAIN.id}`;
  return { qrText, html: `
  <div class="pgrid">
    <div class="col">
      <section class="card"><h3>${L.listings}${mine ? ` <span class="h-actions"><a class="act small" href="#/create/listing/tour">${T.newTour}</a><a class="act small" href="#/create/listing/stay">${T.newStay}</a></span>` : ''}</h3><div class="list">${listings.map((l) => `
        <div class="row ${l.removed ? 'gone' : ''}" data-listing="${l.id}">${l.meta?.photos?.[0] ? `<img class="thumb sm" src="${esc(urlOf(l.meta.photos[0]))}" alt="">` : `<div class="ico ${l.kind === 0 ? 'k1' : 'k0'}">${l.kind === 0 ? '🚐' : '🏡'}</div>`}
          <div><div class="t">${esc(l.title)} ${l.removed ? `<span class="tag ref">${T.removedTag}</span>` : l.active ? '' : `<span class="tag no">${T.paused}</span>`}</div><div class="m">${esc(l.place)} · ${l.completed} ${L.completed} · ${l.reviewCount ? `★ ${(Number(l.ratingSum) / Number(l.reviewCount)).toFixed(1)}` : '—'}</div>
            ${mine && !l.removed ? `<div class="actions"><a class="act" href="#/create/listing/${l.id}">✏️ ${T.edit}</a>${listingAdmin(s, l)}</div>` : ''}</div>
          <div class="r">${u(l.pricePerUnit, 0)} USDC<div class="m">${l.kind === 0 ? L.perPerson : L.perNight}</div></div></div>`).join('')}</div>
        </section>
      <section class="card"><h3>${L.hostRequests}</h3><div class="list">${open.length ? open.map((b) => { const l = s.listings[Number(b.listingId)]; return `
        <div class="row"><div class="ico ${l.kind === 0 ? 'k1' : 'k0'}">${l.kind === 0 ? '🚐' : '🏡'}</div>
          <div><div class="t">${esc(l.title)} · #${b.id}</div><div class="m">${s.nameOf(b.payer)} · ${b.units} ${l.kind === 0 ? L.people : L.nights} · ${dateTime(b.startAt)}</div>
            <div style="margin-top:4px"><span class="tag held">${L.held}</span>${b.accepted ? ` <span class="tag ok">${L.accepted}</span>` : ` <span class="tag no">${L.requestsPending}</span>`}</div>
            <div class="actions">${b.accepted ? '' : act('hostAccept', L.hostAccept, { id: b.id }, { owner: addr, kind: 'primary' })}${act('hostScan', `📷 ${L.hostScan}`, { id: b.id }, { enabled: iScan && s.nowTs >= Number(b.startAt), why: iScan ? '' : L.scannerOff })}${act('hostCancel', L.hostCancel, { id: b.id }, { owner: addr })}</div></div>
          <div class="r">${u(b.amount)} USDC</div></div>`; }).join('') : `<div class="sub">—</div>`}</div>
        <div class="m" style="margin-top:8px">${iScan ? `✓ ${L.scannerOn}` : act('hostScanner', L.scannerOff, {}, { owner: addr })}</div></section>
      <section class="card"><h3>${L.calendar}</h3><div class="cal">${cal}</div>
        <div class="legend" style="margin-top:8px"><span style="--c:#e2f3ee">${L.legendOpen}</span><span style="--c:var(--agave)">${L.legendBooked}</span><span style="--c:var(--terracotta)">${L.refunded}</span></div></section>
      ${stopStats(s, L, addr)}
    </div>
    <div class="col">
      <section class="card"><h3>${L.earnings}</h3><div class="tours">${u(earned)} <small>USDC ${L.released_}</small></div>
        <div class="sub">${u(pending)} USDC ${L.pendingEsc} · ${L.feeNote}</div><div class="note">${L.paidDirect}</div></section>
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
  const next = (x) => (x.status === 1 || x.status === 2 ? x.tickets.find((t) => !t.used && !t.refunded) : null);
  const doorsOpen = (x) => s.nowTs + 6 * 3600 >= Number(x.showTime) && s.nowTs <= Number(x.showTime) + 86400;
  const qrText = `empowertours://door?venue=${vid}&show=${shows[0]?.id ?? ''}&chain=${CHAIN.id}`;
  const T = T4[state.lang];
  const switcher = s.venues.filter((x) => s.fund.leash.some((l) => s.eq(l.a, x.owner)) || s.eq(x.owner, wallet.address))
    .map((x) => `<a class="chip ${x.id === vid ? 'on' : ''}" href="#/partner/venue/${x.id}">${esc(x.name)}</a>`).join('');
  return { qrText, html: `
  <div class="chips" style="margin-bottom:14px">${switcher}</div>
  <div class="pgrid">
    <div class="col">
      <section class="card"><h3>${esc(v.name)} · ${esc(v.city)}${s.eq(v.owner, wallet.address) ? ` <span class="tag ok">${T.youOwn}</span>` : ''}</h3>
        ${v.meta?.photos?.length ? `<div class="gallery">${v.meta.photos.map((ph) => `<img src="${esc(urlOf(ph))}" alt="">`).join('')}</div>` : ''}
        <div class="kv"><span>${L.capacity}</span><b>${v.capacity}</b><span>${L.terms}</span><b>${v.venueTicketBps ? L.split(Number(v.venueTicketBps) / 100) : L.flat}</b>
          <span>${L.deposit_}</span><b>${u(v.deposit, 0)} USDC</b><span style="text-transform:capitalize">${L.cancelFee}</span><b>${u(v.cancelFee, 0)} USDC</b></div></section>
      <section class="card"><h3>${L.openDates}</h3><div class="cal">${cal}</div>
        <div class="legend" style="margin-top:8px"><span style="--c:#e2f3ee">${L.legendOpen}</span><span style="--c:var(--agave)">${L.legendBooked}</span><span style="--c:#eee">${L.legendClosed}</span></div>
        <div class="actions">${act('openDates', L.openNext7, { id: vid }, { owner: v.owner })}</div></section>
      <section class="card"><h3>${L.requests}</h3>${v.manual ? `<div class="m" style="margin-bottom:8px">✋ ${L.manualOn}</div>` : ''}<div class="list">${shows.map((x) => `
        <div class="row"><div class="ico k2">🎤</div><div><div class="t">${esc(x.title)}</div><div class="m">${s.nameOf(x.artist)}${s.eq(x.artist, x.payer) ? '' : ` · ${s.nameOf(x.payer)}`} · ${dateTime(x.showTime)}</div>
          <div style="margin-top:4px"><span class="tag ${x.status === 2 ? 'ok' : x.status === 1 && !x.pending ? 'held' : x.pending ? 'no' : 'ref'}">${x.pending ? L.awaiting : L.status[x.status]}</span></div>
          ${x.status === 1 ? `<div class="actions">${x.pending ? act('venueAccept', L.venueAccept, { id: x.id }, { owner: v.owner, kind: 'primary' }) + act('venueDecline', L.venueDecline, { id: x.id }, { owner: v.owner })
            : s.nowTs >= Number(x.showTime) ? '' : act('venueCancel', L.venueCancel, { id: x.id }, { owner: v.owner })}</div>` : ''}
          ${x.status === 1 && !x.pending && s.eq(v.owner, wallet.address) && v.iScan ? `<div class="actions">
            ${act('confirmShow', `✅ ${T.confirmShow}`, { id: x.id }, { enabled: s.nowTs + 3600 >= Number(x.showTime), why: T.err.future })}
            ${s.nowTs >= Number(x.showTime) ? act('noShowClaim', `🚫 ${T.noShow}`, { id: x.id }, { kind: 'danger' }) : ''}</div>
            ${s.nowTs >= Number(x.showTime) ? `<div class="note">${T.noShowNote(u(x.cancelFee, 2))}</div>` : ''}` : ''}</div>
          <div class="r">${u(x.deposit, 0)} USDC<div class="m">${x.status === 2 ? L.depositRel : x.status === 3 || x.status === 6 ? L.depositRef : x.status >= 4 ? L.cancelKept : L.held}</div></div></div>`).join('')}</div></section>
      ${stopStats(s, L, v.owner)}
    </div>
    <div class="col">
      <section class="card"><h3>${L.ticketSales}</h3><div class="list">${shows.map((x) => {
        const scanned = x.tickets.filter((t) => t.used).length, refunded = x.tickets.filter((t) => t.refunded).length;
        return `<div><div class="kv"><span>${esc(x.title)}</span><b>${x.sales.sold}/${x.maxTickets} ${L.sold}</b></div>
          <div class="vb"><div style="width:${Math.max(2, (Number(x.sales.sold) * 100) / Math.max(1, Number(x.maxTickets)))}%"></div></div>
          <div class="m">${scanned} ${L.scanned} · ${refunded} ${L.refundedN} · gross ${u(x.sales.gross + BigInt(refunded) * x.ticketPrice)} USDC</div>
          ${next(x) ? `<div class="actions">${act('scanTicket', `📷 ${L.doorScan} #${next(x).id}`, { id: next(x).id }, { enabled: v.iScan && doorsOpen(x), why: v.iScan ? '' : L.scannerOff })}</div>` : ''}</div>`;
      }).join('')}</div>
      <div class="m" style="margin-top:8px">${v.iScan ? `✓ ${L.scannerOn}` : act('venueScanner', L.scannerOff, { id: vid }, { owner: v.owner })}</div></section>
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
        <div class="note">${L.fundNote}</div></section>
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

// The signed-in wallet as an artist: profile, venue browser with date requests, my shows with
// ticket-sale setup, settle, withdraw.
function myArtistView(s, L) {
  const T = T4[state.lang];
  const me = wallet.address;
  const p = s.artistProfiles[me.toLowerCase()];
  const shows = s.shows.filter((x) => s.eq(x.artist, me) || s.eq(x.payer, me));
  const venues = s.venues.filter((v) => v.active && !s.eq(v.owner, me) && v.cal.some((c) => c.open && !c.booked));
  const statusTag = (x) => x.pending ? `<span class="tag no">${T.waitingVenue}</span>` : x.status === 1 && x.ticketPrice === 0n ? `<span class="tag held">${T.noTickets}</span>`
    : x.status === 1 ? `<span class="tag ok">${T.onSaleT}</span>` : x.sales.settled ? `<span class="tag ok">${T.settled}</span>` : `<span class="tag ${x.status === 2 ? 'ok' : 'ref'}">${L.status[x.status]}</span>`;
  return { qrText: null, html: `
  <div class="pgrid">
    <div class="col">
      <section class="card artist-card">${p ? `${p.photo ? `<img class="avatar" src="${esc(urlOf(p.photo))}" alt="">` : '<div class="avatar ico k2">🎤</div>'}
        <div><h3>${esc(p.name)}</h3><div class="m">${esc(p.genre || '')}${p.genre && p.city ? ' · ' : ''}${esc(p.city || '')}</div><div class="sub">${esc(p.bio || '')}</div>
        <div class="actions"><a class="act" href="#/create/artist">✏️ ${T.edit}</a></div></div>`
        : `<div><h3>${T.becomeArtist}</h3><div class="sub">${T.becomeArtistBody}</div><div class="actions"><a class="act primary" href="#/create/artist">🎤 ${T.artistProfile}</a></div></div>`}</section>
      <section class="card" id="my-shows"><h3>${T.myShows}</h3><div class="list">${shows.length ? shows.map((x) => {
        const v = s.venues[Number(x.venueId)];
        const before = s.nowTs < Number(x.showTime);
        return `<div class="row" data-show="${x.id}"><div class="ico k2">🎤</div><div><div class="t">${esc(x.title)} · #${x.id}</div><div class="m">${esc(v.name)} · ${dateTime(x.showTime)} · ${u(x.deposit, 0)} USDC</div>
          <div style="margin-top:4px">${statusTag(x)}</div>
          ${x.status === 1 && !x.pending && x.ticketPrice === 0n && before ? salesForm(s, x) : ''}
          ${x.ticketPrice > 0n ? `<div class="m">${x.sales.sold}/${x.maxTickets} ${L.sold} · ${u(x.ticketPrice)} USDC · ${x.sales.settled ? `${u(x.sales.toArtist)} ${L.toArtist}` : ''}</div>` : ''}
          <div class="actions">${x.status === 2 && !x.sales.settled && x.ticketPrice > 0n ? act('settleShow', `💸 ${T.settle}`, { id: x.id }, { kind: 'primary' }) : ''}
            ${x.status === 1 && before && s.eq(x.payer, me) ? act('artistCancel', T.cancelReq, { id: x.id }, { owner: x.payer }) : ''}</div></div>
          <div class="r">${u(x.sales.gross, 0)} USDC<div class="m">${L.ticketSales}</div></div></div>`;
      }).join('') : `<div class="sub">${T.noShows}</div>`}</div></section>
    </div>
    <div class="col">
      <section class="card" id="venue-browser"><h3>${T.browseVenues}</h3><div class="list">${venues.map((v) => requestForm(s, v)).join('<hr>') || '—'}</div></section>
    </div>
  </div>` };
}

function cta(title, body, links) {
  return `<section class="card cta"><div><h3>${title}</h3><div class="sub">${body}</div></div><div class="actions">${links}</div></section>`;
}

export function renderPartner(s, role, sub) {
  const L = I18N[state.lang];
  const tab = (k, label) => `<a class="chip ${role === k ? 'on' : ''}" href="#/partner/${k}">${label}</a>`;
  const A = s.demo.actors;
  // Partner views follow the signed-in wallet when it owns listings / a venue; otherwise the demo partner.
  const me = wallet.address;
  const hosts = (kind) => me && s.listings.some((l) => l.kind === kind && s.eq(l.host, me));
  // live (testnet) mode has no demo partners: non-partners get only the "become a partner" card
  const live = !!s.demo.live;
  const hostAddr = hosts(1) ? me : A.hostB?.address, guideAddr = hosts(0) ? me : A.guide?.address;
  const myVenue = me ? [...s.venues].reverse().find((v) => s.eq(v.owner, me)) : null;
  const vid = Number(sub ?? myVenue?.id ?? 0);
  const T = T4[state.lang];
  const none = { qrText: null, html: '' };
  const view = role === 'guide' ? (guideAddr ? hostView(s, L, guideAddr) : none)
    : role === 'venue' ? (s.venues[vid] && (!live || myVenue) ? venueView(s, L, vid) : none)
    : role === 'artist' ? (me ? myArtistView(s, L) : live ? none : artistView(s, L))
    : (hostAddr ? hostView(s, L, hostAddr) : none);
  const dn = live ? '' : ` ${T.demoNote}`;
  // Signed in but not (yet) this kind of partner: say how to become one; the demo partner is shown below.
  const top = !me && !live ? '' : role === 'host' && !hosts(1) ? cta(T.becomeHost, `${T.becomeHostBody}${dn}`, `<a class="act primary" href="#/create/listing/stay">${T.newStay}</a><a class="act" href="#/create/listing/tour">${T.newTour}</a>`)
    : role === 'guide' && !hosts(0) ? cta(T.becomeHost, `${T.becomeHostBody}${dn}`, `<a class="act primary" href="#/create/listing/tour">${T.newTour}</a><a class="act" href="#/create/listing/stay">${T.newStay}</a>`)
    : role === 'artist' && !me ? cta(T.becomeArtist, T.becomeArtistBody, `<a class="act primary" href="#/create/artist">🎤 ${T.artistProfile}</a>`)
    : role === 'venue' && !myVenue ? cta(T.becomeVenue, `${T.becomeVenueBody}${dn}`, `<a class="act primary" href="#/create/venue">${T.newVenue}</a>`)
    : role === 'venue' ? `<div class="h-actions" style="margin-bottom:10px"><a class="act small" href="#/create/venue">${T.newVenue}</a></div>` : '';
  const nm = (a) => (a ? s.nameOf(a) : '');
  const who = { host: nm(hostAddr), guide: nm(guideAddr), venue: s.venues[vid]?.name, artist: me ? (s.artistProfiles[me.toLowerCase()]?.name || s.nameOf(me)) : A.artist?.name }[role] || (hostAddr ? s.nameOf(hostAddr) : '');
  return { qrText: view.qrText, html: `
    <section class="card dest-hero"><div><div class="dest">${L.partnerTitle}</div><div class="sub">${esc(who)}</div></div>
      <div class="chips">${tab('host', L.roleHost)}${tab('guide', L.roleGuide)}${tab('venue', L.roleVenue)}${tab('artist', L.roleArtist)}<span class="sub" style="margin-left:auto">${me ? `${L.actingAs} ${esc(wallet.label || '')} ${short(me)}` : L.viewing}</span></div></section>
    ${top}
    ${view.html}` };
}
