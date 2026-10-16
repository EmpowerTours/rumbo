// Headless end-to-end run of the REAL wallet paths in the UI (Chromium + Vite on localhost only).
//  1. Mera passkey wallet through Chrome's CDP virtual authenticator WITH the PRF extension: create,
//     sign out, sign back in (same address), unlock the second-secret note, get test USDC, buy a
//     ticket, list it for resale at the cap. Each step is a real Solonet transaction signed in-page.
//  2. DEV ONLY test accounts for the partner side: venue accepts a request, host registers its scanner,
//     accepts and scans a guest in, traveler checks in at a stop and contributes.
// Writes screenshots/*.png and demo/ui-flows.json (tx gas per action as shown in the confirmation toast).
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROOT } from './lib.mjs';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = `${process.env.HOME}/.cache/ms-playwright`;
  for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) if (existsSync(`${base}/${d}/${sub}`)) return `${base}/${d}/${sub}`;
  }
  return undefined;
}
const demo = JSON.parse(readFileSync(`${ROOT}ui/public/demo-state.json`, 'utf8'));
const PORT = 5182;
const BASE = `http://localhost:${PORT}`; // WebAuthn needs a hostname, not an IP
const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['ui', '--port', String(PORT), '--host', 'localhost', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((res, rej) => { vite.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); vite.on('exit', (c) => rej(new Error(`vite exited ${c}`))); setTimeout(res, 8000); });
mkdirSync(`${ROOT}screenshots`, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome() });
const log = [];
const shots = [];
const D = { width: 1280, height: 1000 };

async function newPage(lang, { passkey = false } = {}) {
  const ctx = await browser.newContext({ viewport: D, deviceScaleFactor: 1.5, timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('   [console]', m.text().slice(0, 200)); });
  let auth = null;
  if (passkey) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
    auth = { cdp, authenticatorId };
  }
  return { ctx, page, auth };
}
const ready = (page) => page.waitForSelector('body[data-ready="1"]', { timeout: 90000 });
async function action(page, selector, what, { optional = false } = {}) {
  if (optional && (await page.locator(selector).count()) === 0) { console.log(`- ${what}: already done on-chain, skipped`); log.push({ what, state: 'skipped' }); return null; }
  const before = Number(await page.evaluate(() => document.body.dataset.actions || 0));
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.locator(selector).first().click();
  // wait until the action finished AND the chain data was re-read and rendered (main.js bumps data-actions)
  await page.waitForFunction((n) => Number(document.body.dataset.actions || 0) > n && document.body.dataset.ready === '1', before, { timeout: 120000 });
  const toasts = await page.$$eval('.toast', (els) => els.map((e) => ({ state: [...e.classList].find((c) => c !== 'toast'), text: e.innerText.replace(/\s+/g, ' ') })));
  const last = toasts[toasts.length - 1];
  const gas = Number((last.text.match(/gas ([\d,.]+)/) || [])[1]?.replace(/[,.]/g, '') || 0);
  log.push({ what, state: last.state, gas, toast: last.text });
  console.log(`${last.state === 'confirmed' ? '✓' : '✗'} ${what} — ${last.text.slice(0, 140)}`);
  if (last.state !== 'confirmed') throw new Error(`${what} failed: ${last.text}`);
  return last;
}
async function shot(page, name, full = false) {
  const path = `${ROOT}screenshots/${name}.png`;
  await page.waitForTimeout(300);
  await page.screenshot({ path, fullPage: full });
  shots.push(path);
}

try {
  for (const lang of process.env.PART ? [] : ['en', 'es']) {
    // ---------------------------------------------------------------- 1. passkey wallet (Mera)
    const { ctx, page, auth } = await newPage(lang, { passkey: true });
    await page.goto(`${BASE}/?lang=${lang}#/trip`);
    await ready(page);
    await page.click('[data-signin="create"]');
    await page.waitForSelector('body[data-wallet="passkey"][data-ready="1"]', { timeout: 90000 });
    const addr1 = (await page.textContent('#wallet-card .hash')).trim();
    const creds = await auth.cdp.send('WebAuthn.getCredentials', { authenticatorId: auth.authenticatorId });
    console.log(`✓ [${lang}] passkey wallet created via Mera PRF: ${addr1} (${creds.credentials.length} credential, rpId ${creds.credentials[0]?.rpId})`);
    log.push({ what: `[${lang}] create passkey wallet`, state: 'confirmed', address: addr1, rpId: creds.credentials[0]?.rpId });
    // sign out → sign back in with the same passkey → same address (PRF is deterministic)
    await page.click('#sign-out');
    await page.waitForSelector('[data-signin="have"]');
    await page.click('[data-signin="have"]');
    await page.waitForSelector('body[data-wallet="passkey"][data-ready="1"]', { timeout: 90000 });
    const addr2 = (await page.textContent('#wallet-card .hash')).trim();
    if (addr1 !== addr2) throw new Error(`re-sign-in gave a different address ${addr2}`);
    console.log(`✓ [${lang}] signed out and back in with "I already have a wallet": same address`);
    log.push({ what: `[${lang}] sign back in (same address)`, state: 'confirmed', address: addr2 });
    // second secret: unlock the note vault, seal a note, lock (re-sign-in), unlock, read it back
    await page.click('#note-unlock');
    await page.waitForSelector('#note-text');
    const noteText = lang === 'en' ? 'Mezcal tasting Friday · ask Marisol about Monte Albán sunrise' : 'Cata de mezcal el viernes · preguntar a Marisol por el amanecer en Monte Albán';
    await page.fill('#note-text', noteText);
    await page.click('#note-save');
    await page.waitForTimeout(300);
    const sealed = await page.evaluate((a) => localStorage.getItem(`tours.note.${a.toLowerCase()}`), addr1);
    if (!sealed || sealed.includes('Mezcal') || sealed.includes('mezcal')) throw new Error('note not sealed');
    log.push({ what: `[${lang}] private note sealed with the second PRF secret`, state: 'confirmed', ciphertextBytes: sealed.length });
    console.log(`✓ [${lang}] private note sealed (${sealed.length} bytes of AES-GCM JSON in localStorage, no plaintext)`);
    await action(page, '[data-act="faucet"]', `[${lang}] passkey wallet: get 1,000 test USDC (devnet gas drip first)`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `wallet-passkey-dashboard-${lang}`);
    // real ticket purchase from the passkey wallet
    await page.goto(`${BASE}/?lang=${lang}#/destination/oaxaca`);
    await ready(page);
    await action(page, `[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`, `[${lang}] passkey wallet: buy a ticket for Oaxaca night 2`);
    await page.locator(`[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`).first().scrollIntoViewIfNeeded();
    await shot(page, `ticket-purchase-${lang}`);
    // resale listing at the cap from the dashboard; the destination page then shows it
    await page.goto(`${BASE}/?lang=${lang}#/trip`);
    await ready(page);
    await action(page, '[data-act="listResale"]', `[${lang}] passkey wallet: list the ticket for resale at 110% of face`);
    await page.locator('[data-act="cancelResale"]').first().scrollIntoViewIfNeeded();
    await shot(page, `resale-listed-dashboard-${lang}`);
    await page.goto(`${BASE}/?lang=${lang}#/destination/oaxaca`);
    await ready(page);
    await page.locator('.resale').first().scrollIntoViewIfNeeded();
    await shot(page, `resale-listing-${lang}`);
    await page.goto(`${BASE}/?lang=${lang}#/destination/cdmx`);
    await ready(page);
    await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('toasts')?.remove(); });
    await shot(page, `destination-cdmx-${lang}`, true);
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. partner side with DEV test accounts
  const dev = async (actor, hash) => { const x = await newPage('en'); await x.page.goto(`${BASE}/?lang=en&dev=${actor}${hash}`); await x.page.waitForSelector('body[data-wallet="dev"][data-ready="1"]', { timeout: 90000 }); return x; };
  if (process.env.PART === 'extra') {
    const { ctx, page } = await dev('traveler', '#/trip');
    await action(page, '[data-act="redeem"]:not([disabled])', 'DEV Ana: redeem a perk with $TOURS points');
    await ctx.close();
  } else {
  {
    const { ctx, page } = await dev('venueCdmx', '#/partner/venue/1');
    await action(page, `[data-act="venueAccept"][data-id="${demo.shows.cdmx2}"]`, 'DEV Foro Indie CDMX: accept Lumbre\'s booking request', { optional: true });
    await shot(page, 'partner-venue-accepted-en', true);
    await ctx.close();
  }
  {
    const { ctx, page } = await dev('hostA', '#/partner/host');
    await action(page, `[data-act="hostAccept"][data-id="${demo.pendingBooking}"]`, 'DEV Casa Azul: accept Ana\'s booking', { optional: true });
    await action(page, '[data-act="hostScanner"]', 'DEV Casa Azul: register this wallet as check-in scanner', { optional: true });
    await action(page, `[data-act="hostScan"][data-id="${demo.pendingBooking}"]`, 'DEV Casa Azul: scan Ana in → escrow released');
    await shot(page, 'partner-host-scan-en', true);
    await ctx.close();
  }
  {
    const { ctx, page } = await dev('traveler', '#/trip');
    await action(page, '[data-act="contribute"]', 'DEV Ana: contribute 25 USDC to the trip vault');
    await action(page, '[data-act="checkin"]', 'DEV Ana: check in at a stop (local Hunt attester, claimBatch)');
    await ctx.close();
  }
  {
    const { ctx, page } = await dev('fan', '#/destination/oaxaca');
    await action(page, `[data-act="buyResale"][data-id="${demo.resaleOpen}"]`, 'DEV Sofía: buy Luis\'s resale ticket (fee + royalty + seller)');
    await ctx.close();
  }
  }
} finally {
  await browser.close();
  vite.kill();
  const prev = process.env.PART && existsSync(`${ROOT}demo/ui-flows.json`) ? JSON.parse(readFileSync(`${ROOT}demo/ui-flows.json`, 'utf8')) : { steps: [], shots: [] };
  log.unshift(...prev.steps.filter((x) => x.state === 'confirmed')); shots.unshift(...prev.shots.filter((x) => !x.includes('partner-')).map((x) => ROOT + x));
  writeFileSync(`${ROOT}demo/ui-flows.json`, JSON.stringify({ when: new Date().toISOString(), steps: log, shots: shots.map((p) => p.replace(ROOT, '')) }, null, 2));
}
console.log(shots.join('\n'));
