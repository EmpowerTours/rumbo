// DEV ONLY · Solonet test accounts. Loaded with a dynamic import guarded by import.meta.env.DEV, so a
// production build (vite build) contains none of this. These are the PUBLIC test-mnemonic accounts
// everyone's local devnet ships with — never real money, never a real key.
import { mnemonicToAccount } from 'viem/accounts';
import { createWalletClient, http, parseEther, toHex, keccak256 } from 'viem';
import { client, rpc } from '../data.js';
import { solonet } from './wallet.js';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const dev = (addressIndex) => mnemonicToAccount(TEST_MNEMONIC, { addressIndex });

/** The demo cast (same indices as demo/lib.mjs). */
export const DEV_ACTORS = ['traveler', 'friend', 'fan', 'guide', 'hostA', 'hostB', 'hostCdmx', 'artist', 'venueOax', 'venueCdmx'];
const IDX = { traveler: 1, friend: 2, guide: 3, hostA: 4, hostB: 5, artist: 6, venueOax: 10, venueCdmx: 11, fan: 12, hostCdmx: 18 };
export const devAccount = (key) => dev(IDX[key]);

/** Devnet gas: a Mera wallet is born with 0 MON. Index 19 (funded by demo/scenario.mjs) tops it up. */
export async function dripGas(address) {
  const bal = await client.getBalance({ address });
  if (bal >= parseEther('1')) return false;
  const drip = createWalletClient({ account: dev(19), chain: solonet, transport: http(rpc) });
  const hash = await drip.sendTransaction({ to: address, value: parseEther('5') });
  const rc = await client.waitForTransactionReceipt({ hash });
  // Monad checks balances against delayed state: a freshly funded account must wait a few blocks.
  while ((await client.getBlockNumber()) < rc.blockNumber + 4n) await new Promise((r) => setTimeout(r, 300));
  return true;
}

/**
 * Stand-in for the Hunt GPS attester service (TourRewards' global attester, test index 7). In
 * production the Hunt backend signs a VisitBatch after checking the phone's location; here the tab
 * signs it locally so the check-in button can be exercised end to end.
 */
export async function attestVisits(rewardsAddress, user, vault, campaignIds, visitedAts) {
  const batch = { user, vault, campaignIds, visitedAts, batchId: keccak256(toHex(`ui:${user}:${campaignIds.join(',')}:${Date.now()}`)) };
  const sig = await dev(7).signTypedData({
    domain: { name: 'EmpowerTours Rewards', version: '1', chainId: solonet.id, verifyingContract: rewardsAddress },
    primaryType: 'VisitBatch', message: batch,
    types: { VisitBatch: [{ name: 'user', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'campaignIds', type: 'uint256[]' },
      { name: 'visitedAts', type: 'uint64[]' }, { name: 'batchId', type: 'bytes32' }] },
  });
  return { batch, sig };
}
