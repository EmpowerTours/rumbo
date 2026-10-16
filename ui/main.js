import { loadAll, short } from './src/data.js';
import { I18N } from './src/i18n.js';
import { state } from './src/fmt.js';
import { renderTrip } from './src/trip.js';
import { renderDest, bindDest } from './src/dest.js';
import { renderPartner, qrSvg } from './src/partner.js';

let data;
const route = () => { const h = (location.hash || '#/trip').slice(2).split('/'); return { page: h[0] || 'trip', a: h[1], b: h[2] }; };

async function render() {
  const L = I18N[state.lang];
  const r = route();
  const partner = r.page === 'partner';
  const nav = partner ? '' : `<nav class="nav"><a class="${r.page === 'trip' ? 'on' : ''}" href="#/trip">${L.navTrip}</a><a class="${r.page === 'destination' ? 'on' : ''}" href="#/destination/oaxaca">${L.navDest}</a></nav>`;
  let body, qrText = null;
  if (r.page === 'destination') body = renderDest(data);
  else if (partner) ({ html: body, qrText } = renderPartner(data, r.a || 'host', r.b));
  else body = renderTrip(data);
  document.documentElement.lang = state.lang;
  document.getElementById('app').innerHTML = `
  <div class="wrap">
    <header>
      <div class="logo"><div class="mark"></div>EmpowerTours</div>
      <span class="pill">${L.local}</span>
      <div class="mode"><a class="${partner ? '' : 'on'}" href="#/trip">${L.traveler}</a><a class="${partner ? 'on' : ''}" href="#/partner/host">${L.partner}</a></div>
      ${nav}
      <div class="spacer"></div>
      <span class="who">${partner ? '' : `${data.nameOf(data.user)} · ${short(data.user)}`}</span>
      <div class="lang"><button data-l="en" class="${state.lang === 'en' ? 'on' : ''}">EN</button><button data-l="es" class="${state.lang === 'es' ? 'on' : ''}">ES</button></div>
    </header>
    ${body}
    <footer>${L.footer}</footer>
  </div>`;
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => { state.lang = b.dataset.l; render(); }));
  document.querySelectorAll('.mock').forEach((b) => b.addEventListener('click', () => alert(L.mockNote)));
  if (r.page === 'destination') bindDest(render);
  if (qrText && document.getElementById('qr')) document.getElementById('qr').innerHTML = await qrSvg(qrText);
  document.body.dataset.ready = '1';
}

window.addEventListener('hashchange', () => { document.body.dataset.ready = ''; render(); window.scrollTo(0, 0); });
loadAll().then((d) => { data = d; return render(); }).catch((e) => {
  document.getElementById('app').innerHTML = `<div class="loading">Could not reach Solonet: ${e.message}</div>`;
  console.error(e);
});
