// Headless end-to-end run of the round-4 PARTNER CREATION flows, entirely through the UI (Chromium + Vite
// on localhost only), in EN and ES. Brand-new Mera passkey wallets (Chrome CDP virtual authenticator with
// PRF) play the new host, the new venues and the new artist; the DEV test account Sofía plays the traveler/
// fan. Gas: ?drip=1 (DEV-only opt-in drip from test account #19), the same gas-estimate path as always.
//   1. validation: empty listing form → inline errors, nothing sent
//   2. new host publishes a stay (photos → local content store, host profile + listing), edits it, pauses
//      and resumes it, publishes + deletes a second listing; the stay shows on the Oaxaca page
//   3. Sofía books it with her wallet from the destination page; the host accepts
//   4. new venue (validation: cancel fee > deposit), new artist profile, request a date (closed-day error,
//      then a real request with the deposit in escrow), venue accepts, artist opens ticket sales, Sofía
//      buys, venue door-scans, venue confirms the show, artist settles
//   5. second new venue; artist requests a date ~3 min out, opens sales, Sofía buys; the show time passes;
//      the venue files the no-show claim
// Writes screenshots/*.png and demo/ui-create.json (gas limits / used / MON per action).
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROOT, pub, assertSolonet, deployments, abi } from './lib.mjs';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = `${process.env.HOME}/.cache/ms-playwright`;
  for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) if (existsSync(`${base}/${d}/${sub}`)) return `${base}/${d}/${sub}`;
  }
  return undefined;
}
const PORT = 5183;
const BASE = `http://localhost:${PORT}`;
const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['ui', '--port', String(PORT), '--host', 'localhost', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((res, rej) => { vite.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); vite.on('exit', (c) => rej(new Error(`vite exited ${c}`))); setTimeout(res, 8000); });
mkdirSync(`${ROOT}screenshots`, { recursive: true });
await assertSolonet();
const DEP = deployments();
const browser = await chromium.launch({ executablePath: findChrome() });
const LANGS = (process.env.LANGS || 'en,es').split(',');
const log = [], shots = [], checks = [];
const D = { width: 1280, height: 1000 };
const chainNow = async () => Number((await pub.getBlock()).timestamp);
const cdmxLocal = (ts) => new Date((ts - 6 * 3600) * 1000).toISOString().slice(0, 16);

// ---- illustrative photos, rendered locally (no network) ----
const photoPage = await (await browser.newContext({ viewport: { width: 960, height: 640 } })).newPage();
async function photo(emoji, a, b, label) {
  await photoPage.setContent(`<body style="margin:0"><div style="width:960px;height:640px;background:linear-gradient(135deg,${a},${b});display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:sans-serif">
    <div style="font-size:260px;line-height:1">${emoji}</div><div style="font-size:40px;color:#fff;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,.3)">${label}</div></div></body>`);
  return { name: `${label.replace(/\W+/g, '-').toLowerCase()}.jpg`, mimeType: 'image/jpeg', buffer: await photoPage.screenshot({ type: 'jpeg', quality: 82 }) };
}

async function newPage(lang, { passkey = false } = {}) {
  const ctx = await browser.newContext({ viewport: D, deviceScaleFactor: 1.5, timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('   [console]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
  if (passkey) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  }
  return { ctx, page };
}
const ready = (page) => page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
// Same-document navigation keeps the passkey session (the query string must not change). Navigating to the
// current hash fires no hashchange, so hop via another route first; every hashchange re-reads the chain.
const go = async (page, q, hash) => {
  if (page.url().endsWith(hash)) { await page.evaluate(() => { document.body.dataset.ready = ''; }); await page.goto(`${BASE}/?${q}#/trip`); await ready(page); }
  if (page.url().startsWith(BASE)) await page.evaluate(() => { document.body.dataset.ready = ''; });
  await page.goto(`${BASE}/?${q}${hash}`); await ready(page);
};
async function passkeyUser(lang, who) {
  const x = await newPage(lang, { passkey: true });
  x.q = `lang=${lang}&drip=1`;
  await go(x.page, x.q, '#/trip');
  await x.page.click('[data-signin="create"]');
  await x.page.waitForSelector('body[data-wallet="passkey"][data-ready="1"]', { timeout: 120000 });
  x.addr = (await x.page.textContent('#wallet-card .hash')).trim();
  console.log(`✓ [${lang}] ${who}: new Mera passkey wallet ${x.addr}`);
  log.push({ lang, what: `${who}: new Mera passkey wallet`, state: 'confirmed', address: x.addr });
  return x;
}
async function devUser(lang, key) {
  const x = await newPage(lang);
  x.q = `lang=${lang}&dev=${key}`;
  await go(x.page, x.q, '#/trip');
  await x.page.waitForSelector('body[data-wallet="dev"][data-ready="1"]', { timeout: 120000 });
  return x;
}
const actions = (page) => page.evaluate(() => Number(document.body.dataset.actions || 0));
const waitAction = (page, n) => page.waitForFunction((k) => Number(document.body.dataset.actions || 0) > k && document.body.dataset.ready === '1', n, { timeout: 180000 });
async function action(page, selector, lang, what, act) {
  const n = await actions(page);
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await waitAction(page, n);
  const toasts = await page.$$eval('.toast', (els) => els.map((e) => ({ state: [...e.classList].find((c) => c !== 'toast'), text: e.innerText.replace(/\s+/g, ' ') })));
  const last = toasts[toasts.length - 1];
  const q = await page.evaluate(() => window.__lastQuote);
  const entry = { lang, act, what, state: last?.state, toast: last?.text, limits: q?.limits, gasUsed: q?.gasUsed, quotedWei: q?.need, paidWei: q?.paidWei, maxFeePerGas: q?.maxFeePerGas };
  log.push(entry);
  console.log(`${last?.state === 'confirmed' ? '✓' : '✗'} [${lang}] ${what} — ${String(last?.text).slice(0, 150)}`);
  if (last?.state !== 'confirmed' || q?.action !== act) throw new Error(`${what} failed: ${last?.text}`);
  return entry;
}
/** Submit that must be refused client-side: inline errors, error toast, no transaction, no top-up sheet. */
async function expectInvalid(page, selector, lang, what, minErrors = 1) {
  let sent = 0;
  const onReq = (r) => { if (/eth_sendRawTransaction/.test(r.postData() || '')) sent++; };
  page.on('request', onReq);
  const n = await actions(page);
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.locator(selector).first().click();
  await waitAction(page, n);
  page.off('request', onReq);
  const errs = await page.$$eval('.field-error', (els) => els.map((e) => e.textContent.trim()));
  const toast = await page.$$eval('.toast', (els) => els.at(-1)?.innerText.replace(/\s+/g, ' '));
  const sheet = await page.locator('#topup .sheet').count();
  const ok = errs.length >= minErrors && sent === 0 && sheet === 0;
  checks.push({ lang, what, ok, fieldErrors: errs, toast, txSent: sent, topupSheet: sheet });
  log.push({ lang, what, state: ok ? 'refused-as-expected' : 'FAILED', fieldErrors: errs, toast });
  console.log(`${ok ? '✓' : '✗'} [${lang}] ${what} — ${errs.length} inline errors (${errs.slice(0, 3).join(' | ')}), toast “${toast}”, ${sent} tx`);
  if (!ok) throw new Error(`${what}: validation did not behave`);
}
async function shot(page, name, { full = false, el = null } = {}) {
  const path = `${ROOT}screenshots/${name}.png`;
  await page.waitForTimeout(350);
  if (el) await page.locator(el).first().screenshot({ path }); else await page.screenshot({ path, fullPage: full });
  shots.push(path.replace(ROOT, ''));
}
const fillForm = async (page, key, values) => { for (const [f, v] of Object.entries(values)) {
  const loc = page.locator(`[data-k="${key}"][data-f="${f}"]`);
  const tag = await loc.evaluate((e) => `${e.tagName}:${e.type}`);
  if (tag.startsWith('SELECT')) await loc.selectOption(String(v)); else if (tag.endsWith('checkbox')) await loc.setChecked(!!v); else await loc.fill(String(v));
} };

const P = {};
try {
  const photos = {
    stay: [await photo('🏡', '#c8553d', '#f2a541', 'Patio'), await photo('🛏️', '#7b5ea7', '#c8553d', 'Habitación'), await photo('🌵', '#2f7f6f', '#f2a541', 'Jardín')],
    tour: [await photo('🚐', '#3d7ea6', '#2f7f6f', 'Mercado')],
    venue: [await photo('🏛️', '#2b1d14', '#7b5ea7', 'Escenario'), await photo('🎶', '#7b5ea7', '#3d7ea6', 'Sala')],
    artist: [await photo('🎤', '#c8553d', '#7b5ea7', 'En vivo')],
  };
  for (const lang of LANGS) {
    const es = lang === 'es';
    const tag = es ? 'ES' : 'EN';
    // ================================================================ host
    const H = await passkeyUser(lang, 'new host');
    await go(H.page, H.q, '#/partner/host');
    await shot(H.page, `become-host-cta-${lang}`);
    await go(H.page, H.q, '#/create/listing/stay');
    await expectInvalid(H.page, '[data-act="saveListing"]', lang, 'publish an empty listing form', 6);
    await shot(H.page, `create-listing-errors-${lang}`);
    await fillForm(H.page, 'new-listing', {
      title: es ? `Casa Jacaranda · cuarto con patio (${tag})` : `Casa Jacaranda · patio room (${tag})`,
      desc: es ? 'Cuarto luminoso con baño propio, a dos cuadras del templo de Jalatlaco. Café de olla por la mañana y hamaca en el patio.'
        : 'Bright room with its own bathroom, two blocks from the Jalatlaco church. Café de olla in the morning and a hammock in the patio.',
      city: 'oaxaca', place: 'Jalatlaco', price: '36', cap: '4', policy: 'moderate', perk_breakfast: true, perk_wifi: true, perk_bilingual: true,
      other: es ? 'Hamaca, Cocina compartida' : 'Hammock, Shared kitchen', hostName: es ? 'Paloma (Casa Jacaranda)' : 'Paloma (Casa Jacaranda)',
      hostBio: es ? 'Oaxaqueña, guía de mercados los fines de semana.' : 'Born in Oaxaca, market guide on weekends.' });
    await H.page.locator('[data-k="new-listing"][data-photos]').setInputFiles(photos.stay);
    await H.page.waitForSelector('[data-form="new-listing"] .photos .ph img');
    for (let i = 0; i < 10; i++) await H.page.locator('[data-form="new-listing"] .daychip').nth(i).click();
    await H.page.evaluate(() => window.scrollTo(0, 0));
    await shot(H.page, `create-listing-form-${lang}`, { full: true });
    await action(H.page, '[data-act="saveListing"]', lang, 'new host publishes a stay (host profile + listing with metadata by content hash)', 'saveListing');
    if (!/#\/partner\/host$/.test(H.page.url())) throw new Error(`expected redirect to host dashboard, at ${H.page.url()}`);
    const lid = Number(await H.page.locator('[data-listing]').last().getAttribute('data-listing'));
    P[lang] = { listing: lid, host: H.addr };
    // edit: price 36 → 39
    await go(H.page, H.q, `#/create/listing/${lid}`);
    await fillForm(H.page, `edit-${lid}`, { price: '39' });
    await action(H.page, '[data-act="saveListing"]', lang, `host edits listing #${lid} (price 36 → 39 USDC)`, 'saveListing');
    await action(H.page, `[data-act="toggleListing"][data-id="${lid}"]`, lang, `host pauses listing #${lid}`, 'toggleListing');
    await go(H.page, H.q, '#/destination/oaxaca');
    checks.push({ lang, what: 'paused listing hidden on destination page', ok: (await H.page.locator(`.row[data-listing="${lid}"]`).count()) === 0 });
    await go(H.page, H.q, '#/partner/host');
    await action(H.page, `[data-act="toggleListing"][data-id="${lid}"]`, lang, `host resumes listing #${lid}`, 'toggleListing');
    // second listing (tour) then delete it with the two-step confirm
    await go(H.page, H.q, '#/create/listing/tour');
    await fillForm(H.page, 'new-listing', { title: es ? `Mercado 20 de Noviembre a pie (${tag})` : `Mercado 20 de Noviembre walk (${tag})`,
      desc: es ? 'Dos horas probando tlayudas, chocolate y chapulines con una guía local.' : 'Two hours tasting tlayudas, chocolate and chapulines with a local guide.',
      city: 'oaxaca', place: 'Centro', price: '18', cap: '8', policy: 'flexible' });
    await H.page.locator('[data-k="new-listing"][data-photos]').setInputFiles(photos.tour);
    for (let i = 0; i < 3; i++) await H.page.locator('[data-form="new-listing"] .daychip').nth(i).click();
    await action(H.page, '[data-act="saveListing"]', lang, 'host publishes a second listing (tour; profile already saved → 1 tx)', 'saveListing');
    const lid2 = Number(await H.page.locator('[data-listing]').last().getAttribute('data-listing'));
    await go(H.page, H.q, '#/partner/guide');
    await H.page.locator(`[data-listing="${lid2}"] [data-delask]`).click();
    await H.page.waitForSelector(`[data-act="removeListing"][data-id="${lid2}"]`);
    await shot(H.page, `delete-listing-confirm-${lang}`, { el: `[data-listing="${lid2}"]` });
    await action(H.page, `[data-act="removeListing"][data-id="${lid2}"]`, lang, `host deletes listing #${lid2} (two-step confirm)`, 'removeListing');
    // on the destination page
    await go(H.page, H.q, '#/destination/oaxaca');
    const row = H.page.locator(`.row[data-listing="${lid}"]`);
    checks.push({ lang, what: `new listing #${lid} on the Oaxaca destination page with photo, perks, policy`, ok: (await row.count()) === 1 && (await row.locator('img.thumb').count()) === 1 && (await row.locator('.perk').count()) >= 4 });
    checks.push({ lang, what: `deleted listing #${lid2} not on the destination page`, ok: (await H.page.locator(`.row[data-listing="${lid2}"]`).count()) === 0 });
    // ================================================================ traveler books it
    const F = await devUser(lang, 'fan');
    await action(F.page, '[data-act="faucet"]', lang, 'DEV Sofía: test USDC', 'faucet');
    await go(F.page, F.q, '#/destination/oaxaca');
    await F.page.locator(`.row[data-listing="${lid}"]`).scrollIntoViewIfNeeded();
    await shot(F.page, `new-listing-destination-${lang}`);
    await F.page.locator(`#bd-units-${lid}`).selectOption('2');
    await action(F.page, `[data-act="bookDirect"][data-id="${lid}"]`, lang, `DEV Sofía books 2 nights of listing #${lid} from her wallet (approve + book into escrow)`, 'bookDirect');
    await go(H.page, H.q, '#/partner/host');
    await action(H.page, '[data-act="hostAccept"]', lang, 'new host accepts Sofía\'s booking', 'hostAccept');
    await shot(H.page, `new-host-dashboard-${lang}`, { full: true });

    // ================================================================ venue + artist full cycle
    const V = await passkeyUser(lang, 'new venue');
    await go(V.page, V.q, '#/partner/venue');
    await go(V.page, V.q, '#/create/venue');
    const vname = es ? `Foro Jacaranda (${tag})` : `Foro Jacaranda (${tag})`;
    await fillForm(V.page, 'new-venue', { name: vname, city: 'oaxaca', place: 'Xochimilco', cap: '120', deposit: '50', fee: '80', share: '20' });
    await V.page.locator('[data-k="new-venue"][data-photos]').setInputFiles(photos.venue);
    await expectInvalid(V.page, '[data-act="createVenue"]', lang, 'venue form with cancel fee (80) > deposit (50)', 1);
    await fillForm(V.page, 'new-venue', { fee: '15' });
    await action(V.page, '[data-act="createVenue"]', lang, 'new venue publishes its profile (venue + 7 open dates + this wallet as door scanner)', 'createVenue');
    const vid = Number(V.page.url().match(/venue\/(\d+)/)[1]);
    const A = await passkeyUser(lang, 'new artist');
    await action(A.page, '[data-act="faucet"]', lang, 'new artist: test USDC for the deposit', 'faucet');
    await go(A.page, A.q, '#/create/artist');
    await expectInvalid(A.page, '[data-act="saveArtist"]', lang, 'empty artist profile', 1);
    await fillForm(A.page, 'artist', { name: es ? `Las Jacarandas (${tag})` : `The Jacarandas (${tag})`, genre: 'son jarocho · indie', city: 'cdmx',
      bio: es ? 'Cuarteto de jarana y sintetizadores. Gira por Oaxaca en noviembre.' : 'Jarana-and-synth quartet. Touring Oaxaca in November.' });
    await A.page.locator('[data-k="artist"][data-photos]').setInputFiles(photos.artist);
    await action(A.page, '[data-act="saveArtist"]', lang, 'new artist saves a profile', 'saveArtist');
    const card = `[data-form="req-${vid}"]`;
    const t0 = await chainNow();
    await fillForm(A.page, `req-${vid}`, { when: cdmxLocal(t0 + 10 * 86400), title: es ? 'Jacarandas en vivo' : 'Jacarandas live' });
    await expectInvalid(A.page, `[data-act="requestDate"][data-venue="${vid}"]`, lang, 'request a date the venue has not opened', 1);
    await shot(A.page, `artist-request-closed-error-${lang}`, { el: card });
    const showTs = (await chainNow()) + 25 * 60;
    await fillForm(A.page, `req-${vid}`, { when: cdmxLocal(showTs) });
    await A.page.locator(card).scrollIntoViewIfNeeded();
    await shot(A.page, `artist-venue-request-${lang}`);
    await action(A.page, `[data-act="requestDate"][data-venue="${vid}"]`, lang, `new artist requests a date at ${vname} (approve + bookShow, 50 USDC deposit into escrow)`, 'requestDate');
    const sid = Number(await A.page.locator('#my-shows [data-show]').last().getAttribute('data-show'));
    P[lang] = { ...P[lang], venue: vid, show: sid, artist: A.addr };
    await go(V.page, V.q, `#/partner/venue/${vid}`);
    await action(V.page, `[data-act="venueAccept"][data-id="${sid}"]`, lang, `venue accepts show request #${sid}`, 'venueAccept');
    await go(A.page, A.q, '#/partner/artist');
    await expectInvalid(A.page, `[data-act="openSales"][data-id="${sid}"]`, lang, 'ticket sale with no price', 1);
    await fillForm(A.page, `sale-${sid}`, { price: '12', supply: '500' });
    await expectInvalid(A.page, `[data-act="openSales"][data-id="${sid}"]`, lang, 'ticket supply above the venue capacity (500 > 120)', 1);
    await fillForm(A.page, `sale-${sid}`, { supply: '80' });
    await A.page.locator(`[data-show="${sid}"]`).scrollIntoViewIfNeeded();
    await shot(A.page, `ticket-sale-setup-${lang}`);
    await action(A.page, `[data-act="openSales"][data-id="${sid}"]`, lang, `artist puts show #${sid} on sale (12 USDC × 80, resale cap shown)`, 'openSales');
    await go(F.page, F.q, '#/destination/oaxaca');
    await action(F.page, `[data-act="buyTicket"][data-id="${sid}"]`, lang, `DEV Sofía buys a ticket for show #${sid}`, 'buyTicket');
    await go(V.page, V.q, `#/partner/venue/${vid}`);
    await action(V.page, '[data-act="scanTicket"]', lang, 'venue door-scans Sofía\'s ticket (this wallet is the door scanner)', 'scanTicket');
    await action(V.page, `[data-act="confirmShow"][data-id="${sid}"]`, lang, `venue confirms show #${sid} played (door-key attestation)`, 'confirmShow');
    await go(A.page, A.q, '#/partner/artist');
    await action(A.page, `[data-act="settleShow"][data-id="${sid}"]`, lang, `artist settles show #${sid} (artist / venue / fee split)`, 'settleShow');
    await shot(A.page, `artist-settled-${lang}`, { full: true });

    // ================================================================ no-show claim
    await go(V.page, V.q, '#/create/venue');
    const vname2 = `Patio Tule (${tag})`;
    await fillForm(V.page, 'new-venue', { name: vname2, city: 'oaxaca', place: 'Santo Domingo', cap: '60', deposit: '40', fee: '15', share: '0', manual: false });
    await V.page.locator('[data-k="new-venue"][data-photos]').setInputFiles(photos.venue.slice(1));
    await action(V.page, '[data-act="createVenue"]', lang, 'same venue owner lists a second venue (instant booking)', 'createVenue');
    const vid2 = Number(V.page.url().match(/venue\/(\d+)/)[1]);
    await go(A.page, A.q, '#/partner/artist');
    const showTs2 = (await chainNow()) + 170;
    await fillForm(A.page, `req-${vid2}`, { when: cdmxLocal(showTs2), title: es ? 'Jacarandas acústico' : 'Jacarandas acoustic' });
    await action(A.page, `[data-act="requestDate"][data-venue="${vid2}"]`, lang, `artist requests a date at ${vname2} a few minutes out`, 'requestDate');
    const sid2 = Number(await A.page.locator('#my-shows [data-show]').last().getAttribute('data-show'));
    const show2 = await pub.readContract({ address: DEP.venues, abi: abi('Venues'), functionName: 'getShow', args: [BigInt(sid2)] });
    await fillForm(A.page, `sale-${sid2}`, { price: '8', supply: '40' });
    await action(A.page, `[data-act="openSales"][data-id="${sid2}"]`, lang, `artist puts show #${sid2} on sale`, 'openSales');
    await go(F.page, F.q, '#/destination/oaxaca');
    await action(F.page, `[data-act="buyTicket"][data-id="${sid2}"]`, lang, `DEV Sofía buys a ticket for show #${sid2}`, 'buyTicket');
    const wait = Number(show2.showTime) - (await chainNow()) + 3;
    console.log(`  waiting ${wait}s for show time to pass (the artist never shows up)…`);
    if (wait > 0) await V.page.waitForTimeout(wait * 1000);
    await go(V.page, V.q, `#/partner/venue/${vid2}`);
    await V.page.locator(`[data-act="noShowClaim"][data-id="${sid2}"]`).scrollIntoViewIfNeeded();
    await shot(V.page, `no-show-claim-${lang}`);
    await action(V.page, `[data-act="noShowClaim"][data-id="${sid2}"]`, lang, `venue files the no-show claim for show #${sid2} (keeps the 15 USDC cancel fee; fans refundable)`, 'noShowClaim');
    const after = await pub.readContract({ address: DEP.venues, abi: abi('Venues'), functionName: 'getShow', args: [BigInt(sid2)] });
    checks.push({ lang, what: `show #${sid2} status after the claim`, ok: Number(after.status) === 5, status: Number(after.status) });
    await shot(V.page, `no-show-claimed-${lang}`, { full: true });
    P[lang] = { ...P[lang], venue2: vid2, show2: sid2 };
    for (const x of [H, F, V, A]) await x.ctx.close();
  }
} finally {
  await browser.close();
  vite.kill();
  writeFileSync(`${ROOT}demo/ui-create.json`, JSON.stringify({ when: new Date().toISOString(), ids: P, checks, steps: log, shots }, null, 2));
}
const bad = checks.filter((c) => !c.ok);
console.log(`checks: ${checks.length - bad.length}/${checks.length} ok${bad.length ? ` — FAILED: ${bad.map((b) => b.what).join('; ')}` : ''}`);
console.log(shots.join('\n'));
if (bad.length) process.exit(1);
