// A button that runs a real transaction (see actions.js). Disabled — with the reason — when nobody is
// signed in or the signed-in wallet is not the one allowed to do it.
import { wallet } from './auth/wallet.js';
import { state, esc } from './fmt.js';

const WHY = { en: { signIn: 'Sign in with your passkey wallet first', notYou: 'Only the owner of this listing / venue / vault can do this' },
  es: { signIn: 'Primero entra con tu cartera de llave', notYou: 'Solo el dueño de esta publicación / foro / bóveda puede hacerlo' } };

export function act(name, label, data = {}, opts = {}) {
  const W = WHY[state.lang];
  const owner = opts.owner;
  const signed = !!wallet.account;
  const mine = !owner || (signed && owner.toLowerCase() === wallet.address.toLowerCase());
  const ok = signed && mine && opts.enabled !== false;
  const why = !signed ? W.signIn : !mine ? W.notYou : opts.why || '';
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ');
  return `<button class="act ${opts.kind || ''}" data-act="${name}" ${attrs} ${ok ? '' : `disabled title="${esc(why)}"`}>${label}</button>`;
}
