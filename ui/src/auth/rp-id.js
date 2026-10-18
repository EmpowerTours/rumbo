// Which WebAuthn relying party the Rumbo passkey wallet is issued under. Pure (no browser, no mera),
// so derive.test.mjs can exercise it from Node. Mirrors fcempowertours lib/passkey/rp-id.ts.
//
// The wallet is a pure function of (credential, rpId, salt). Rumbo joins the shared EmpowerTours
// wallet, so the rpId is the registrable PARENT `empowertours.xyz`: the same passkey then opens the
// same address on art., hunt., cota., rumbo. and the apex. A subdomain may always claim its parent,
// so no related-origin requests are needed.
//
// Only two values are accepted:
//   empowertours.xyz  production (the default for production builds)
//   localhost         local development / headless tests (a throwaway credential and wallet)
// Anything else (a subdomain, a sibling app's host, the Railway URL) would silently derive a
// different, empty wallet from the same face, so it is refused instead.

export const EMPOWERTOURS_RP_ID = 'empowertours.xyz';
export const ALLOWED_RP_IDS = [EMPOWERTOURS_RP_ID, 'localhost'];

/** @param {string|undefined} raw VITE_RP_ID  @param {boolean} dev import.meta.env.DEV */
export function resolveRpId(raw, dev = false) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '') return dev ? 'localhost' : EMPOWERTOURS_RP_ID;
  if (ALLOWED_RP_IDS.includes(value)) return value;
  throw new Error(`VITE_RP_ID="${raw}" is not allowed. Use "${EMPOWERTOURS_RP_ID}" (production, shared across every EmpowerTours app) or "localhost" (development).`);
}

/** WebAuthn lets a page use an rpId equal to its host or a registrable suffix of it. */
export function hostCanUseRpId(hostname, rpId) {
  const host = String(hostname).trim().toLowerCase().replace(/\.$/, '');
  const id = String(rpId).toLowerCase();
  return host === id || host.endsWith(`.${id}`);
}
