// A button that runs a real transaction (see actions.js). Disabled — with the reason — when nobody is
// signed in or the signed-in wallet is not the one allowed to do it.
import { wallet } from './auth/wallet.js';
import { state, esc } from './fmt.js';
import { actionCost, feeCtx, mon } from './gas.js';

const WHY = { en: { signIn: 'Sign in with your passkey wallet first', notYou: 'Only the owner of this listing / venue / vault can do this', cost: 'Network fee for this action. Your wallet needs a little MON first; tap to see how to top up.' },
  es: { signIn: 'Primero entra con tu cartera de llave', notYou: 'Solo el dueño de esta publicación / foro / bóveda puede hacerlo', cost: 'Comisión de red de esta acción. Tu cartera necesita un poco de MON primero; toca para ver cómo recargar.' } };

export function act(name, label, data = {}, opts = {}) {
  const W = WHY[state.lang];
  const owner = opts.owner;
  const signed = !!wallet.account;
  const mine = !owner || (signed && owner.toLowerCase() === wallet.address.toLowerCase());
  const ok = signed && mine && opts.enabled !== false;
  const why = !signed ? W.signIn : !mine ? W.notYou : opts.why || '';
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ');
  // Signed in but the wallet's MON doesn't cover this action's gas: say so on the button, keep it
  // clickable (clicking opens the top-up sheet). Never blocks anything else.
  const cost = actionCost(name);
  const short = ok && feeCtx.signed && cost > 0n && feeCtx.mon < cost;
  const hint = short ? ` <span class="cost" title="${esc(W.cost)}">~${mon(cost, 3)} MON</span>` : '';
  return `<button class="act ${opts.kind || ''}" data-act="${name}" ${short ? `data-short="1" data-cost="${cost}"` : ''} ${attrs} ${ok ? '' : `disabled title="${esc(why)}"`}>${label}${hint}</button>`;
}
