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
  en: 'No EmpowerTours wallet on this device. If you made one before (in Rumbo, Hunt or the art app), use the device or password manager that holds that passkey — or create a new wallet above.',
  es: 'No hay cartera de EmpowerTours en este dispositivo. Si ya creaste una (en Rumbo, Hunt o la app de arte), usa el dispositivo o gestor de contraseñas que tiene esa llave — o crea una cartera nueva arriba.',
};
const ALREADY = {
  en: 'This browser already knows an EmpowerTours passkey (from Rumbo, Hunt or the art app). Tap “I already have a wallet” to open that same wallet here.',
  es: 'Este navegador ya conoce una llave de EmpowerTours (de Rumbo, Hunt o la app de arte). Toca “Ya tengo una cartera” para abrir esa misma cartera aquí.',
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
