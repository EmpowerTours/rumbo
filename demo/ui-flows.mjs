// Headless end-to-end run of the REAL wallet paths in the UI (Chromium + Vite on localhost only).
//  0. ZERO-MON: a brand-new Mera passkey wallet with 0 MON (no drip, no sponsorship) browses every route
//     signed out and signed in with RPC reads only (asserting no console errors and no transaction sent
//     on load), tries to buy a ticket, gets the "Top up your wallet" sheet, is funded from a test
//     account, and the purchase then completes by itself.
//  1. Mera passkey wallet through Chrome's CDP virtual authenticator WITH the PRF extension: create,
//     sign out, sign back in (same address), unlock the second-secret note, get test USDC, buy a
//     ticket, list it for resale at the cap. Each step is a real Solonet transaction signed in-page.
//  2. DEV ONLY test accounts for the partner side: venue accepts a request, host registers its scanner,
//     accepts and scans a guest in, traveler checks in at a stop and contributes.
// Writes screenshots/*.png and demo/ui-flows.json (tx gas per action as shown in the confirmation toast).
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROOT, pub, wallet as walletClient, actor, abi, deployments, assertSolonet } from './lib.mjs';
import { parseUnits, formatEther } from 'viem';

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
const PARTS = new Set((process.env.PART || 'zero,passkey,partner').split(','));
let curPart = 'zero';
const zeroMon = {};
await assertSolonet();
const DEP = deployments();
const funder = walletClient(actor('uiDrip')); // test account #19 (funded by demo/scenario.mjs)
const ROUTES = ['#/trip', '#/destination/oaxaca', '#/destination/cdmx', '#/partner/host', '#/partner/guide', '#/partner/venue', '#/partner/venue/1', '#/partner/artist'];
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
  if (optional && (await page.locator(selector).count()) === 0) { console.log(`- ${what}: already done on-chain, skipped`); log.push({ part: curPart,  what, state: 'skipped' }); return null; }
  const before = Number(await page.evaluate(() => document.body.dataset.actions || 0));
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.locator(selector).first().click();
  // wait until the action finished AND the chain data was re-read and rendered (main.js bumps data-actions)
  await page.waitForFunction((n) => Number(document.body.dataset.actions || 0) > n && document.body.dataset.ready === '1', before, { timeout: 120000 });
  const toasts = await page.$$eval('.toast', (els) => els.map((e) => ({ state: [...e.classList].find((c) => c !== 'toast'), text: e.innerText.replace(/\s+/g, ' ') })));
  const last = toasts[toasts.length - 1];
  const gas = Number((last.text.match(/gas ([\d,.]+)/) || [])[1]?.replace(/[,.]/g, '') || 0);
  log.push({ part: curPart,  what, state: last.state, gas, toast: last.text });
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
  for (const lang of PARTS.has('zero') ? ['en', 'es'] : []) {
    // ---------------------------------------------------------------- 0. zero-MON wallet, no sponsorship
    const Z = { lang, routes: [], errors: [], txAttempts: [] };
    const { ctx, page } = await newPage(lang, { passkey: true });
    page.on('console', (m) => { if (m.type() === 'error') Z.errors.push({ url: page.url(), text: m.text().slice(0, 300) }); });
    page.on('pageerror', (e) => Z.errors.push({ url: page.url(), text: `pageerror: ${e.message}` }));
    page.on('request', (r) => {
      const b = r.method() === 'POST' ? r.postData() || '' : '';
      if (/eth_sendRawTransaction|eth_sendTransaction/.test(b)) Z.txAttempts.push({ url: page.url(), at: new Date().toISOString() });
    });
    const visit = async (signed) => {
      for (const h of ROUTES) {
        const e0 = Z.errors.length; const t0 = Z.txAttempts.length;
        await page.goto(`${BASE}/?lang=${lang}${h}`);
        await ready(page);
        await page.waitForTimeout(400);
        const hints = await page.$$eval('button.act[data-short]', (els) => els.map((e) => ({ act: e.dataset.act, hint: e.querySelector('.cost')?.textContent })));
        const disabled = await page.$$eval('button.act[disabled]', (els) => els.length);
        const r = { route: h, signed, ok: true, consoleErrors: Z.errors.length - e0, txOnLoad: Z.txAttempts.length - t0, monHints: hints, disabledButtons: disabled };
        Z.routes.push(r);
        console.log(`${r.consoleErrors || r.txOnLoad ? '✗' : '✓'} [${lang}] ${signed ? '0-MON wallet' : 'signed out'} ${h} — errors ${r.consoleErrors}, tx on load ${r.txOnLoad}${hints.length ? `, hints ${[...new Set(hints.map((x) => `${x.act} ${x.hint}`))].join(', ')}` : ''}`);
      }
    };
    await visit(false);
    await page.goto(`${BASE}/?lang=${lang}#/trip`);
    await ready(page);
    await page.click('[data-signin="create"]');
    await page.waitForSelector('body[data-wallet="passkey"][data-ready="1"]', { timeout: 90000 });
    const addr = (await page.textContent('#wallet-card .hash')).trim();
    Z.address = addr;
    Z.monAtStart = formatEther(await pub.getBalance({ address: addr }));
    if (Z.monAtStart !== '0') throw new Error(`fresh wallet should hold 0 MON, has ${Z.monAtStart}`);
    console.log(`✓ [${lang}] fresh Mera wallet ${addr} holds 0 MON (sign-in used RPC reads only)`);
    await visit(true);
    await page.goto(`${BASE}/?lang=${lang}#/trip`);
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `zero-mon-dashboard-${lang}`);
    await page.goto(`${BASE}/?lang=${lang}#/destination/oaxaca`);
    await ready(page);
    await page.locator(`[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`).first().scrollIntoViewIfNeeded();
    await shot(page, `zero-mon-destination-${lang}`);
    if (Z.errors.length || Z.txAttempts.length) throw new Error(`zero-MON browsing: ${Z.errors.length} console errors, ${Z.txAttempts.length} tx attempts ${JSON.stringify(Z.errors.slice(0, 3))}`);
    log.push({ part: curPart,  what: `[${lang}] 0-MON wallet + signed out: ${Z.routes.length} route visits, 0 console errors, 0 tx attempts`, state: 'confirmed', address: addr });

    // the user has ticket money (mock USDC minted by a test account) but no MON
    const mint = await funder.writeContract({ address: DEP.usdc, abi: abi('MockToken'), functionName: 'faucet', args: [addr, parseUnits('100', 6)] });
    await pub.waitForTransactionReceipt({ hash: mint });
    await page.waitForTimeout(1500);
    const btn = page.locator(`[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`).first();
    Z.buttonHint = await btn.locator('.cost').textContent().catch(() => null);
    const before = Number(await page.evaluate(() => document.body.dataset.actions || 0));
    await btn.click();
    await page.waitForSelector('#topup .sheet', { timeout: 60000 });
    await page.waitForTimeout(800); // QR render
    Z.sheet = await page.evaluate(() => ({ need: document.getElementById('topup').dataset.need, suggested: document.getElementById('topup').dataset.suggested,
      needText: document.getElementById('topup-need').textContent, suggestText: document.getElementById('topup-suggest').textContent, balText: document.getElementById('topup-bal').textContent,
      addr: document.getElementById('topup-addr').textContent, qr: !!document.querySelector('#topup-qr svg'), title: document.getElementById('topup-title').textContent }));
    Z.quote = await page.evaluate(() => window.__lastQuote);
    if (Z.sheet.addr !== addr || !Z.sheet.qr) throw new Error('top-up sheet missing address / QR');
    if (Z.txAttempts.length) throw new Error('a transaction was attempted while the wallet was short');
    console.log(`✓ [${lang}] buy → "${Z.sheet.title.trim()}" sheet: need ${Z.sheet.needText}, suggested ${Z.sheet.suggestText}, balance ${Z.sheet.balText}, QR ✓, 0 tx sent`);
    log.push({ part: curPart,  what: `[${lang}] 0-MON wallet clicks "Buy a ticket" → top-up sheet (need ${Z.sheet.needText}, suggested ${Z.sheet.suggestText}); nothing sent`, state: 'confirmed' });
    await page.click('#topup-copy');
    await shot(page, `topup-sheet-${lang}`);

    // a test account sends the suggested amount; the sheet sees it, waits for Monad's lagged balance, continues
    const fund = await funder.sendTransaction({ to: addr, value: BigInt(Z.sheet.suggested) });
    const frc = await pub.waitForTransactionReceipt({ hash: fund });
    Z.funded = { mon: formatEther(BigInt(Z.sheet.suggested)), block: Number(frc.blockNumber), from: funder.account.address };
    console.log(`  test account #19 sent ${Z.funded.mon} MON (block ${Z.funded.block})`);
    await page.waitForFunction((n) => Number(document.body.dataset.actions || 0) > n && document.body.dataset.ready === '1', before, { timeout: 180000 });
    const toasts = await page.$$eval('.toast', (els) => els.map((e) => ({ state: [...e.classList].find((c) => c !== 'toast'), text: e.innerText.replace(/\s+/g, ' ') })));
    const confirmed = toasts.filter((t) => t.state === 'confirmed');
    const last = toasts[toasts.length - 1];
    if (last.state !== 'confirmed') throw new Error(`purchase after funding failed: ${last.text}`);
    Z.txs = confirmed.map((t) => ({ toast: t.text, gas: Number((t.text.match(/gas ([\d,.]+)/) || [])[1]?.replace(/[,.]/g, '') || 0) }));
    const after = await pub.getBalance({ address: addr });
    Z.monAfter = formatEther(after);
    Z.monSpent = formatEther(BigInt(Z.sheet.suggested) - after);
    Z.ticketsOwned = await page.$$eval(`[data-act="listResale"]`, (els) => els.length).catch(() => null);
    console.log(`✓ [${lang}] purchase completed automatically after funding: ${Z.txs.length} tx, spent ${Z.monSpent} MON (quoted max ${Z.sheet.needText}), left ${Z.monAfter}`);
    for (const t of Z.txs) log.push({ part: curPart,  what: `[${lang}] after top-up, auto-continued: ${t.toast.split(/ Confirm(ed|ado)/)[0].replace(/^✓ /, '')}`, state: 'confirmed', gas: t.gas, toast: t.toast });
    await page.locator(`[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`).first().scrollIntoViewIfNeeded();
    await shot(page, `topup-funded-confirmed-${lang}`);
    await page.goto(`${BASE}/?lang=${lang}#/trip`); // same document: the session and the toasts stay
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    Z.dashboardAfter = await page.evaluate(() => ({ chip: document.getElementById('mon-chip')?.textContent, ticketRows: document.querySelectorAll('[data-act="listResale"]').length }));
    await shot(page, `topup-funded-dashboard-${lang}`);
    zeroMon[lang] = Z;
    await ctx.close();
  }

  curPart = 'passkey';
  for (const lang of PARTS.has('passkey') ? ['en', 'es'] : []) {
    // ---------------------------------------------------------------- 1. passkey wallet (Mera)
    const { ctx, page, auth } = await newPage(lang, { passkey: true });
    await page.goto(`${BASE}/?lang=${lang}&drip=1#/trip`); // legacy flow: DEV drip opted in (off by default)
    await ready(page);
    await page.click('[data-signin="create"]');
    await page.waitForSelector('body[data-wallet="passkey"][data-ready="1"]', { timeout: 90000 });
    const addr1 = (await page.textContent('#wallet-card .hash')).trim();
    const creds = await auth.cdp.send('WebAuthn.getCredentials', { authenticatorId: auth.authenticatorId });
    console.log(`✓ [${lang}] passkey wallet created via Mera PRF: ${addr1} (${creds.credentials.length} credential, rpId ${creds.credentials[0]?.rpId})`);
    log.push({ part: curPart,  what: `[${lang}] create passkey wallet`, state: 'confirmed', address: addr1, rpId: creds.credentials[0]?.rpId });
    // sign out → sign back in with the same passkey → same address (PRF is deterministic)
    await page.click('#sign-out');
    await page.waitForSelector('[data-signin="have"]');
    await page.click('[data-signin="have"]');
    await page.waitForSelector('body[data-wallet="passkey"][data-ready="1"]', { timeout: 90000 });
    const addr2 = (await page.textContent('#wallet-card .hash')).trim();
    if (addr1 !== addr2) throw new Error(`re-sign-in gave a different address ${addr2}`);
    console.log(`✓ [${lang}] signed out and back in with "I already have a wallet": same address`);
    log.push({ part: curPart,  what: `[${lang}] sign back in (same address)`, state: 'confirmed', address: addr2 });
    // second secret: unlock the note vault, seal a note, lock (re-sign-in), unlock, read it back
    await page.click('#note-unlock');
    await page.waitForSelector('#note-text');
    const noteText = lang === 'en' ? 'Mezcal tasting Friday · ask Marisol about Monte Albán sunrise' : 'Cata de mezcal el viernes · preguntar a Marisol por el amanecer en Monte Albán';
    await page.fill('#note-text', noteText);
    await page.click('#note-save');
    await page.waitForTimeout(300);
    const sealed = await page.evaluate((a) => localStorage.getItem(`tours.note.${a.toLowerCase()}`), addr1);
    if (!sealed || sealed.includes('Mezcal') || sealed.includes('mezcal')) throw new Error('note not sealed');
    log.push({ part: curPart,  what: `[${lang}] private note sealed with the second PRF secret`, state: 'confirmed', ciphertextBytes: sealed.length });
    console.log(`✓ [${lang}] private note sealed (${sealed.length} bytes of AES-GCM JSON in localStorage, no plaintext)`);
    await action(page, '[data-act="faucet"]', `[${lang}] passkey wallet: get 1,000 test USDC (?drip=1: DEV drip opted in)`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `wallet-passkey-dashboard-${lang}`);
    // real ticket purchase from the passkey wallet
    await page.goto(`${BASE}/?lang=${lang}&drip=1#/destination/oaxaca`);
    await ready(page);
    await action(page, `[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`, `[${lang}] passkey wallet: buy a ticket for Oaxaca night 2`);
    await page.locator(`[data-act="buyTicket"][data-id="${demo.shows.oaxaca2}"]`).first().scrollIntoViewIfNeeded();
    await shot(page, `ticket-purchase-${lang}`);
    // resale listing at the cap from the dashboard; the destination page then shows it
    await page.goto(`${BASE}/?lang=${lang}&drip=1#/trip`);
    await ready(page);
    await action(page, '[data-act="listResale"]', `[${lang}] passkey wallet: list the ticket for resale at 110% of face`);
    await page.locator('[data-act="cancelResale"]').first().scrollIntoViewIfNeeded();
    await shot(page, `resale-listed-dashboard-${lang}`);
    await page.goto(`${BASE}/?lang=${lang}&drip=1#/destination/oaxaca`);
    await ready(page);
    await page.locator('.resale').first().scrollIntoViewIfNeeded();
    await shot(page, `resale-listing-${lang}`);
    await page.goto(`${BASE}/?lang=${lang}&drip=1#/destination/cdmx`);
    await ready(page);
    await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('toasts')?.remove(); });
    await shot(page, `destination-cdmx-${lang}`, true);
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. partner side with DEV test accounts
  const dev = async (actor, hash) => { const x = await newPage('en'); await x.page.goto(`${BASE}/?lang=en&dev=${actor}${hash}`); await x.page.waitForSelector('body[data-wallet="dev"][data-ready="1"]', { timeout: 90000 }); return x; };
  curPart = 'extra';
  if (PARTS.has('extra')) {
    const { ctx, page } = await dev('traveler', '#/trip');
    await action(page, '[data-act="redeem"]:not([disabled])', 'DEV Ana: redeem a perk with $TOURS points');
    await ctx.close();
  }
  curPart = 'partner';
  if (PARTS.has('partner')) {
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
  // re-running some parts keeps the other parts' results from the last run (each entry is tagged with its part)
  const prev = existsSync(`${ROOT}demo/ui-flows.json`) ? JSON.parse(readFileSync(`${ROOT}demo/ui-flows.json`, 'utf8')) : { steps: [], shots: [] };
  const shotPart = (x) => (/zero-mon|topup/.test(x) ? 'zero' : /partner-/.test(x) ? 'partner' : 'passkey');
  log.unshift(...prev.steps.filter((x) => x.part && !PARTS.has(x.part)));
  shots.unshift(...prev.shots.filter((x) => !PARTS.has(shotPart(x))).map((x) => ROOT + x));
  writeFileSync(`${ROOT}demo/ui-flows.json`, JSON.stringify({ when: new Date().toISOString(), zeroMon: PARTS.has('zero') ? zeroMon : prev.zeroMon, steps: log, shots: shots.map((p) => p.replace(ROOT, '')) }, null, 2));
}
console.log(shots.join('\n'));
