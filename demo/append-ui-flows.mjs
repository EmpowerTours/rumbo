// Appends demo/ui-flows.json (UI transactions from the passkey wallet + DEV partner flows) to demo/transcript.md as §6b.
import { readFileSync, appendFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const d = JSON.parse(readFileSync(`${ROOT}demo/ui-flows.json`, 'utf8'));
let md = '\n## 6b. In the UI: real transactions from a Mera passkey wallet and DEV test accounts (`demo/ui-flows.mjs` → `demo/ui-flows.json`)\n\n'
  + 'Headless Chromium on http://localhost with the CDP virtual authenticator (PRF extension on), so the Mera passkey ceremony, PRF → key derivation and in-page signing are the real code paths. Gas is from the confirmation toast (= the receipt).\n\n'
  + '| Step | Result | Gas |\n|---|---|---:|\n';
for (const s of d.steps) md += `| ${s.what.replace(/\|/g, '/')} | ${s.state}${s.address ? ` · ${s.address}` : ''} | ${s.gas ? s.gas.toLocaleString('en-US') : '—'} |\n`;
appendFileSync(`${ROOT}demo/transcript.md`, md);
console.log(`appended ${d.steps.length} UI steps to demo/transcript.md`);
