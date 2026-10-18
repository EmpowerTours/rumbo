// Pins Rumbo's passkey derivation: the salt labels, their hashes and one PRF → address vector.
// If this fails, every existing Rumbo wallet would change address. Run: node ui/src/auth/derive.test.mjs
import assert from 'node:assert/strict';
import { bytesToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TOURS_PRF_SALT_LABEL, TOURS_PRF_SALT, ACCOUNT_PATH, walletFromPrfOutput } from './derive.js';
import { TOURS_VAULT_SALT_LABEL, TOURS_VAULT_SALT } from './vault-key.js';

assert.equal(TOURS_PRF_SALT_LABEL, 'empowertours-rumbo/passkey/v1');
assert.equal(TOURS_VAULT_SALT_LABEL, 'empowertours-rumbo/passkey/vault/v1');
assert.notEqual(TOURS_PRF_SALT_LABEL, 'empowertours-hunt/passkey/v1');
assert.equal(ACCOUNT_PATH, "m/44'/60'/0'/0/0");
const PINS = JSON.parse(process.env.PRINT ? '{}' : `{"prfSalt":"0xa76f10c0a43b30c730a59cfeb6d0047b8f9a28216f3b2ab52f51b200b45afc3e","vaultSalt":"0x6481fe42b6201ac0631dfdebd2215915d2eebd73b62cb8485725f8d2432fe1bb","address":"0x50B240678777451BEfd67B7e8c3b4366482ba8F9"}`);
const prf = new Uint8Array(32).map((_, i) => i + 1); // fixed test PRF output 0x0102…20
const addr = privateKeyToAccount(bytesToHex(walletFromPrfOutput(prf).privateKey)).address;
const got = { prfSalt: bytesToHex(TOURS_PRF_SALT), vaultSalt: bytesToHex(TOURS_VAULT_SALT), address: addr };
if (process.env.PRINT) { console.log(JSON.stringify(got)); process.exit(0); }
assert.deepEqual(got, PINS);
assert.throws(() => walletFromPrfOutput(new Uint8Array(31)));
console.log('derive.test: salt labels, salt hashes and PRF → address vector pinned ✓');
