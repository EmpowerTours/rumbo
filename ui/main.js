import { createPublicClient, http, parseAbi, formatUnits } from 'viem';

const I18N = {
  en: {
    title: 'Your trip saves itself while you play', funded: 'funded', of: 'of', goal: 'goal',
    own: 'You saved', friends: 'Friends chipped in', rewards: 'Visit rewards', yield: 'Yield earned', spent: 'Spent on bookings',
    streak: 'day streak', streakSub: (b, d) => `Best ${b} days · ${d} days with a proved visit`, keep: (n) => `Visit any stop tomorrow to make it ${n}`,
    tours: '$TOURS points', toursNote: 'Loyalty points for partner perks. Not an investment: they are earned by visiting and backing artists, and spent on perks.',
    earned: 'earned', spentPts: 'spent on perks', stops: 'Nearby stops today', perVisit: 'per visit', visits: 'visits', left: 'left', by: 'sponsored by',
    perks: 'Perks', redeemed: 'Redeemed', remaining: 'left', burn: 'points burned', toPartner: 'points go to partner',
    bookings: 'Bookings (escrow)', released: 'Released to host', refunded: 'Refunded · host cancelled', held: 'Held in escrow', review: 'Review anchored',
    leash: 'Leash', leashSub: 'The vault can only pay these vendors, up to these limits, inside the trip window. Not even EmpowerTours can move it elsewhere.',
    window: 'Trip window', totalCap: 'Total cap', contributors: 'Contributors', local: 'Solonet · local only', kinds: ['Hunt cache', 'Guide spot', 'Artist mural', 'Artist show'],
    nights: 'nights', people: 'people', vaultAddr: 'Vault', footer: 'Local prototype on Monad Solonet (chain 20143). Mock USDC. Nothing here is public.',
    backing: 'Artist you back', backed: 'You backed', artistSpent: 'Spent on the tour so far', claimable: 'Points unlocked',
    backNote: 'Backers get perks and $TOURS as the tour money is actually spent, never a share of profits.',
    spentNote: (a, b) => `Of that, ${a} USDC already went to bookings through escrow; ${b} USDC is still in the vault earning yield.`,
  },
  es: {
    title: 'Tu viaje se ahorra solo mientras juegas', funded: 'financiado', of: 'de', goal: 'meta',
    own: 'Tú ahorraste', friends: 'Aportes de amigos', rewards: 'Recompensas por visitas', yield: 'Rendimiento', spent: 'Gastado en reservas',
    streak: 'días seguidos', streakSub: (b, d) => `Mejor racha ${b} días · ${d} días con visita comprobada`, keep: (n) => `Visita cualquier parada mañana para llegar a ${n}`,
    tours: 'Puntos $TOURS', toursNote: 'Puntos de lealtad para beneficios con aliados. No son una inversión: se ganan visitando y apoyando artistas, y se usan en beneficios.',
    earned: 'ganados', spentPts: 'usados en beneficios', stops: 'Paradas cercanas hoy', perVisit: 'por visita', visits: 'visitas', left: 'restante', by: 'patrocina',
    perks: 'Beneficios', redeemed: 'Canjeado', remaining: 'disponibles', burn: 'los puntos se queman', toPartner: 'los puntos van al aliado',
    bookings: 'Reservas (en garantía)', released: 'Liberado al anfitrión', refunded: 'Reembolsado · el anfitrión canceló', held: 'En garantía', review: 'Reseña anclada',
    leash: 'Correa', leashSub: 'La bóveda solo puede pagar a estos proveedores, hasta estos límites y dentro de las fechas del viaje. Ni EmpowerTours puede moverla a otro lado.',
    window: 'Fechas del viaje', totalCap: 'Límite total', contributors: 'Aportantes', local: 'Solonet · solo local', kinds: ['Cache de Hunt', 'Punto del guía', 'Mural de artista', 'Show de artista'],
    nights: 'noches', people: 'personas', vaultAddr: 'Bóveda', footer: 'Prototipo local en Monad Solonet (cadena 20143). USDC de prueba. Nada de esto es público.',
    backing: 'Artista que apoyas', backed: 'Tu apoyo', artistSpent: 'Gastado en la gira', claimable: 'Puntos desbloqueados',
    backNote: 'Quien apoya recibe beneficios y $TOURS conforme el dinero de la gira se gasta de verdad, nunca una parte de las ganancias.',
    spentNote: (a, b) => `De eso, ${a} USDC ya se pagaron en reservas con garantía; ${b} USDC siguen en la bóveda generando rendimiento.`,
  },
};
const ICONS = ['🧭', '🗺️', '🎨', '🎤'];
let lang = new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'en';

const rpc = new URL('/rpc', location.href).toString();
const client = createPublicClient({ transport: http(rpc) });
const VAULT = parseAbi([
  'function totalAssets() view returns (uint256)', 'function totalSpent() view returns (uint256)', 'function goal() view returns (uint256)',
  'function progressBps() view returns (uint256)', 'function yieldEarned() view returns (uint256)', 'function destination() view returns (string)',
  'function principalOf(address) view returns (uint256)', 'function contributors() view returns (address[])', 'function vendors() view returns (address[])',
  'function vendorCap(address) view returns (uint256)', 'function vendorSpent(address) view returns (uint256)', 'function totalCap() view returns (uint256)',
  'function startTime() view returns (uint64)', 'function endTime() view returns (uint64)', 'function owner() view returns (address)',
]);
const REWARDS = parseAbi([
  'function streakOf(address) view returns (uint32 lastDay, uint32 current, uint32 best, uint32 daysVisited)',
  'function campaignCount() view returns (uint256)',
  'function getCampaign(uint256) view returns ((address sponsor, address rewardToken, uint128 rewardPerVisit, uint128 toursPerVisit, uint128 budget, uint32 dailyCap, uint32 totalVisits, uint8 kind, bool active, bytes32 locationId, string name))',
  'event VisitRewarded(uint256 indexed campaignId, address indexed user, address indexed vault, uint256 reward, uint256 tours, uint32 streak, bytes32 visitId)',
  'event BackingRewarded(address indexed vault, address indexed backer, uint256 tours)',
  'function backingClaimable(address vault, address backer) view returns (uint256)',
]);
const TOURS = parseAbi(['function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)']);
const PERKS = parseAbi([
  'function perkCount() view returns (uint256)', 'function redeemedBy(uint256, address) view returns (uint16)',
  'function getPerk(uint256) view returns ((address partner, uint128 price, uint32 remaining, uint32 redeemed, uint16 maxPerUser, bool burn, bool active, string title, string partnerName))',
  'event Redeemed(uint256 indexed redemptionId, uint256 indexed perkId, address indexed user, address partner, uint256 price, bool burned)',
]);
const BOOK = parseAbi([
  'function bookingsOf(address) view returns (uint256[])',
  'function getBooking(uint256) view returns ((uint64 listingId, uint64 startAt, uint32 units, uint16 feeBps, uint64 noShowTimeout, uint8 status, uint8 rating, address payer, address host, address asset, uint256 amount, uint64 cancelWindow, bytes32 reviewHash))',
  'function getListing(uint256) view returns ((address host, address asset, uint128 pricePerUnit, uint32 maxUnits, uint8 kind, bool active, uint64 cancelWindow, uint32 completed, uint32 reviewCount, uint32 ratingSum, string title, string place))',
]);

const u = (x, d = 2) => Number(formatUnits(x, 6)).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const p = (x) => Number(formatUnits(x, 18)).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 0 });
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const date = (ts) => new Date(Number(ts) * 1000).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' });

// Solonet's RPC caps eth_getLogs ranges, so scan in windows.
async function logs(params, fromBlock) {
  const head = await client.getBlockNumber();
  const out = [];
  for (let b = BigInt(fromBlock); b <= head; b += 900n) {
    const to = b + 899n > head ? head : b + 899n;
    out.push(...(await client.getContractEvents({ ...params, fromBlock: b, toBlock: to })));
  }
  return out;
}

async function load() {
  const [dep, demo] = await Promise.all([fetch('./deployments.json').then((r) => r.json()), fetch('./demo-state.json').then((r) => r.json())]);
  const user = demo.actors.traveler.address;
  const nameOf = (addr) => Object.values(demo.actors).find((a) => a.address.toLowerCase() === addr.toLowerCase())?.name.replace(/ \(.*\)/, '') || short(addr);
  const v = { address: demo.vault, abi: VAULT };
  const r = (c, functionName, args = []) => client.readContract({ ...c, functionName, args });
  const [assets, spent, goal, bps, yld, dest, contribs, vendors, totalCap, start, end] = await Promise.all([
    r(v, 'totalAssets'), r(v, 'totalSpent'), r(v, 'goal'), r(v, 'progressBps'), r(v, 'yieldEarned'), r(v, 'destination'),
    r(v, 'contributors'), r(v, 'vendors'), r(v, 'totalCap'), r(v, 'startTime'), r(v, 'endTime')]);
  const principals = await Promise.all(contribs.map((c) => r(v, 'principalOf', [c])));
  const rw = { address: dep.rewards, abi: REWARDS };
  const visits = await logs({ ...rw, eventName: 'VisitRewarded', args: { user } }, demo.fromBlock);
  const rewardsSum = visits.reduce((a, e) => a + e.args.reward, 0n);
  const ownPrincipal = principals[contribs.findIndex((c) => c.toLowerCase() === user.toLowerCase())] || 0n;
  const friendsPrincipal = principals.reduce((a, x) => a + x, 0n) - ownPrincipal;
  const [, cur, best, daysVisited] = await r(rw, 'streakOf', [user]);
  const streak = { current: cur, best, daysVisited };
  const ncamp = Number(await r(rw, 'campaignCount'));
  const camps = await Promise.all([...Array(ncamp).keys()].map((i) => r(rw, 'getCampaign', [BigInt(i)])));
  const tours = { address: dep.tours, abi: TOURS };
  const toursBal = await r(tours, 'balanceOf', [user]);
  const pk = { address: dep.perks, abi: PERKS };
  const nperk = Number(await r(pk, 'perkCount'));
  const perks = await Promise.all([...Array(nperk).keys()].map(async (i) => ({ id: i, p: await r(pk, 'getPerk', [BigInt(i)]), mine: await r(pk, 'redeemedBy', [BigInt(i), user]) })));
  const redeemed = await logs({ ...pk, eventName: 'Redeemed', args: { user } }, demo.fromBlock);
  const toursSpent = redeemed.reduce((a, e) => a + e.args.price, 0n);
  const bk = { address: dep.bookings, abi: BOOK };
  const ids = await r(bk, 'bookingsOf', [demo.vault]);
  const books = await Promise.all(ids.map(async (id) => { const b = await r(bk, 'getBooking', [id]); return { id, b, l: await r(bk, 'getListing', [b.listingId]) }; }));
  const leash = await Promise.all(vendors.map(async (a) => ({ a, cap: await r(v, 'vendorCap', [a]), spent: await r(v, 'vendorSpent', [a]) })));
  const av = { address: demo.artistVault, abi: VAULT };
  const artist = { dest: await r(av, 'destination'), mine: await r(av, 'principalOf', [user]), assets: await r(av, 'totalAssets'), spent: await r(av, 'totalSpent'), goal: await r(av, 'goal'), claimable: await r(rw, 'backingClaimable', [demo.artistVault, user]) };
  return { dep, demo, nameOf, assets, spent, goal, bps, yld, dest, contribs, principals, rewardsSum, ownPrincipal, friendsPrincipal, streak, camps, toursBal, toursSpent, perks, books, leash, totalCap, start, end, visits, artist };
}

function render(s) {
  const L = I18N[lang];
  const funded = s.assets + s.spent;
  const own = s.ownPrincipal - s.rewardsSum;
  const seg = (x) => `${Math.max(0, Number(x * 10000n / s.goal) / 100)}%`;
  const pct = (Number(s.bps) / 100).toFixed(0);
  const days = Number(s.streak.current);
  const dots = [...Array(14).keys()].map((i) => `<i class="${i < days ? 'on' : ''}"></i>`).join('');
  const toursEarned = s.toursBal + s.toursSpent;
  const statusTag = (st) => st === 2 ? `<span class="tag ok">✓ ${L.released}</span>` : st === 3 ? `<span class="tag ref">↩ ${L.refunded}</span>` : `<span class="tag held">${L.held}</span>`;
  const reviewText = (id) => s.demo.reviews[String(id)];
  document.documentElement.lang = lang;
  document.getElementById('app').innerHTML = `
  <div class="wrap">
    <header>
      <div class="logo"><div class="mark"></div>EmpowerTours</div>
      <span class="pill">${L.local}</span>
      <div class="spacer"></div>
      <span class="who">${s.nameOf(s.demo.actors.traveler.address)} · ${short(s.demo.actors.traveler.address)}</span>
      <div class="lang"><button data-l="en" class="${lang === 'en' ? 'on' : ''}">EN</button><button data-l="es" class="${lang === 'es' ? 'on' : ''}">ES</button></div>
    </header>
    <div class="grid">
      <section class="card hero">
        <div>
          <h3>${L.title}</h3>
          <div class="dest">${s.dest}</div>
          <div class="sub">${L.vaultAddr} ${short(s.demo.vault)} · ${L.contributors}: ${s.contribs.map(s.nameOf).join(', ')}</div>
          <div style="margin-top:16px" class="big">${pct}% <small>${L.funded} · ${u(funded, 0)} ${L.of} ${u(s.goal, 0)} USDC</small></div>
          <div class="bar">
            <div class="seg-own" style="width:${seg(own)}"></div><div class="seg-friends" style="width:${seg(s.friendsPrincipal)}"></div>
            <div class="seg-rewards" style="width:${seg(s.rewardsSum)}"></div><div class="seg-yield" style="width:${seg(s.yld)}"></div>
          </div>
          <div class="legend">
            <span style="--c:var(--terracotta)">${L.own} <b>${u(own)}</b></span>
            <span style="--c:var(--jacaranda)">${L.friends} <b>${u(s.friendsPrincipal)}</b></span>
            <span style="--c:var(--marigold)">${L.rewards} <b>${u(s.rewardsSum)}</b> · ${s.visits.length} ${L.visits}</span>
            <span style="--c:var(--agave)">${L.yield} <b>${u(s.yld)}</b></span>
          </div>
          <div class="note">${L.spentNote(u(s.spent), u(s.assets))}</div>
        </div>
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
              <div><div class="t">${c.name}</div><div class="m">${L.kinds[c.kind]} · ${L.by} ${s.nameOf(c.sponsor)} · ${c.totalVisits} ${L.visits}</div></div>
              <div class="r">+${u(c.rewardPerVisit)} USDC<div class="m">+${p(c.toursPerVisit)} $TOURS · ${u(c.budget, 0)} ${L.left}</div></div></div>`).join('')}
          </div>
        </section>
        <section class="card">
          <h3>${L.bookings}</h3>
          <div class="list">${s.books.map(({ id, b, l }) => `
            <div class="row"><div class="ico ${l.kind === 0 ? 'k1' : 'k0'}">${l.kind === 0 ? '🚐' : '🏡'}</div>
              <div><div class="t">${l.title}</div><div class="m">${s.nameOf(b.host)} · ${b.units} ${l.kind === 0 ? L.people : L.nights} · ${date(b.startAt)}</div>
                <div style="margin-top:4px">${statusTag(b.status)}</div>
                ${b.rating ? `<div class="m" style="margin-top:6px"><span class="stars">${'★'.repeat(b.rating)}</span> ${L.review}: “${reviewText(id) || ''}” <span class="hash">${b.reviewHash.slice(0, 18)}…</span></div>` : ''}
              </div>
              <div class="r">${u(b.amount)} USDC</div></div>`).join('')}
          </div>
        </section>
      </div>
      <div class="col">
        <section class="card">
          <h3>${L.tours}</h3>
          <div class="tours">${p(s.toursBal)} <small>$TOURS</small></div>
          <div class="sub">${p(toursEarned)} ${L.earned} · ${p(s.toursSpent)} ${L.spentPts}</div>
          <div class="note">${L.toursNote}</div>
        </section>
        <section class="card">
          <h3>${L.perks}</h3>
          <div class="list">${s.perks.map(({ p: k, mine }) => `
            <div class="row"><div class="ico k${k.burn ? 3 : 1}">${k.burn ? '🎟️' : '🥃'}</div>
              <div><div class="t">${k.title}</div><div class="m">${k.partnerName} · ${k.remaining} ${L.remaining} · ${k.burn ? L.burn : L.toPartner}</div>
                ${mine > 0 ? `<div style="margin-top:4px"><span class="tag ok">✓ ${L.redeemed}</span></div>` : ''}</div>
              <div class="r">${p(k.price)}<div class="m">$TOURS</div></div></div>`).join('')}
          </div>
        </section>
        <section class="card leash">
          <h3>${L.leash}</h3>
          <div class="note" style="margin:0 0 10px">${L.leashSub}</div>
          <div class="list">${s.leash.map((x) => `
            <div><div class="kv"><span>${s.nameOf(x.a)}</span><b>${u(x.spent, 0)} / ${u(x.cap, 0)} USDC</b></div>
              <div class="vb"><div style="width:${x.cap ? Number(x.spent * 100n / x.cap) : 0}%"></div></div></div>`).join('')}
          </div>
          <div class="kv" style="margin-top:12px"><span>${L.totalCap}</span><b>${u(s.spent, 0)} / ${u(s.totalCap, 0)} USDC</b>
            <span>${L.window}</span><b>${date(s.start)} → ${date(s.end)}</b></div>
        </section>
        <section class="card">
          <h3>${L.backing}</h3>
          <div class="t" style="font-weight:700">${s.artist.dest}</div>
          <div class="bar" style="height:10px"><div class="seg-friends" style="width:${Number((s.artist.assets + s.artist.spent) * 100n / s.artist.goal)}%"></div></div>
          <div class="kv"><span>${L.backed}</span><b>${u(s.artist.mine)} USDC</b><span>${L.artistSpent}</span><b>${u(s.artist.spent)} USDC</b><span>${L.claimable}</span><b>${p(s.artist.claimable)} $TOURS</b></div>
          <div class="note">${L.backNote}</div>
        </section>
      </div>
    </div>
    <footer>${L.footer}</footer>
  </div>`;
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.l; render(s); }));
  document.body.dataset.ready = '1';
}

load().then(render).catch((e) => {
  document.getElementById('app').innerHTML = `<div class="loading">Could not reach Solonet: ${e.message}</div>`;
  console.error(e);
});
