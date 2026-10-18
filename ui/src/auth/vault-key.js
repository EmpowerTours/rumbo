// Ported from empowertours-hunt lib/auth/vault-key.ts: a SECOND secret from the same passkey.
// Mera's PRF under a different salt -> a non-extractable AES-256-GCM key that never leaves the
// page. Rumbo uses it for a private trip note sealed in localStorage (ciphertext only).
import { sha256, stringToBytes } from 'viem';

export const TOURS_VAULT_SALT_LABEL = 'empowertours-rumbo/passkey/vault/v1';
export const TOURS_VAULT_SALT = sha256(stringToBytes(TOURS_VAULT_SALT_LABEL), 'bytes');

export async function vaultKeyFromPrfOutput(prfOutput) {
  if (prfOutput.length !== 32) throw new Error(`expected 32 bytes of PRF output, got ${prfOutput.length}`);
  return crypto.subtle.importKey('raw', prfOutput, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Fresh random IV every time (GCM IV reuse under a stable key is catastrophic). */
export async function sealNote(key, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plaintext));
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(ct)) };
}
/** Throws on a wrong key, tampering or a mismatched aad: never returns plausible wrong text. */
export async function openNote(key, sealed, aad) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv), additionalData: enc.encode(aad) }, key, unb64(sealed.ciphertext));
  return dec.decode(pt);
}
