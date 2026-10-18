// Appends demo/ui-flows.json (UI transactions from the passkey wallet + DEV partner flows) to demo/transcript.md as §6b.
import { readFileSync, appendFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const d = JSON.parse(readFileSync(`${ROOT}demo/ui-flows.json`, 'utf8'));
let md = '\n## 6b. In the Rumbo UI: real transactions from a Mera passkey wallet and DEV test accounts (`demo/ui-flows.mjs` → `demo/ui-flows.json`)\n\n'
  + 'Headless Chromium on http://localhost with the CDP virtual authenticator (PRF extension on), so the Mera passkey ceremony, PRF → key derivation and in-page signing are the real code paths. Gas is from the confirmation toast (= the receipt).\n\n'
  + '| Step | Result | Gas |\n|---|---|---:|\n';
for (const s of d.steps) md += `| ${s.what.replace(/\|/g, '/')} | ${s.state}${s.address ? ` · ${s.address}` : ''} | ${s.gas ? s.gas.toLocaleString('en-US') : '—'} |\n`;
if (d.zeroMon) {
  md += '\n### 6c. Rumbo with a zero-MON wallet, no gas sponsorship\n\nA brand-new Mera passkey wallet with **0 MON** (DEV drip off). Every route was visited signed out and signed in; a ticket purchase opened the top-up sheet instead of sending; a Solonet test account then sent the suggested MON and the purchase finished by itself.\n\n'
    + '| Lang | Route visits | Console errors | Tx attempts while short | Sheet: needed / suggested | Funded | Txs after funding | MON actually spent |\n|---|---:|---:|---:|---|---|---|---:|\n';
  for (const [lang, z] of Object.entries(d.zeroMon)) {
    md += `| ${lang} | ${z.routes.length} | ${z.routes.reduce((a, r) => a + r.consoleErrors, 0)} | ${z.routes.reduce((a, r) => a + r.txOnLoad, 0)} | ${z.sheet.needText} / ${z.sheet.suggestText} | ${z.funded.mon} MON @ #${z.funded.block} | ${z.txs.map((t) => t.gas.toLocaleString('en-US')).join(' + ')} gas | ${Number(z.monSpent).toFixed(6)} |\n`;
  }
  const z = Object.values(d.zeroMon)[0];
  const hints = {};
  for (const r of z.routes) for (const h of r.monHints) hints[h.act] = h.hint;
  md += `\n"~X MON" hints shown on buttons for the 0-MON wallet: ${Object.entries(hints).map(([k, v]) => `${k} ${v}`).join(' · ')}.\n`;
}
appendFileSync(`${ROOT}demo/transcript.md`, md);
console.log(`appended ${d.steps.length} UI steps to demo/transcript.md`);
