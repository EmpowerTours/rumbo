// Sign-in panel. UX and copy ported from EmpowerTours Hunt (components/auth/SignInPanel.tsx +
// SignInPrompt.tsx): two buttons (create / already have), a counting wait with a hint after 6 s, the
// "this makes a NEW wallet" warning next to the create offer, structural canCreateWallet matching.
import { signInWithPasskey, createWalletWithPasskey } from './auth/signIn.js';
import { hasWebAuthn, storedCredential } from './auth/passkey.js';
import { setWallet } from './auth/wallet.js';
import { state, esc } from './fmt.js';

const COPY = {
  en: {
    title: 'Your Rumbo wallet', helper: 'Your face or fingerprint makes it. No seed phrase, nothing to write down, nothing to install.',
    create: 'CREATE MY WALLET', have: 'I ALREADY HAVE A WALLET', waiting: 'WAITING…', makeNew: 'MAKE A NEW WALLET',
    waitTitle: 'Still waiting', waitHint: 'Your device should be showing a passkey sheet. If nothing appeared, the request reached the system and got no answer — wait for it to finish and the reason will show here.',
    elapsed: (n) => `waiting ${n}s`, notSigned: 'Not signed in', unavailable: 'Sign-in not available yet', unavailableBody: 'This browser has no passkey support (WebAuthn). Open Rumbo in a current browser at http://localhost — passkeys need a hostname, not an IP.',
    warnTitle: 'This makes a NEW wallet', warnBody: 'If you already made a wallet on this device — in this browser, or on the Hunt — do not tap this. It creates a second, different wallet with its own balance; it cannot reach the first one. Open the same browser you first signed in with.',
    known: 'This device remembers a Rumbo passkey.', how: 'The passkey IS the wallet: Mera derives the signing key from it inside this tab and forgets it on sign-out. Every payment below is a transaction you approve.',
    devTitle: 'DEV ONLY · Solonet test accounts', devBody: 'Public test-mnemonic accounts for headless tests and screenshots. Not in production builds. Never real money.', devUse: 'Use test account',
  },
  es: {
    title: 'Tu cartera Rumbo', helper: 'La crea tu cara o tu huella. Sin frase semilla, nada que anotar, nada que instalar.',
    create: 'CREAR MI CARTERA', have: 'YA TENGO UNA CARTERA', waiting: 'ESPERANDO…', makeNew: 'CREAR UNA CARTERA NUEVA',
    waitTitle: 'Aún esperando', waitHint: 'Tu dispositivo debería mostrar una hoja de llave de acceso. Si no apareció nada, la solicitud llegó al sistema y nadie respondió — espera a que termine y aquí aparecerá el motivo.',
    elapsed: (n) => `esperando ${n}s`, notSigned: 'Sin sesión', unavailable: 'El inicio de sesión aún no está disponible', unavailableBody: 'Este navegador no admite llaves de acceso (WebAuthn). Abre Rumbo en un navegador actual en http://localhost — las llaves necesitan un nombre de host, no una IP.',
    warnTitle: 'Esto crea una cartera NUEVA', warnBody: 'Si ya creaste una cartera en este dispositivo — en este navegador, o en la búsqueda — no toques esto. Crea una segunda cartera distinta, con su propio saldo; no puede llegar a la primera. Abre el mismo navegador donde entraste la primera vez.',
    known: 'Este dispositivo recuerda una llave de Rumbo.', how: 'La llave ES la cartera: Mera deriva la clave de firma dentro de esta pestaña y la olvida al cerrar sesión. Cada pago aquí es una transacción que tú apruebas.',
    devTitle: 'SOLO DEV · cuentas de prueba de Solonet', devBody: 'Cuentas públicas del mnemónico de prueba para pruebas sin pantalla y capturas. No están en producción. Nunca dinero real.', devUse: 'Usar cuenta de prueba',
  },
};
const HINT_AFTER_S = 6;
const ui = { busy: null, secs: 0, error: null, offerCreate: false, timer: null };

export function renderSignIn(s) {
  const T = COPY[state.lang];
  const btn = (k, label, primary) => `<button class="${primary ? 'primary' : 'secondary'} big-btn" data-signin="${k}" ${ui.busy ? 'disabled' : ''}>${ui.busy === k ? `${T.waiting} <small>${T.elapsed(ui.secs)}</small>` : label}</button>`;
  const note = (tone, title, body) => `<div class="note-box ${tone}"><b>${title}</b><div>${body}</div></div>`;
  const devActors = import.meta.env.DEV ? ['traveler', 'friend', 'fan', 'guide', 'hostA', 'hostB', 'hostCdmx', 'artist', 'venueOax', 'venueCdmx'] : [];
  return `<section class="card signin" id="signin">
    <h3>${T.title}</h3>
    <div class="sub">${T.helper}</div>
    ${hasWebAuthn() ? `<div class="btns">${btn('create', T.create, true)}${btn('have', T.have, false)}</div>` : note('stop', T.unavailable, T.unavailableBody)}
    ${storedCredential() ? `<div class="m">🔑 ${T.known}</div>` : ''}
    ${ui.busy && ui.secs >= HINT_AFTER_S ? note('warn', T.waitTitle, T.waitHint) : ''}
    ${ui.error ? note('warn', T.notSigned, esc(ui.error)) : ''}
    ${ui.offerCreate ? `${note('stop', T.warnTitle, T.warnBody)}<div class="btns">${btn('createAfter', T.makeNew, false)}</div>` : ''}
    <div class="note">${T.how}</div>
    ${devActors.length ? `<div class="dev-box"><b>${T.devTitle}</b><div class="m">${T.devBody}</div>
      <div class="btns"><select id="dev-actor">${devActors.map((k) => `<option value="${k}">${esc(s.demo.actors[k]?.name || k)}</option>`).join('')}</select>
      <button class="secondary" data-signin="dev">${T.devUse}</button></div></div>` : ''}
  </section>`;
}

/** Signs in with a dev account by key (dev builds only). Used by the panel and by ?dev=<actor> for screenshots. */
export async function devSignIn(key, s) {
  if (!import.meta.env.DEV) return;
  const { devAccount } = await import('./auth/dev.js');
  const account = devAccount(key);
  setWallet({ kind: 'dev', account, address: account.address, label: s.demo.actors[key]?.name || key });
}

export function bindSignIn(s, rerender) {
  const run = async (k) => {
    const T = COPY[state.lang];
    if (k === 'dev') return devSignIn(document.getElementById('dev-actor').value, s);
    ui.busy = k; ui.secs = 0; ui.error = null; ui.offerCreate = k === 'createAfter' ? false : ui.offerCreate;
    ui.timer = setInterval(() => { ui.secs += 1; rerender(); }, 1000);
    rerender();
    let ok = false;
    try {
      const res = k === 'have' ? await signInWithPasskey(state.lang) : await createWalletWithPasskey(state.lang);
      ui.offerCreate = false;
      ok = true;
      setWallet({ kind: 'passkey', account: res.account, address: res.account.address, session: res.session, label: 'Passkey wallet' });
    } catch (e) {
      ui.error = e instanceof Error ? e.message : 'Sign-in failed.';
      ui.offerCreate = e?.canCreateWallet === true; // structural, like Hunt's offersCreate()
      void T;
    } finally {
      clearInterval(ui.timer); ui.busy = null;
      // On success the wallet listener reloads the chain data for the new address and renders;
      // rendering here too would briefly show the previous account's data as "ready".
      if (!ok) rerender();
    }
  };
  document.querySelectorAll('[data-signin]').forEach((b) => b.addEventListener('click', () => run(b.dataset.signin)));
}
