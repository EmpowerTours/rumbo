import { I18N } from './i18n.js';
import { state, u, p, date, dateTime, esc } from './fmt.js';
import { short } from './data.js';
import { act } from './act.js';
import { wallet } from './auth/wallet.js';
import { renderSignIn } from './signin.js';
import { walletCard, noteCard } from './walletcard.js';
const ICONS = ['🧭', '🗺️', '🎨', '🎤'];

const NOVAULT = {
  en: { h: 'No trip vault yet', p: 'Book stays, tours and shows from Destinations; your bookings, tickets and $TOURS points show up here.', go: 'Browse destinations' },
  es: { h: 'Aún no hay bóveda de viaje', p: 'Reserva estancias, tours y shows en Destinos; tus reservas, boletos y puntos $TOURS aparecen aquí.', go: 'Ver destinos' },
};
const noVault = () => { const N = NOVAULT[state.lang] || NOVAULT.en; return `<div><h3>${N.h}</h3><div class="sub">${N.p}</div><div class="actions" style="margin-top:12px"><a class="act primary" href="#/destination/oaxaca">${N.go}</a></div></div>`; };

export function renderTrip(s) {
  const L = I18N[state.lang];
  const t = s.trip;
  const myVisits = s.visitsAll.filter((e) => s.eq(e.args.user, s.user));
  const rewardsSum = myVisits.reduce((a, e) => a + e.args.reward, 0n);
  const ownIdx = t.contribs.findIndex((c) => s.eq(c, s.user));
  const ownPrincipal = ownIdx >= 0 ? t.principals[ownIdx] : 0n;
  const friendsPrincipal = t.principals.reduce((a, x) => a + x, 0n) - ownPrincipal;
  const own = ownPrincipal - rewardsSum;
  const funded = t.assets + t.spent;
  const seg = (x) => (t.goal ? `${Math.max(0, Number((x * 10000n) / t.goal) / 100)}%` : '0%');
  const days = Number(s.streak.current);
  const dots = [...Array(14).keys()].map((i) => `<i class="${i < days ? 'on' : ''}"></i>`).join('');
  const toursSpent = s.redeemed.reduce((a, e) => a + e.args.price, 0n);
  const statusTag = (st) => (st === 2 ? `<span class="tag ok">✓ ${L.released}</span>` : st === 3 ? `<span class="tag ref">↩ ${L.refunded}</span>` : `<span class="tag held">${L.held}</span>`);
  const books = s.bookings.filter((b) => (t.address && s.eq(b.payer, t.address)) || s.eq(b.payer, s.user));
  const capOf = (price) => (price * BigInt(s.resale.capBps)) / 10000n;
  const myTickets = s.shows.flatMap((sh) => sh.tickets.filter((tk) => s.eq(tk.holder, s.user)).map((tk) => ({ tk, sh })));
  const tAct = ({ tk, sh }) => (tk.used || tk.refunded || sh.status !== 1 ? '' : tk.ask > 0n
    ? `<div class="m"><span class="tag held">${L.listedAt(u(tk.ask))}</span></div><div class="actions">${act('cancelResale', L.unlist, { id: tk.id })}</div>`
    : `<div class="actions">${act('listResale', L.listCap(u(capOf(tk.price))), { id: tk.id, price: capOf(tk.price) }, { enabled: !sh.started, why: L.resaleRule(s.resale.capBps / 100, s.resale.royaltyBps / 100) })}</div>`);
  const tTag = ({ tk, sh }) => tk.refunded ? `<span class="tag ref">↩ ${L.status[sh.status]} · ${L.refundedN}</span>` : tk.used ? `<span class="tag ok">✓ ${L.scanned} · +${p(s.scans.find((e) => e.args.ticketId === tk.id)?.args.tours ?? 0n)} $TOURS</span>` : `<span class="tag held">${L.status[sh.status]}</span>`;
  const f = s.fund;
  const top = wallet.account
    ? `<div class="grid2">${walletCard(s)}${noteCard()}</div>`
    : `<div class="grid2">${renderSignIn(s)}<section class="card"><div class="sub">${s.demo.live ? L.viewingLive : L.viewing}</div></section></div>`;
  return `${top}
    <div class="grid">
      <section class="card hero">
        ${!t.address ? noVault() : `
        <div>
          <h3>${L.title}</h3>
          <div class="dest">${esc(t.dest)}</div>
          <div class="sub">${L.vaultAddr} ${short(t.address)} · ${L.contributors}: ${t.contribs.map(s.nameOf).join(', ')}</div>
          <div style="margin-top:16px" class="big">${(Number(t.bps) / 100).toFixed(0)}% <small>${L.funded} · ${u(funded, 0)} ${L.of} ${u(t.goal, 0)} USDC</small></div>
          <div class="bar">
            <div class="seg-own" style="width:${seg(own)}"></div><div class="seg-friends" style="width:${seg(friendsPrincipal)}"></div>
            <div class="seg-rewards" style="width:${seg(rewardsSum)}"></div><div class="seg-yield" style="width:${seg(t.yld)}"></div>
          </div>
          <div class="legend">
            <span style="--c:var(--terracotta)">${L.own} <b>${u(own)}</b></span>
            <span style="--c:var(--jacaranda)">${L.friends} <b>${u(friendsPrincipal)}</b></span>
            <span style="--c:var(--marigold)">${L.rewards} <b>${u(rewardsSum)}</b> · ${myVisits.length} ${L.visits}</span>
            <span style="--c:var(--agave)">${L.yield} <b>${u(t.yld)}</b></span>
          </div>
          <div class="note">${L.spentNote(u(t.spent), u(t.assets))}</div>
          <div class="actions">${act('contribute', L.contribute, { amt: 25 }, { kind: 'primary' })}</div>
        </div>
        `}
        <div class="streak">
          <div class="num">🔥 ${days} <span style="font-size:20px;font-weight:700">${L.streak}</span></div>
          <div class="dots">${dots}</div>
          <div class="sub">${L.streakSub(s.streak.best, s.streak.daysVisited)}</div>
          <div class="note">${L.keep(days + 1)}</div>
        </div>
      </section>
      <div class="col">
        <section class="card">
          <h3>${L.stops}</h3>
          <div class="list">${s.camps.map((c) => `
            <div class="row"><div class="ico k${c.kind}">${ICONS[c.kind]}</div>
              <div><div class="t">${esc(c.name)}</div><div class="m">${L.kinds[c.kind]} · ${L.by} ${s.nameOf(c.sponsor)} · ${c.totalVisits} ${L.visits}</div></div>
              <div class="r">+${u(c.rewardPerVisit)} USDC<div class="m">+${p(c.toursPerVisit)} $TOURS · ${u(c.budget, 0)} ${L.left}</div>
                ${import.meta.env.DEV ? act('checkin', '📍', { id: c.id }, { kind: 'mini', why: L.checkInDev }) : ''}</div></div>`).join('')}
          </div>
        </section>
        <section class="card">
          <h3>${L.bookings}</h3>
          <div class="list">${books.map((b) => { const l = s.listings[Number(b.listingId)]; return `
            <div class="row"><div class="ico ${l.kind === 0 ? 'k1' : 'k0'}">${l.kind === 0 ? '🚐' : '🏡'}</div>
              <div><div class="t">${esc(l.title)}</div><div class="m">${s.nameOf(b.host)} · ${b.units} ${l.kind === 0 ? L.people : L.nights} · ${date(b.startAt)}</div>
                <div style="margin-top:4px">${statusTag(b.status)}${b.status === 1 && b.accepted ? ` <span class="tag ok">${L.accepted}</span>` : ''}</div>
                ${b.status === 1 ? `<div class="actions">${s.eq(b.payer, s.user) ? act('confirmDirect', L.confirmArrival, { id: b.id }, { enabled: s.nowTs >= Number(b.startAt) }) : act('confirmStay', L.confirmArrival, { id: b.id }, { owner: t.owner, enabled: s.nowTs >= Number(b.startAt) })}</div>` : ''}
                ${b.rating ? `<div class="m" style="margin-top:6px"><span class="stars">${'★'.repeat(b.rating)}</span> ${L.review}: “${esc(s.demo.reviews[String(b.id)] || '')}” <span class="hash">${b.reviewHash.slice(0, 18)}…</span></div>` : ''}
              </div>
              <div class="r">${u(b.amount)} USDC</div></div>`; }).join('')}
          </div>
        </section>
        <section class="card">
          <h3>${L.myTickets}</h3>
          <div class="list">${myTickets.map((x) => `
            <div class="row"><div class="ico k3">🎟️</div>
              <div><div class="t">${esc(x.sh.title)}</div><div class="m">${esc(s.venues[Number(x.sh.venueId)].name)} · ${dateTime(x.sh.showTime)} · #${x.tk.id}</div>
                <div style="margin-top:4px">${tTag(x)}</div>${tAct(x)}</div>
              <div class="r">${u(x.tk.price)} USDC</div></div>`).join('')}
          </div>
        </section>
      </div>
      <div class="col">
        <section class="card">
          <h3>${L.tours}</h3>
          <div class="tours">${p(s.toursBal)} <small>$TOURS</small></div>
          <div class="sub">${p(s.toursBal + toursSpent)} ${L.earned} · ${p(toursSpent)} ${L.spentPts}</div>
          <div class="note">${L.toursNote}</div>
        </section>
        <section class="card">
          <h3>${L.perks}</h3>
          <div class="list">${s.perks.map(({ id: perkId, p: k, mine }) => `
            <div class="row"><div class="ico k${k.burn ? 3 : 1}">${k.burn ? '🎟️' : '🥃'}</div>
              <div><div class="t">${esc(k.title)}</div><div class="m">${esc(k.partnerName)} · ${k.remaining} ${L.remaining} · ${k.burn ? L.burn : L.toPartner}</div>
                ${mine > 0 ? `<div style="margin-top:4px"><span class="tag ok">✓ ${L.redeemed}</span></div>` : ''}</div>
              <div class="r">${p(k.price)}<div class="m">$TOURS</div>${act('redeem', L.redeem, { id: perkId }, { kind: 'mini', enabled: s.toursBal >= k.price && k.remaining > 0 && (Number(k.maxPerUser) === 0 || Number(mine) < Number(k.maxPerUser)) })}</div></div>`).join('')}
          </div>
        </section>
        ${t.address ? `
        <section class="card leash">
          <h3>${L.leash}</h3>
          <div class="note" style="margin:0 0 10px">${L.leashSub}</div>
          <div class="list">${t.leash.map((x) => `
            <div><div class="kv"><span>${s.nameOf(x.a)}</span><b>${u(x.spent, 0)} / ${u(x.cap, 0)} USDC</b></div>
              <div class="vb"><div style="width:${x.cap ? Number((x.spent * 100n) / x.cap) : 0}%"></div></div></div>`).join('')}
          </div>
          <div class="kv" style="margin-top:12px"><span>${L.totalCap}</span><b>${u(t.spent, 0)} / ${u(t.totalCap, 0)} USDC</b>
            <span>${L.window}</span><b>${date(t.start)} → ${date(t.end)}</b></div>
        </section>
        ` : ''}
        ${f.address ? `
        <section class="card">
          <h3>${L.backing}</h3>
          <div class="t" style="font-weight:700">${esc(f.dest)}</div>
          <div class="bar" style="height:10px"><div class="seg-friends" style="width:${Math.min(100, Number(((f.assets + f.spent) * 100n) / f.goal))}%"></div></div>
          <div class="kv"><span>${L.backed}</span><b>${u(f.principals[f.contribs.findIndex((c) => s.eq(c, s.user))] || 0n)} USDC</b><span>${L.artistSpent}</span><b>${u(f.spent)} USDC</b><span>${L.claimable}</span><b>${p(s.fundClaimable)} $TOURS</b></div>
          <div class="note">${L.backNote}</div>
          <div class="actions">${act('claimBacking', L.claimBacking, {}, { enabled: s.fundClaimable > 0n })}</div>
        </section>
        ` : ''}
      </div>
    </div>`;
}
