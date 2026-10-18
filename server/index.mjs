// Rumbo production server (Railway). Zero dependencies, Node ≥ 20.
//   GET  /*                 the built UI (ui/dist), SPA fallback to index.html
//   POST /rpc               JSON-RPC proxy to Monad TESTNET (MONAD_RPC_URL; chain 10143 is checked at boot, mainnet refused)
//   GET  /deployments.json  testnet contract addresses from DEPLOY_DIR (404 until deployed → the app shows "coming soon")
//   GET  /demo-state.json   testnet demo ids from DEPLOY_DIR (same)
//   POST /content, GET /content/<sha256>   INTERIM content store for partner photos + metadata, on a Railway
//                           volume (CONTENT_DIR). Real production needs IPFS or another content-addressed store.
//   GET  /healthz
// No secrets live here: the server never holds a key and never signs anything.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { contentHandler } from '../ui/content-store.js';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);
const DIST = process.env.DIST_DIR || join(ROOT, 'ui/dist');
const DEPLOY_DIR = process.env.DEPLOY_DIR || join(ROOT, 'deploy/testnet');
const CONTENT_DIR = process.env.CONTENT_DIR || join(ROOT, 'content-store');
const RPC = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const CHAIN_ID = Number(process.env.CHAIN_ID || 10143);
if (CHAIN_ID === 143) throw new Error('refusing Monad mainnet');
mkdirSync(CONTENT_DIR, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// crude per-IP limits (interim; Railway sits behind a proxy that sets x-forwarded-for)
const buckets = new Map();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function limit(req, key, max, windowMs) {
  const k = `${key}:${ipOf(req)}`, now = Date.now();
  const b = buckets.get(k) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(k, b);
  return b.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 3_600_000) buckets.delete(k); }, 600_000).unref();

const content = contentHandler(CONTENT_DIR, { allowPost: (req) => limit(req, 'content', Number(process.env.CONTENT_POSTS_PER_HOUR || 120), 3_600_000) });

function security(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('permissions-policy', 'camera=(self), geolocation=(self), microphone=()');
}

async function rpc(req, res) {
  if (!limit(req, 'rpc', Number(process.env.RPC_PER_MINUTE || 600), 60_000)) { res.writeHead(429); return res.end('{"error":"slow down"}'); }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 256 * 1024) { res.writeHead(413); return res.end(); } chunks.push(c); }
  try {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: AbortSignal.timeout(15_000) });
    res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'rpc unreachable' })); }
}

function file(res, path, cache) {
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'cache-control': cache });
  res.end(readFileSync(path));
}

const server = createServer(async (req, res) => {
  security(res);
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, chainId: CHAIN_ID, deployed: existsSync(join(DEPLOY_DIR, 'deployments.json')) })); }
  if (p === '/rpc' && req.method === 'POST') return rpc(req, res);
  if (p.startsWith('/content')) return content(req, res, () => { res.writeHead(404); res.end('not found'); });
  if (p === '/deployments.json' || p === '/demo-state.json') {
    const f = join(DEPLOY_DIR, p.slice(1));
    if (!existsSync(f)) { res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end('{"error":"not deployed yet"}'); }
    return file(res, f, 'no-store');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const safe = normalize(p).replace(/^(\.\.[/\\])+/, '');
  const f = join(DIST, safe);
  if (f.startsWith(DIST) && existsSync(f) && statSync(f).isFile()) return file(res, f, safe.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  return file(res, join(DIST, 'index.html'), 'no-cache'); // SPA (hash routes)
});

// boot check: the RPC must be Monad testnet
try {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}', signal: AbortSignal.timeout(5_000) });
  const id = Number((await r.json()).result);
  if (id !== CHAIN_ID) throw new Error(`RPC ${RPC} is chain ${id}, expected ${CHAIN_ID}`);
  console.log(`rpc ok: ${RPC} (chain ${id})`);
} catch (e) { if (/expected/.test(e.message)) throw e; console.warn(`rpc check skipped: ${e.message}`); }
server.listen(PORT, '0.0.0.0', () => console.log(`rumbo on :${PORT} · dist ${DIST} · content ${CONTENT_DIR} · deploy ${DEPLOY_DIR}`));
