// Headless screenshots of the local UI (EN + ES, desktop + mobile). Starts Vite on localhost only. Signed-out (read-only) views;
// demo/ui-flows.mjs takes the signed-in / transaction screenshots.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROOT } from './lib.mjs';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = `${process.env.HOME}/.cache/ms-playwright`;
  for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) if (existsSync(`${base}/${d}/${sub}`)) return `${base}/${d}/${sub}`;
  }
  return undefined; // fall back to playwright's own
}

const PORT = 5181;
const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['ui', '--port', String(PORT), '--host', 'localhost', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((res, rej) => {
  vite.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); });
  vite.on('exit', (c) => rej(new Error(`vite exited ${c}`)));
  setTimeout(res, 8000);
});
mkdirSync(`${ROOT}screenshots`, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome() });
const shots = [];
try {
  const D = { width: 1280, height: 1500 }, M = { width: 400, height: 860 };
  const plan = [];
  for (const lang of ['en', 'es']) {
    plan.push([lang, D, `desktop-${lang}`, '#/trip'], [lang, M, `mobile-${lang}`, '#/trip']);
    plan.push([lang, D, `destination-oaxaca-${lang}`, '#/destination/oaxaca'], [lang, M, `destination-oaxaca-mobile-${lang}`, '#/destination/oaxaca']);
    plan.push([lang, M, `destination-cdmx-mobile-${lang}`, '#/destination/cdmx']);
    for (const role of ['host', 'guide', 'venue', 'venue/1', 'artist']) plan.push([lang, D, `partner-${role.replace('/', '-')}-${lang}`, `#/partner/${role}`]);
  }
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  for (const [lang, vp, name, hash] of plan.filter((x) => !only || only.test(x[2]))) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1.5, timezoneId: 'America/Mexico_City' });
    await page.goto(`http://localhost:${PORT}/?lang=${lang}${hash}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
    await page.waitForTimeout(400);
    const path = `${ROOT}screenshots/${name}.png`;
    await page.screenshot({ path, fullPage: vp.width > 500 });
    shots.push(path);
    await page.close();
  }
} finally {
  await browser.close();
  vite.kill();
}
console.log(shots.join('\n'));
