// "Top up your wallet" sheet. Shown instead of sending when the wallet's MON does not cover the gas an
// action will be charged (limit × maxFee, see wallet.js quote()). Nothing is signed while it is open.
// It polls the balance every 2 s; once the MON lands it waits a few blocks (Monad checks fees against a
// balance that lags ~3 blocks) and then resolves, so the action carries on by itself.
// No exchange / on-ramp links on purpose: the user sends MON from any wallet they already control.
import QRCode from 'qrcode';
import { client } from './data.js';
import { mon, suggested } from './gas.js';
import { esc } from './fmt.js';

const T = {
  en: {
    title: 'Top up your wallet', kicker: 'Almost there',
    lead: (what) => `<b>${what}</b> needs a little MON for network fees, and your wallet is a bit short. Send some MON to the address below and we'll pick up right where you left off.`,
    need: 'Needed for this action', buffer: 'Suggested top-up (with a small buffer)', bal: 'Your balance', addr: 'Your wallet address', copy: 'Copy', copied: 'Copied ✓',
    net: 'Network: Monad Solonet (local, chain 20143). Send MON only.',
    waiting: 'Watching for your MON… (checks every 2 s)', landed: 'MON received! Letting the network catch up…', go: 'All set — finishing your action…',
    fine: 'Monad charges the full gas limit up front, so this is the most the action can cost; most of the time it costs a bit less. Fees go to the network, not to EmpowerTours. Nothing is sent until your balance covers it.',
    close: 'Not now', closed: 'No problem — nothing was sent. Your wallet is still yours to browse with.',
  },
  es: {
    title: 'Recarga tu cartera', kicker: 'Ya casi',
    lead: (what) => `<b>${what}</b> necesita un poco de MON para las comisiones de la red, y a tu cartera le falta poquito. Envía MON a la dirección de abajo y seguimos justo donde te quedaste.`,
    need: 'Necesario para esta acción', buffer: 'Recarga sugerida (con un pequeño margen)', bal: 'Tu saldo', addr: 'Dirección de tu cartera', copy: 'Copiar', copied: 'Copiado ✓',
    net: 'Red: Monad Solonet (local, chain 20143). Envía solo MON.',
    waiting: 'Esperando tu MON… (revisamos cada 2 s)', landed: '¡MON recibido! Dejamos que la red se ponga al día…', go: 'Listo — terminando tu acción…',
    fine: 'Monad cobra el límite de gas completo por adelantado, así que esto es lo máximo que puede costar; casi siempre cuesta un poco menos. Las comisiones van a la red, no a EmpowerTours. No se envía nada hasta que tu saldo alcance.',
    close: 'Ahora no', closed: 'Sin problema — no se envió nada. Puedes seguir navegando con tu cartera.',
  },
};

const LAG_BLOCKS = 4n; // Monad's consensus fee check reads the balance from block n-3

/** Opens the sheet; resolves true when funded (and settled), false if the user closes it. */
export function topUp({ address, need, balance, what, lang = 'en', onClose }) {
  const L = T[lang] || T.en;
  const sug = suggested(need);
  document.getElementById('topup')?.remove();
  const el = document.createElement('div');
  el.id = 'topup';
  el.className = 'sheet-backdrop';
  el.dataset.need = need.toString();
  el.dataset.suggested = sug.toString();
  el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="topup-title">
    <div class="kicker">${L.kicker}</div>
    <h3 id="topup-title">⛽ ${L.title}</h3>
    <p class="lead">${L.lead(esc(what))}</p>
    <div class="topup-grid">
      <div class="qr" id="topup-qr"></div>
      <div class="topup-nums">
        <div class="row"><span>${L.need}</span><b id="topup-need">${mon(need)} MON</b></div>
        <div class="row hi"><span>${L.buffer}</span><b id="topup-suggest">${mon(sug, 2)} MON</b></div>
        <div class="row"><span>${L.bal}</span><b id="topup-bal">${mon(balance)} MON</b></div>
      </div>
    </div>
    <div class="addr-label">${L.addr}</div>
    <div class="addr-row"><code id="topup-addr">${address}</code><button class="act" id="topup-copy">${L.copy}</button></div>
    <div class="net">${L.net}</div>
    <div class="status" id="topup-status"><span class="dot"></span> ${L.waiting}</div>
    <p class="fine">${L.fine}</p>
    <div class="actions"><button class="act" id="topup-close">${L.close}</button></div>
  </div>`;
  document.body.appendChild(el);
  QRCode.toString(address, { type: 'svg', margin: 1, color: { dark: '#2b1d14', light: '#ffffff' } }).then((svg) => { const q = el.querySelector('#topup-qr'); if (q) q.innerHTML = svg; });
  el.querySelector('#topup-copy').addEventListener('click', async (ev) => {
    try { await navigator.clipboard.writeText(address); } catch { /* clipboard blocked (http / headless): the address is selectable */ }
    const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(el.querySelector('#topup-addr')); sel.removeAllRanges(); sel.addRange(r);
    ev.target.textContent = L.copied; setTimeout(() => { ev.target.textContent = L.copy; }, 1500);
  });

  return new Promise((resolve) => {
    let done = false;
    let fundedAt = null;
    const finish = (ok) => { if (done) return; done = true; clearInterval(timer); if (!ok) { el.remove(); onClose?.(L.closed); } resolve(ok); };
    el.querySelector('#topup-close').addEventListener('click', () => finish(false));
    el.addEventListener('click', (e) => { if (e.target === el) finish(false); });
    const status = (cls, msg) => { const s = el.querySelector('#topup-status'); s.className = `status ${cls}`; s.innerHTML = `<span class="dot"></span> ${msg}`; };
    const tick = async () => {
      if (done) return;
      try {
        const [bal, head] = await Promise.all([client.getBalance({ address }), client.getBlockNumber()]);
        el.querySelector('#topup-bal').textContent = `${mon(bal)} MON`;
        el.dataset.balance = bal.toString();
        if (bal < need) { fundedAt = null; return; }
        if (fundedAt === null) { fundedAt = head; status('landed', L.landed); }
        if (head >= fundedAt + LAG_BLOCKS) {
          status('go', L.go);
          el.dataset.funded = '1';
          setTimeout(() => { el.remove(); finish(true); }, 600);
        }
      } catch { /* RPC hiccup: try again next tick */ }
    };
    const timer = setInterval(tick, 2000);
    tick();
  });
}
