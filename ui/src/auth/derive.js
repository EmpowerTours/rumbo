// Ported from empowertours-hunt lib/auth/derive.ts (same algorithm, EmpowerTours Tours salt).
// Pure: no mera import, so it can be tested in Node.
//
// A passkey's PRF output (32 secret bytes, reproduced forever for the same credential, rpId and
// salt) is mapped through BIP-39 to a 24-word mnemonic and m/44'/60'/0'/0/0, giving an ORDINARY
// Ethereum account. The traveler never sees or writes down a seed phrase: the passkey IS the
// wallet. (The mnemonic exists only so the account is a standard one that other wallets can
// import later if the traveler ever asks for it; this UI never shows or stores it.)
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { sha256, stringToBytes } from 'viem';

/** Standard first Ethereum account. Changing this orphans every wallet. */
export const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

/**
 * EmpowerTours Tours' own 32-byte PRF salt. Different from Hunt's
 * ("empowertours-hunt/passkey/v1") so the same face yields a different, unrelated wallet here
 * even if both apps were ever served from one host. It must never change: derive.test.mjs pins it.
 */
export const TOURS_PRF_SALT_LABEL = 'empowertours-tours/passkey/v1';
export const TOURS_PRF_SALT = sha256(stringToBytes(TOURS_PRF_SALT_LABEL), 'bytes');

/** Map 32 PRF bytes to the account key beneath them. Throws unless exactly 32 bytes. */
export function walletFromPrfOutput(prfOutput) {
  if (prfOutput.length !== 32) throw new Error(`expected 32 bytes of PRF output, got ${prfOutput.length}`);
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(ACCOUNT_PATH);
  if (node.privateKey === null) throw new Error('derivation produced no key');
  return { mnemonic, privateKey: node.privateKey };
}
