// Pins Rumbo's passkey derivation to the SHARED EmpowerTours wallet: rpId, salt label, salt hash,
// one PRF → address vector, and the shared credential cookie. If this fails, every Rumbo/Hunt/art
// wallet would stop matching. Run: node ui/src/auth/derive.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { bytesToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { EMPOWERTOURS_PRF_SALT_LABEL, TOURS_PRF_SALT_LABEL, TOURS_PRF_SALT, ACCOUNT_PATH, walletFromPrfOutput } from './derive.js';
import { TOURS_VAULT_SALT_LABEL, TOURS_VAULT_SALT } from './vault-key.js';
import { resolveRpId, hostCanUseRpId, EMPOWERTOURS_RP_ID } from './rp-id.js';
import { SHARED_CREDENTIAL_COOKIE, readSharedCookie, sharedCookieValue, cookieDomain } from './credential-hint.js';

// 1. Shared wallet constants (same as Hunt lib/auth/derive.ts and fcempowertours lib/passkey/derive.ts).
assert.equal(EMPOWERTOURS_PRF_SALT_LABEL, 'empowertours-hunt/passkey/v1');
assert.equal(TOURS_PRF_SALT_LABEL, EMPOWERTOURS_PRF_SALT_LABEL);
assert.equal(ACCOUNT_PATH, "m/44'/60'/0'/0/0");
assert.equal(EMPOWERTOURS_RP_ID, 'empowertours.xyz');
// 2. Vault salt stays Rumbo-only on purpose: it is an AES key for Rumbo's private note, not a wallet.
assert.equal(TOURS_VAULT_SALT_LABEL, 'empowertours-rumbo/passkey/vault/v1');
assert.notEqual(TOURS_VAULT_SALT_LABEL, 'empowertours-hunt/passkey/vault/v1');

const PINS = JSON.parse(process.env.PRINT ? '{}' : `{"prfSalt":"0x9fc345cea9c77d56f4238d9940dfdc757b6a69fb1d83893e067cefbeda0f648f","vaultSalt":"0x6481fe42b6201ac0631dfdebd2215915d2eebd73b62cb8485725f8d2432fe1bb","address":"0x50B240678777451BEfd67B7e8c3b4366482ba8F9"}`);
const prf = new Uint8Array(32).map((_, i) => i + 1); // fixed test PRF output 0x0102…20
const addr = privateKeyToAccount(bytesToHex(walletFromPrfOutput(prf).privateKey)).address;
const got = { prfSalt: bytesToHex(TOURS_PRF_SALT), vaultSalt: bytesToHex(TOURS_VAULT_SALT), address: addr };
if (process.env.PRINT) { console.log(JSON.stringify(got)); process.exit(0); }
// prfSalt = the digest pinned in fcempowertours tools/verify-passkey-derivation.ts; address = what the
// art app's walletFromPrfOutput gives for the same 0x0102…20 PRF output (checked with tsx, Oct 2026).
assert.deepEqual(got, PINS);
assert.throws(() => walletFromPrfOutput(new Uint8Array(31)));

// 3. Cross-check sibling sources when the repos sit beside this one (CI without them just skips).
for (const f of ['../../../../fcempowertours/lib/passkey/derive.ts', '../../../../empowertours-hunt/lib/auth/derive.ts']) {
  const p = new URL(f, import.meta.url);
  if (existsSync(p)) assert.ok(readFileSync(p, 'utf8').includes(`"${EMPOWERTOURS_PRF_SALT_LABEL}"`) || readFileSync(p, 'utf8').includes(`'${EMPOWERTOURS_PRF_SALT_LABEL}'`), `salt label drifted from ${f}`);
}

// 4. rpId: only the shared parent or localhost; never the page host.
assert.equal(resolveRpId(undefined, false), 'empowertours.xyz');
assert.equal(resolveRpId('', true), 'localhost');
assert.equal(resolveRpId(' EmpowerTours.xyz ', false), 'empowertours.xyz');
for (const bad of ['rumbo.empowertours.xyz', 'hunt.empowertours.xyz', 'rumbo-web-production.up.railway.app', 'evil.xyz']) assert.throws(() => resolveRpId(bad, false));
assert.ok(hostCanUseRpId('rumbo.empowertours.xyz', 'empowertours.xyz'));
assert.ok(hostCanUseRpId('empowertours.xyz', 'empowertours.xyz'));
assert.ok(!hostCanUseRpId('rumbo-web-production.up.railway.app', 'empowertours.xyz'));
assert.ok(!hostCanUseRpId('notempowertours.xyz', 'empowertours.xyz'));

// 5. Shared credential cookie: same name and JSON shape as Hunt/art, scoped to the parent domain.
assert.equal(SHARED_CREDENTIAL_COOKIE, 'et.passkey.credential');
assert.equal(cookieDomain('localhost'), null);
const v = sharedCookieValue({ credentialId: 'AQIDBA', transports: ['internal', 'hybrid'] }, 'empowertours.xyz');
assert.match(v, /^et\.passkey\.credential=.+; domain=empowertours\.xyz; path=\/; max-age=34560000; secure; samesite=lax$/);
assert.deepEqual(readSharedCookie(`a=1; ${v.split(';')[0]}; b=2`), { credentialId: 'AQIDBA', transports: ['internal', 'hybrid'] });
assert.equal(readSharedCookie(`et.passkey.credential=${encodeURIComponent('{"credentialId":"AQIDBB"}')}`), undefined, 'non-canonical id is ignored');
assert.equal(readSharedCookie('et.passkey.credential=%7Bjunk'), undefined);

console.log('derive.test: shared rpId, salt label + hash, PRF → address (matches art app), vault salt, et.passkey.credential cookie pinned ✓');
