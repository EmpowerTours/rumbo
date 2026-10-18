// Remembering WHICH passkey to ask for, across EmpowerTours subdomains. Ported from
// fcempowertours lib/passkey/credential-hint.ts (itself from Hunt's lib/auth/passkey.ts).
//
// The credential id is a public handle, not a secret: the key never leaves the authenticator and
// every use still requires user verification. Two places:
//   localStorage  `et.rumbo.passkey.credential`, this origin's own memory
//   cookie        `et.passkey.credential`, domain=empowertours.xyz: the SAME name and JSON shape
//                 ({credentialId, transports}) Hunt and the art app write, so a passkey made on
//                 hunt./art. is offered here and one made here is offered there.
// Every value read back is validated (isUsableCredentialId); junk is ignored, never passed to mera.
import { isUsableCredentialId } from './credential-id.js';

/** Shared with hunt, cota and the art app. Renaming it breaks the cross-app hint. */
export const SHARED_CREDENTIAL_COOKIE = 'et.passkey.credential';
const LOCAL_KEY = 'et.rumbo.passkey.credential';
/** Pre-switch key: ids under the old rpId (rumbo.empowertours.xyz). Dropped on first read. */
const LEGACY_LOCAL_KEY = 'tours.passkey.credential';

export function asHint(parsed) {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const id = parsed.credentialId;
  if (typeof id !== 'string' || !isUsableCredentialId(id)) return undefined;
  const t = parsed.transports;
  return { credentialId: id, ...(Array.isArray(t) && t.every((x) => typeof x === 'string') ? { transports: t } : {}) };
}

/** Only a real parent domain is shared; localhost keeps its hint to itself. */
export function cookieDomain(rpId) {
  const id = String(rpId).toLowerCase();
  if (!id.includes('.') || id === 'localhost') return null;
  return id;
}

export function readSharedCookie(cookieString) {
  try {
    const match = String(cookieString).split('; ').find((c) => c.startsWith(`${SHARED_CREDENTIAL_COOKIE}=`));
    if (!match) return undefined;
    return asHint(JSON.parse(decodeURIComponent(match.slice(SHARED_CREDENTIAL_COOKIE.length + 1))));
  } catch { return undefined; }
}

export function sharedCookieValue(hint, rpId) {
  const domain = cookieDomain(rpId);
  if (domain === null) return null;
  const value = encodeURIComponent(JSON.stringify({ credentialId: hint.credentialId, transports: hint.transports }));
  return `${SHARED_CREDENTIAL_COOKIE}=${value}; domain=${domain}; path=/; max-age=34560000; secure; samesite=lax`;
}

function writeCookie(hint, rpId) {
  if (typeof document === 'undefined') return;
  const v = sharedCookieValue(hint, rpId);
  if (v === null) return;
  try { document.cookie = v; } catch { /* siblings fall back to a discoverable lookup */ }
}

/** The passkey this browser last used, from this origin or a sibling app. */
export function storedCredentialHint(rpId) {
  try { localStorage.removeItem(LEGACY_LOCAL_KEY); } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const local = raw === null ? undefined : asHint(JSON.parse(raw));
    if (local) { writeCookie(local, rpId); return local; }
  } catch { /* private mode: the cookie may still answer */ }
  return typeof document === 'undefined' ? undefined : readSharedCookie(document.cookie);
}

export function rememberCredentialHint(hint, rpId) {
  if (!hint || !isUsableCredentialId(hint.credentialId)) return;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ credentialId: hint.credentialId, transports: hint.transports })); } catch { /* chooser next time */ }
  writeCookie(hint, rpId);
}

/** Drop a hint that did not work, from BOTH places. */
export function forgetCredentialHint(rpId) {
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
  if (typeof document === 'undefined') return;
  const domain = cookieDomain(rpId);
  if (domain === null) return;
  try { document.cookie = `${SHARED_CREDENTIAL_COOKIE}=; domain=${domain}; path=/; max-age=0; secure; samesite=lax`; } catch { /* ignore */ }
}
