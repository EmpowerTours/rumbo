// Ported verbatim (logic) from empowertours-hunt lib/auth/credential-id.ts.
// True when `credentialId` is canonical unpadded base64url of at least one byte: the exact
// shape mera accepts. A non-canonical remembered id would make mera throw INPUT_INVALID.
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const LEFTOVER_MASK = { 2: 0b1111, 3: 0b11 };
function base64UrlValue(char) {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (char === '-') return 62;
  return 63;
}
export function isUsableCredentialId(credentialId) {
  if (typeof credentialId !== 'string' || credentialId.length === 0) return false;
  if (credentialId.length % 4 === 1) return false;
  if (!BASE64URL.test(credentialId)) return false;
  const mask = LEFTOVER_MASK[credentialId.length % 4];
  if (mask === undefined) return true;
  return (base64UrlValue(credentialId[credentialId.length - 1]) & mask) === 0;
}
