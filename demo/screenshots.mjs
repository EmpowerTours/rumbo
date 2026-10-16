// Headless screenshots of the local UI (EN + ES, desktop + mobile). Starts Vite on 127.0.0.1 only.
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
const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['ui', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((res, rej) => {
  vite.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); });
  vite.on('exit', (c) => rej(new Error(`vite exited ${c}`)));
  setTimeout(res, 8000);
});
mkdirSync(`${ROOT}screenshots`, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome() });
const shots = [];
try {
  for (const [lang, vp, name] of [
    ['en', { width: 1280, height: 1500 }, 'desktop-en'], ['es', { width: 1280, height: 1500 }, 'desktop-es'],
    ['en', { width: 400, height: 860 }, 'mobile-en'], ['es', { width: 400, height: 860 }, 'mobile-es'],
  ]) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${PORT}/?lang=${lang}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
    await page.waitForTimeout(400);
    const path = `${ROOT}screenshots/${name}.png`;
    await page.screenshot({ path, fullPage: name.startsWith('desktop') });
    shots.push(path);
    await page.close();
  }
} finally {
  await browser.close();
  vite.kill();
}
console.log(shots.join('\n'));
