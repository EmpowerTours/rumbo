import { loadAll, short } from './src/data.js';
import { I18N } from './src/i18n.js';
import { state, esc } from './src/fmt.js';
import { renderTrip } from './src/trip.js';
import { renderDest, bindDest } from './src/dest.js';
import { renderPartner, qrSvg } from './src/partner.js';
import { DESTINATIONS } from './src/destinations.js';
import { wallet, onWalletChange } from './src/auth/wallet.js';
import { bindSignIn, devSignIn, renderSignIn } from './src/signin.js';
import { bindWalletCard } from './src/walletcard.js';
import { runAction } from './src/actions.js';
import { feeCtx, mon, ACTION_GAS } from './src/gas.js';
import { listingForm, venueForm, artistForm, bindForms } from './src/forms.js';
import { T4 } from './src/i18n4.js';

let data;
let busy = false;
let acting = false;
const route = () => { const h = (location.hash || '#/trip').slice(2).split('/'); return { page: h[0] || 'trip', a: h[1], b: h[2] }; };

async function reload() { data = await loadAll(wallet.address); }

// Small MON balance indicator next to the wallet chip. Green when it covers a typical action.
function monChip(L) {
  const typical = BigInt(ACTION_GAS.buyTicket) * feeCtx.maxFeePerGas;
  const ok = feeCtx.mon >= typical;
  return `<span class="mon-chip ${ok ? 'ok' : ''}" id="mon-chip" title="${esc(L.monChip)}">⛽ ${mon(feeCtx.mon, 3)} MON</span>`;
}

async function render() {
  const L = I18N[state.lang];
  const r = route();
  const create = r.page === 'create';
  const partner = r.page === 'partner' || create;
  const nav = partner ? '' : `<nav class="nav"><a class="${r.page === 'trip' ? 'on' : ''}" href="#/trip">${L.navTrip}</a>${DESTINATIONS.slice().reverse().map((d) =>
    `<a class="${r.page === 'destination' && (r.a || 'oaxaca') === d.slug ? 'on' : ''}" href="#/destination/${d.slug}">${esc(d.name[state.lang].split(' · ')[0].replace(' de Juárez', ''))}</a>`).join('')}</nav>`;
  let body, qrText = null;
  if (r.page === 'destination') body = renderDest(data, r.a || 'oaxaca');
  else if (create) body = !wallet.account ? `<section class="card"><div class="sub">${T4[state.lang].signInFirst}</div></section>`
    : r.a === 'venue' ? venueForm(data) : r.a === 'artist' ? artistForm(data) : listingForm(data, r.b || 'stay');
  else if (partner) ({ html: body, qrText } = renderPartner(data, r.a || 'host', r.b));
  else body = renderTrip(data);
  const chip = wallet.account
    ? `<span class="who wallet-chip ${wallet.kind}">${wallet.kind === 'passkey' ? '🔑' : '🧪 DEV'} ${wallet.kind === 'dev' ? esc(wallet.label.replace(/ \(.*\)/, '')) + ' · ' : ''}${short(wallet.address)}</span>${monChip(L)}`
    : `<button class="act primary" id="hdr-signin">${L.signInCta}</button>`;
  document.documentElement.lang = state.lang;
  document.title = L.docTitle;
  document.getElementById('app').innerHTML = `
  <div class="wrap">
    <header>
      <div class="logo"><div class="mark"></div><div class="brand"><span class="name">Rumbo</span><span class="by">${L.byLine}</span></div></div>
      <span class="pill">${L.local}</span>
      <div class="mode"><a class="${partner ? '' : 'on'}" href="#/trip">${L.traveler}</a><a class="${partner ? 'on' : ''}" href="#/partner/host">${L.partner}</a></div>
      ${nav}
      <div class="spacer"></div>
      ${chip}
      <div class="lang"><button data-l="en" class="${state.lang === 'en' ? 'on' : ''}">EN</button><button data-l="es" class="${state.lang === 'es' ? 'on' : ''}">ES</button></div>
    </header>
    ${partner && !wallet.account ? `<div class="grid2">${renderSignIn(data)}</div>` : ''}
    ${body}
    <footer>${L.footer}</footer>
  </div>`;
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => { state.lang = b.dataset.l; render(); }));
  document.getElementById('hdr-signin')?.addEventListener('click', () => { if (route().page !== 'trip' && route().page !== 'partner') location.hash = '#/trip'; setTimeout(() => document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth' }), 50); });
  bindSignIn(data, render);
  bindWalletCard(render);
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    acting = true; // an action may navigate (e.g. to the new listing); this handler re-reads + renders once for it
    document.body.dataset.ready = '';
    document.querySelectorAll('[data-act]').forEach((x) => { x.disabled = true; });
    b.classList.add('working');
    try { await runAction(b.dataset.act, { ...b.dataset }, data); } catch (e) { console.warn(b.dataset.act, e.revertName || e.message); }
    busy = false;
    try { await reload(); } catch (e) { console.error(e); }
    await render();
    acting = false;
    document.body.dataset.actions = String(Number(document.body.dataset.actions || 0) + 1); // test hook: action + refresh finished
  }));
  if (r.page === 'destination') bindDest(render);
  bindForms(render);
  if (qrText && document.getElementById('qr')) document.getElementById('qr').innerHTML = await qrSvg(qrText);
  document.body.dataset.ready = '1';
  document.body.dataset.wallet = wallet.kind || '';
}

// every navigation re-reads the chain (show times pass, venues accept, …) so buttons reflect the current state
window.addEventListener('hashchange', async () => { if (acting) return; document.body.dataset.ready = ''; try { await reload(); } catch (e) { console.warn(e.message); } await render(); window.scrollTo(0, 0); });
onWalletChange(async () => { document.body.dataset.ready = ''; document.body.dataset.wallet = ''; await reload(); render(); });

(async () => {
  try {
    await reload();
    // DEV ONLY: ?dev=<actor> signs in with a Solonet test account (headless tests + screenshots).
    const devKey = import.meta.env.DEV ? new URLSearchParams(location.search).get('dev') : null;
    if (devKey) await devSignIn(devKey, data); else await render();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="loading">Could not reach Solonet: ${esc(e.message)}</div>`;
    console.error(e);
  }
})();
