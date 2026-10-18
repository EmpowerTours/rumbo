// LOCAL dev content store for partner photos and listing/venue/profile metadata.
//   POST /content           raw body (image/jpeg|png|webp, application/json; ≤ 4 MB) → { uri, url, hash }
//   GET  /content/<sha256>  the stored bytes
// Files are kept by their sha256 in <repo>/content-store/ (git-ignored). Only the URI
// `local:sha256:<hex>` goes on-chain or into metadata. Nothing is uploaded anywhere public.
// Production (interim): server/index.mjs serves the same handler from a Railway volume (CONTENT_DIR).
// Real production needs IPFS (or another real store): swap this for a pinning service and use ipfs:// URIs.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';

const DEFAULT_DIR = new URL('../content-store/', import.meta.url).pathname;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/json': 'json' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
const MAX = 4 * 1024 * 1024;

/** Connect-style handler over a directory. Used by the Vite dev plugin below and by server/index.mjs (prod). */
export function contentHandler(DIR = DEFAULT_DIR, { allowPost = () => true } = {}) {
  if (!DIR.endsWith('/')) DIR += '/';
  return function handler(req, res, next) {
  if (!req.url.startsWith('/content')) return next();
  if (req.method === 'POST' && (req.url === '/content' || req.url === '/content/')) {
    if (!allowPost(req)) { res.statusCode = 429; return res.end(JSON.stringify({ error: 'slow down' })); }
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!TYPES[type]) { res.statusCode = 415; return res.end(JSON.stringify({ error: 'unsupported type' })); }
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= MAX) chunks.push(c); });
    req.on('end', () => {
      if (size > MAX) { res.statusCode = 413; return res.end(JSON.stringify({ error: 'too large' })); }
      const buf = Buffer.concat(chunks);
      if (type === 'application/json') { try { JSON.parse(buf.toString('utf8')); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'bad json' })); } }
      const hash = createHash('sha256').update(buf).digest('hex');
      mkdirSync(DIR, { recursive: true });
      const file = `${DIR}${hash}.${TYPES[type]}`;
      if (!existsSync(file)) writeFileSync(file, buf);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ uri: `local:sha256:${hash}`, url: `/content/${hash}`, hash }));
    });
    return;
  }
  const m = req.url.match(/^\/content\/([0-9a-f]{64})$/);
  if (req.method === 'GET' && m) {
    const f = existsSync(DIR) && readdirSync(DIR).find((x) => x.startsWith(m[1] + '.'));
    if (!f) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', MIME[f.split('.').pop()] || 'application/octet-stream');
    res.setHeader('cache-control', 'public, max-age=31536000, immutable'); // content-addressed
    res.setHeader('x-content-type-options', 'nosniff');
    return res.end(readFileSync(DIR + f));
  }
  next();
  };
}

export const contentStore = () => ({
  name: 'rumbo-local-content-store',
  configureServer(server) { server.middlewares.use(contentHandler()); },
  configurePreviewServer(server) { server.middlewares.use(contentHandler()); },
});
