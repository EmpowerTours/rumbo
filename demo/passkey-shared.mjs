// Headless check of the SHARED EmpowerTours passkey wallet under the real rpId `empowertours.xyz`.
// Chromium maps *.empowertours.xyz to this box (no DNS, nothing public) and treats the two test
// test origins over HTTPS with a throwaway cert; a CDP virtual authenticator with PRF runs the real Mera code from passkey.js.
//   1. rumbo.empowertours.xyz: create a passkey → credential rpId must be empowertours.xyz,
//      the shared cookie et.passkey.credential (domain=empowertours.xyz) must be written.
//   2. Re-open on rumbo: same address.
//   3. hunt.empowertours.xyz (a sibling subdomain, same authenticator, same browser): the cookie is
//      already there and the same passkey opens the SAME address.
//   4. The Railway-style host is refused with a clear message, not an opaque SecurityError.
// Run: node demo/passkey-shared.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 5183;
const cfg = `${ROOT}demo/.vite-passkey-shared.config.mjs`;
const fs = await import('node:fs');
// Throwaway self-signed cert generated per run (nothing trusted system-wide): Chromium is told to
// accept exactly this key via --ignore-certificate-errors-spki-list, so the page is a normal secure
// context and WebAuthn runs as it would on the real site.
const { execFileSync } = await import('node:child_process');
const dir = fs.mkdtempSync('/tmp/rumbo-pk-');
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${dir}/key.pem`, '-out', `${dir}/cert.pem`, '-days', '1', '-subj', '/CN=empowertours.xyz local test', '-addext', 'subjectAltName=DNS:*.empowertours.xyz,DNS:empowertours.xyz,DNS:rumbo-web-production.up.railway.app'], { stdio: 'ignore' });
const spki = execFileSync('sh', ['-c', `openssl x509 -in ${dir}/cert.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
fs.writeFileSync(cfg, `import { defineConfig } from 'vite';\nimport fs from 'node:fs';\nexport default defineConfig({ root: '${ROOT}ui', define: { 'process.env.NEXT_PUBLIC_PASSKEY_RP_ID': JSON.stringify('empowertours.xyz') }, server: { fs: { strict: false }, host: '127.0.0.1', allowedHosts: true, https: { key: fs.readFileSync('${dir}/key.pem'), cert: fs.readFileSync('${dir}/cert.pem') } } });\n`);
const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--config', cfg, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VITE_RP_ID: 'empowertours.xyz' } });
await new Promise((res, rej) => { vite.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); vite.on('exit', (c) => rej(new Error(`vite exited ${c}`))); setTimeout(res, 8000); });

const origins = ['rumbo', 'hunt', 'art'].map((s) => `https://${s}.empowertours.xyz:${PORT}`);
const browser = await chromium.launch({ args: [
  `--host-resolver-rules=MAP *.empowertours.xyz 127.0.0.1, MAP rumbo-web-production.up.railway.app 127.0.0.1`,
  `--ignore-certificate-errors-spki-list=${spki}`,
] });
const results = {};
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  const open = async (origin) => { await page.goto(`${origin}/?lang=en`); };
  const run = (fn) => page.evaluate(async (fn) => {
    const m = await import('/src/auth/passkey.js');
    try {
      const r = await m[fn]();
      const out = { address: r.account.address, credentialId: r.credentialId, rpId: m.RP_ID, cookie: document.cookie };
      r.session.end();
      return out;
    } catch (e) { return { error: m.explainPasskeyError(e, 'en'), name: e?.name, detail: String(e?.cause?.message || e?.cause || e?.message) }; }
  }, fn);

  await open(origins[0]);
  const created = await run('createAccount');
  if (created.error) throw new Error(`create failed: ${created.error} / ${created.detail}`);
  const creds = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
  results.create = { ...created, credentialRpId: creds[0]?.rpId, credentials: creds.length };
  if (created.rpId !== 'empowertours.xyz' || creds[0]?.rpId !== 'empowertours.xyz') throw new Error('credential not issued under empowertours.xyz');
  if (!created.cookie.includes('et.passkey.credential=')) throw new Error('shared cookie not written');
  const cookies = await ctx.cookies();
  const ck = cookies.find((c) => c.name === 'et.passkey.credential');
  results.cookie = { domain: ck?.domain, value: decodeURIComponent(ck?.value || '') };
  if (!ck || !/^\.?empowertours\.xyz$/.test(ck.domain)) throw new Error(`cookie domain ${ck?.domain}`);
  console.log(`✓ rumbo: created ${created.address} under rpId ${creds[0].rpId}; cookie et.passkey.credential on ${ck.domain}`);

  const again = await run('signInAccount');
  if (again.address !== created.address) throw new Error(`rumbo re-open gave ${again.address || again.error}`);
  results.reopen = again;
  console.log(`✓ rumbo: "I already have a wallet" → same address`);

  for (const o of origins.slice(1)) {
    await open(o);
    const hint = await page.evaluate(() => document.cookie);
    const sib = await run('signInAccount');
    if (sib.address !== created.address) throw new Error(`${o} gave ${sib.address || sib.error}`);
    results[o] = { address: sib.address, sawCookieBeforeSignIn: hint.includes('et.passkey.credential=') };
    console.log(`✓ ${new URL(o).hostname}: shared cookie present before sign-in = ${results[o].sawCookieBeforeSignIn}; same passkey → same address`);
  }

  // 3b. The ART APP's own ceremony code (fcempowertours lib/passkey/ceremony.ts, served by Vite from
  //     the sibling checkout) on art.empowertours.xyz: it reads the cookie Rumbo wrote and must
  //     derive the SAME address. Skipped when the art repo isn't next to this one.
  const ART = '/workspace/fcempowertours/lib/passkey/ceremony.ts';
  if (fs.existsSync(ART)) {
    await open(origins[2]);
    const art = await page.evaluate(async (path) => {
      try {
        const m = await import(`/@fs${path}`);
        const { account, session } = await m.openSigner();
        const address = account.address; session.end();
        return { address };
      } catch (e) { return { error: String(e?.message || e) }; }
    }, ART);
    results.artAppCode = art;
    if (art.address !== created.address) throw new Error(`art app ceremony gave ${art.address || art.error}`);
    console.log(`✓ art app's own ceremony code (fcempowertours lib/passkey) on art.empowertours.xyz → same address ${art.address}`);
  } else console.log('- art app checkout not found, art-code cross-check skipped');

  await open(`https://rumbo-web-production.up.railway.app:${PORT}`);
  const wrong = await run('signInAccount');
  results.railway = wrong;
  if (!wrong.error || wrong.name !== 'WrongHostError') throw new Error(`railway host not refused cleanly: ${JSON.stringify(wrong)}`);
  console.log(`✓ railway-style host refused: "${wrong.error}"`);
  console.log(JSON.stringify(results, null, 1));
} finally {
  await browser.close();
  vite.kill();
  fs.rmSync(cfg, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}
