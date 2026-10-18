// Ported from empowertours-hunt lib/auth/passkey.ts. Browser only: mera is a browser library.
// The passkey reproduces the same 32 PRF bytes for the same (credential, rpId, salt) forever, so
// the same face on the same device/keychain is always the same wallet. Nothing reaches a server:
// tours-loop HAS no server; the key is derived in the page and the signing session is ended on
// sign-out (or when the tab closes).
import { createPasskeyWithPrfOutput, createSecp256k1SigningSession, getEvmAddress, getPasskeyPrfOutput, isMeraError } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { TOURS_PRF_SALT, TOURS_PRF_SALT_LABEL, walletFromPrfOutput } from './derive.js';
import { storedCredentialHint, rememberCredentialHint, forgetCredentialHint } from './credential-hint.js';
import { resolveRpId, hostCanUseRpId, EMPOWERTOURS_RP_ID } from './rp-id.js';
import { TOURS_VAULT_SALT, vaultKeyFromPrfOutput } from './vault-key.js';

/**
 * The shared EmpowerTours relying party (`empowertours.xyz`), NOT this page's host: the same
 * passkey must open the same wallet on rumbo., art., hunt. Dev builds default to `localhost`.
 * VITE_RP_ID may only be `empowertours.xyz` or `localhost` (see rp-id.js).
 */
export const RP_ID = resolveRpId(import.meta.env.VITE_RP_ID, import.meta.env.DEV);

// Same guard as Hunt/art: never issue passkeys under a sibling app's own host rpId, and under the
// shared parent rpId verify the salt label rather than trust it (a wrong label = an empty wallet).
const FOREIGN_RP_IDS = ['regalo.empowertours.xyz', 'hunt.empowertours.xyz', 'cota.empowertours.xyz', 'art.empowertours.xyz', 'rumbo.empowertours.xyz'];
const PARENT_RP_IDS = [EMPOWERTOURS_RP_ID];
const EXPECTED_SALT_LABEL = 'empowertours-hunt/passkey/v1';
const WRONG_HOST = {
  en: 'Passkeys only work at rumbo.empowertours.xyz. Open the app there.',
  es: 'Las llaves de acceso solo funcionan en rumbo.empowertours.xyz. Abre la app ahí.',
};
export class WrongHostError extends Error {
  constructor() { super(WRONG_HOST.en); this.name = 'WrongHostError'; }
}
function assertOwnRelyingParty(rpId) {
  const id = rpId.toLowerCase();
  if (FOREIGN_RP_IDS.includes(id)) throw new Error(`RP id ${rpId} is a subdomain; the shared wallet uses ${EMPOWERTOURS_RP_ID}.`);
  if (PARENT_RP_IDS.includes(id) && TOURS_PRF_SALT_LABEL !== EXPECTED_SALT_LABEL) throw new Error('PRF salt label mismatch under a shared RP id.');
  if (typeof location !== 'undefined') {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) throw new Error('Passkeys need a host name, not an IP address. Open http://localhost instead of 127.0.0.1.');
    // e.g. the Railway *.up.railway.app URL: say so instead of an opaque SecurityError.
    if (!hostCanUseRpId(location.hostname, id)) throw new WrongHostError();
  }
}

const CEREMONY_TIMEOUT_MS = 60_000;
const HARD_GUARD_MS = CEREMONY_TIMEOUT_MS + 15_000;

export class CeremonyTimeout extends Error {
  constructor() { super('ceremony timed out'); this.name = 'CeremonyTimeout'; }
}
async function withGuard(work) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new CeremonyTimeout()), HARD_GUARD_MS); });
  try { return await Promise.race([work, guard]); } finally { clearTimeout(timer); }
}

/** Shared hint: localStorage + the ecosystem cookie `et.passkey.credential` (same as Hunt/art). */
export function storedCredential() { return storedCredentialHint(RP_ID); }
function forgetCredential() { forgetCredentialHint(RP_ID); }
function rememberCredential(credential) { rememberCredentialHint({ credentialId: credential.credentialId, transports: credential.transports }, RP_ID); }

/** One derivation path for every entry point (Hunt's rule: two derivations = two chances to differ). */
export function accountFromPrfOutput(prfOutput, credentialId) {
  const { privateKey } = walletFromPrfOutput(prfOutput);
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  const account = toViemAccount(session);
  // mera's address helper and viem's adapter must agree, or fail loudly.
  if (getEvmAddress(session.publicKey).toLowerCase() !== account.address.toLowerCase()) {
    session.end();
    throw new Error('address mismatch between mera and viem');
  }
  return { account, session, credentialId };
}

/** First visit on this device: make a passkey and the wallet behind it. */
export async function createAccount(displayName = 'EmpowerTours wallet') {
  assertOwnRelyingParty(RP_ID);
  const created = await withGuard(createPasskeyWithPrfOutput({
    rp: { id: RP_ID, name: 'EmpowerTours' },
    user: { name: displayName, displayName },
    prfSalt: TOURS_PRF_SALT,
    timeout: CEREMONY_TIMEOUT_MS,
  }));
  rememberCredential(created);
  return accountFromPrfOutput(created.prfOutput, created.credentialId);
}

/** Returning traveler: same passkey, same 32 bytes, same address. Discoverable lookup if no id is known. */
export async function signInAccount() {
  assertOwnRelyingParty(RP_ID);
  const known = storedCredential();
  const lookup = (credential) => withGuard(getPasskeyPrfOutput({ rpId: RP_ID, credential, prfSalt: TOURS_PRF_SALT, timeout: CEREMONY_TIMEOUT_MS }));
  let res;
  try {
    res = await lookup(known);
  } catch (err) {
    // INPUT_INVALID is thrown before any prompt: the remembered id is the problem, not the user.
    if (known === undefined || !isMeraError(err) || err.code !== 'INPUT_INVALID') throw err;
    forgetCredential();
    res = await lookup(undefined);
  }
  rememberCredential(known?.credentialId === res.credentialId ? known : { credentialId: res.credentialId });
  return accountFromPrfOutput(res.prfOutput, res.credentialId);
}

/** Second secret: same face, different salt, a key that is NOT a wallet (its own ceremony). */
export async function unlockNoteVault() {
  assertOwnRelyingParty(RP_ID);
  const known = storedCredential();
  const { prfOutput } = await withGuard(getPasskeyPrfOutput({ rpId: RP_ID, credential: known, prfSalt: TOURS_VAULT_SALT, timeout: CEREMONY_TIMEOUT_MS }));
  return vaultKeyFromPrfOutput(prfOutput);
}

export const hasWebAuthn = () => typeof window !== 'undefined' && !!window.PublicKeyCredential;

const EXPLAIN = {
  en: {
    timeout: "Nothing answered the passkey request. If this device doesn't hold your passkey, open Rumbo on the device you first signed in with.",
    prf: "This device can't make a Rumbo wallet. On iPhone: Safari with iCloud Keychain on. On Android: Chrome with Google Password Manager. 1Password works too; Bitwarden and Dashlane don't yet.",
    cancelled: 'The passkey prompt was cancelled or unavailable. Tap sign in again.',
    https: 'This page must be opened over HTTPS (or http://localhost) for passkeys to work.',
    other: 'Something went wrong.',
  },
  es: {
    timeout: 'Nadie respondió a la solicitud de llave de acceso. Si este dispositivo no tiene tu llave, abre Rumbo en el dispositivo donde entraste la primera vez.',
    prf: 'Este dispositivo no puede crear una cartera de Rumbo. En iPhone: Safari con Llavero de iCloud activado. En Android: Chrome con el Gestor de contraseñas de Google. 1Password también funciona; Bitwarden y Dashlane todavía no.',
    cancelled: 'La solicitud de llave de acceso se canceló o no estuvo disponible. Toca entrar otra vez.',
    https: 'Esta página debe abrirse con HTTPS (o http://localhost) para que funcionen las llaves de acceso.',
    other: 'Algo salió mal.',
  },
};
export function explainPasskeyError(err, lang = 'en') {
  const E = EXPLAIN[lang] || EXPLAIN.en;
  if (err instanceof CeremonyTimeout) return E.timeout;
  if (err instanceof WrongHostError) return WRONG_HOST[lang] || WRONG_HOST.en;
  if (isMeraError(err)) {
    switch (err.code) {
      case 'PRF_UNAVAILABLE': return E.prf;
      case 'PASSKEY_OPERATION_FAILED': return E.cancelled;
      case 'CRYPTO_UNAVAILABLE': return E.https;
      default: return `Passkey error (${err.code}).`;
    }
  }
  if (err instanceof Error) return `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`;
  return E.other;
}
