// Ported from empowertours-hunt lib/auth/signIn.ts (client half). Rumbo has no server, so instead
// of minting a cookie the live Mera signing session is kept in memory for this tab and ended on
// sign-out. Every money action is still an explicit transaction the traveler triggers.
import { signInAccount, createAccount, storedCredential, explainPasskeyError } from './passkey.js';

/** Hunt's NoPasskeyFoundError: carries the offer to create, matched structurally (not by text). */
export class NoPasskeyFoundError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'NoPasskeyFoundError';
    this.canCreateWallet = true;
    this.detail = detail;
  }
}

const NO_WALLET = {
  en: 'No Rumbo wallet on this device. If you have used it before, open Rumbo on the device you first signed in with — or create a new wallet above.',
  es: 'No hay cartera de Rumbo en este dispositivo. Si ya la usaste, abre Rumbo en el dispositivo donde entraste la primera vez — o crea una cartera nueva arriba.',
};
const ALREADY = {
  en: 'This device already has a Rumbo passkey. Tap “I already have a wallet” to open the wallet it belongs to.',
  es: 'Este dispositivo ya tiene una llave de Rumbo. Toca “Ya tengo una cartera” para abrir la cartera a la que pertenece.',
};

/** Only one ceremony at a time across BOTH entry points (a double-tap must not make two wallets). */
let inFlight = null;
function exclusive(work) {
  if (inFlight) return inFlight;
  inFlight = work().finally(() => { inFlight = null; });
  return inFlight;
}

export function signInWithPasskey(lang) {
  return exclusive(async () => {
    try {
      return await signInAccount();
    } catch (err) {
      if (storedCredential() !== undefined) throw new Error(explainPasskeyError(err, lang));
      throw new NoPasskeyFoundError(NO_WALLET[lang] || NO_WALLET.en, explainPasskeyError(err, lang));
    }
  });
}

/** Makes a NEW passkey + wallet. Refuses on a device that already knows one of our credentials. */
export function createWalletWithPasskey(lang) {
  return exclusive(async () => {
    if (storedCredential() !== undefined) throw new Error(ALREADY[lang] || ALREADY.en);
    try {
      return await createAccount();
    } catch (err) {
      throw new Error(explainPasskeyError(err, lang));
    }
  });
}
