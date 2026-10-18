// Read-only checks of the PRODUCTION testnet stack (deployments/monad-testnet.json): code present, wiring, roles,
// and a few refusals via eth_call (nothing is sent). Run: node scripts/testnet-verify-prod.mjs
import { readFileSync } from 'node:fs';
import { keccak256, toHex, BaseError, ContractFunctionRevertedError } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { pub, abi, assertSolonet, ROOT } from './testnet-lib.mjs';
await assertSolonet();
const D = JSON.parse(readFileSync(`${ROOT}deployments/monad-testnet.json`, 'utf8'));
const c = (k, n) => ({ address: D[k], abi: abi(n) });
const C = { tours: c('tours', 'ToursToken'), factory: c('factory', 'TripVaultFactory'), bookings: c('bookings', 'Bookings'), rewards: c('rewards', 'TourRewards'),
  perks: c('perks', 'PerkMarket'), venues: c('venues', 'Venues'), tickets: c('tickets', 'Tickets'), pool: c('pool', 'MockLendingPool') };
const r = (k, fn, args = []) => pub.readContract({ ...C[k], functionName: fn, args });
const checks = [];
const ok = (name, cond, val) => { checks.push({ name, pass: !!cond, val: String(val) }); console.log(cond ? 'PASS' : 'FAIL', name, String(val)); };
for (const k of Object.keys(C)) ok(`${k} has code`, ((await pub.getCode({ address: D[k] })) || '0x').length > 2, D[k]);
for (const k of ['tours', 'factory', 'bookings', 'rewards', 'perks', 'venues', 'tickets', 'pool']) ok(`${k}.owner == deployer`, (await r(k, 'owner')) === D.deployer, await r(k, 'owner'));
ok('factory.bookings wired', (await r('factory', 'bookings')) === D.bookings, await r('factory', 'bookings'));
ok('factory.rewards wired', (await r('factory', 'rewards')) === D.rewards, await r('factory', 'rewards'));
ok('factory.venues wired', (await r('factory', 'venues')) === D.venues, await r('factory', 'venues'));
ok('tours.minter == rewards', (await r('tours', 'minter')) === D.rewards, await r('tours', 'minter'));
ok('tours non-transferable (points)', (await r('tours', 'transferable')) === false, await r('tours', 'transferable'));
ok('rewards attester = deployer', await r('rewards', 'isAttester', [D.deployer]), true);
ok('rewards check-in source = tickets', await r('rewards', 'isCheckInSource', [D.tickets]), true);
ok('rewards USDC reward token allowed', await r('rewards', 'rewardTokenAllowed', [D.usdc]), D.usdc);
ok('perks partner = deployer', await r('perks', 'approvedPartner', [D.deployer]), true);
ok('tickets treasury', (await r('tickets', 'treasury')) === D.treasury, await r('tickets', 'treasury'));
ok('tickets resale cap 110%', Number(await r('tickets', 'resaleCapBps')) === 11000, await r('tickets', 'resaleCapBps'));
ok('tickets royalty 5%', Number(await r('tickets', 'royaltyBps')) === 500, await r('tickets', 'royaltyBps'));
const rogue = privateKeyToAccount(generatePrivateKey());
const sim = async (name, acct, k, fn, args, expect) => {
  try { await pub.simulateContract({ account: acct, ...C[k], abi: [...C[k].abi, ...Object.values(C).flatMap((x) => x.abi).filter((x) => x.type === 'error')], functionName: fn, args }); ok(name, false, 'SUCCEEDED'); }
  catch (e) { const x = e instanceof BaseError ? e.walk((y) => y instanceof ContractFunctionRevertedError) : null; const why = x?.data?.errorName || x?.reason || e.shortMessage; ok(name, String(why).startsWith(expect), why); }
};
await sim('stranger cannot change rewards config', rogue, 'rewards', 'setAttester', [rogue.address, true], 'OwnableUnauthorizedAccount');
await sim('stranger cannot mint $TOURS', rogue, 'tours', 'mint', [rogue.address, 1n], 'NotMinter');
const now = BigInt(Math.floor(Date.now() / 1000) - 3600);
const v = { user: rogue.address, campaignId: 0n, vault: '0x0000000000000000000000000000000000000000', visitedAt: now, visitId: keccak256(toHex('x')) };
const sig = await rogue.signTypedData({ domain: { name: 'EmpowerTours Rewards', version: '1', chainId: 10143, verifyingContract: D.rewards }, primaryType: 'Visit', message: v,
  types: { Visit: [{ name: 'user', type: 'address' }, { name: 'campaignId', type: 'uint256' }, { name: 'vault', type: 'address' }, { name: 'visitedAt', type: 'uint64' }, { name: 'visitId', type: 'bytes32' }] } });
await sim('forged visit attestation refused', rogue, 'rewards', 'claim', [v, sig], 'BadAttestation');
console.log(`${checks.filter((x) => x.pass).length}/${checks.length} pass`);
if (checks.some((x) => !x.pass)) process.exitCode = 1;
