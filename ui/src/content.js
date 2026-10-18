// Client for the LOCAL content store (ui/content-store.js). Everything is addressed by sha256:
// on-chain we keep only `local:sha256:<hex>`; reads re-hash the bytes and refuse a mismatch.
// Production: replace with IPFS (ipfs://<cid>) — see README "Photos and metadata".
const cache = new Map();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const hashOf = (uri) => (String(uri || '').match(/^local:sha256:([0-9a-f]{64})$/) || [])[1] || null;
export const urlOf = (uri) => (hashOf(uri) ? `/content/${hashOf(uri)}` : null);

export async function put(body, type) {
  const r = await fetch('/content', { method: 'POST', headers: { 'content-type': type }, body });
  if (!r.ok) throw new Error(r.status === 413 ? 'photoTooBig' : r.status === 415 ? 'photoType' : `content store ${r.status}`);
  return (await r.json()).uri;
}
export const putJson = (obj) => put(JSON.stringify(obj), 'application/json');

/** Fetch + verify a metadata JSON by URI. Returns null for empty/unknown URIs or a hash mismatch. */
export async function getJson(uri) {
  const h = hashOf(uri);
  if (!h) return null;
  if (cache.has(h)) return cache.get(h);
  const p = (async () => {
    try {
      const r = await fetch(`/content/${h}`);
      if (!r.ok) return null;
      const buf = await r.arrayBuffer();
      if (hex(await crypto.subtle.digest('SHA-256', buf)) !== h) return null; // tampered / wrong file
      return JSON.parse(new TextDecoder().decode(buf));
    } catch { return null; }
  })();
  cache.set(h, p);
  return p;
}
