// Loader: everything comes from local Solonet + the demo-state ids. Signing lives in auth/wallet.js.
import { createPublicClient, http } from 'viem';
import ABIS from '../abis.json';
import { feeCtx } from './gas.js';

export const rpc = new URL('/rpc', location.href).toString();
export const client = createPublicClient({ transport: http(rpc) });
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

async function logs(params, fromBlock, head) {
  const out = [];
  for (let b = BigInt(fromBlock); b <= head; b += 900n) {
    const to = b + 899n > head ? head : b + 899n;
    out.push(...(await client.getContractEvents({ ...params, fromBlock: b, toBlock: to })));
  }
  return out;
}
const range = (n) => [...Array(Number(n)).keys()];

export async function loadAll(me) {
  const [dep, demo] = await Promise.all([fetch('./deployments.json').then((r) => r.json()), fetch('./demo-state.json').then((r) => r.json())]);
  const C = {
    vault: { address: demo.vault, abi: ABIS.TripVault }, fund: { address: demo.artistVault, abi: ABIS.TripVault },
    rw: { address: dep.rewards, abi: ABIS.TourRewards }, tours: { address: dep.tours, abi: ABIS.ToursToken },
    pk: { address: dep.perks, abi: ABIS.PerkMarket }, bk: { address: dep.bookings, abi: ABIS.Bookings },
    vn: { address: dep.venues, abi: ABIS.Venues }, tk: { address: dep.tickets, abi: ABIS.Tickets },
    fac: { address: dep.factory, abi: ABIS.TripVaultFactory }, usdc: { address: dep.usdc, abi: ABIS.MockToken },
  };
  const r = (c, functionName, args = []) => client.readContract({ ...C[c], functionName, args });
  const head = await client.getBlockNumber();
  const L = (c, eventName, args) => logs({ ...C[c], eventName, args }, demo.fromBlock, head);
  const nowTs = Number((await client.getBlock()).timestamp);
  const today = Math.floor(nowTs / 86400);
  // Signed in → everything is about that wallet. Signed out → read-only view of the demo traveler.
  const user = me || demo.actors.traveler.address;
  const nameOf = (addr) => Object.values(demo.actors).find((a) => eq(a.address, addr))?.name.replace(/ \(.*\)/, '')
    || (eq(addr, demo.artistVault) ? 'Lumbre tour fund' : eq(addr, demo.vault) ? 'Ana trip vault' : short(addr));

  // trip vault
  const vaultInfo = async (c) => {
    const [assets, spent, goal, bps, yld, dest, contribs, vendors, totalCap, start, end, owner] = await Promise.all(
      ['totalAssets', 'totalSpent', 'goal', 'progressBps', 'yieldEarned', 'destination', 'contributors', 'vendors', 'totalCap', 'startTime', 'endTime', 'owner'].map((f) => r(c, f)));
    const principals = await Promise.all(contribs.map((a) => r(c, 'principalOf', [a])));
    const leash = await Promise.all(vendors.map(async (a) => ({ a, cap: await r(c, 'vendorCap', [a]), spent: await r(c, 'vendorSpent', [a]) })));
    return { assets, spent, goal, bps, yld, dest, contribs, principals, vendors, totalCap, start, end, owner, leash };
  };
  // Which trip vault the dashboard shows: the user's own newest vault, else the demo group trip (open to contributions).
  const own = (await r('fac', 'vaultsOf', [user])).filter((v) => !eq(v, demo.artistVault));
  if (own.length && !eq(own[own.length - 1], demo.vault)) C.vault = { address: own[own.length - 1], abi: ABIS.TripVault };
  const [trip, fund] = await Promise.all([vaultInfo('vault'), vaultInfo('fund')]);
  trip.address = C.vault.address;
  trip.mine = eq(trip.owner, user);
  const [usdcBal, monBal, usdcAllowVault, fees] = await Promise.all([r('usdc', 'balanceOf', [user]), client.getBalance({ address: user }), r('usdc', 'allowance', [user, C.vault.address]), client.estimateFeesPerGas()]);
  // read-only fee quote for the "~X MON" hints on action buttons (gas.js); signed out = no hints
  Object.assign(feeCtx, { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, mon: monBal, signed: !!me });

  // rewards
  const ncamp = Number(await r('rw', 'campaignCount'));
  const camps = await Promise.all(range(ncamp).map(async (i) => ({ id: i, ...(await r('rw', 'getCampaign', [BigInt(i)])) })));
  const [visitsAll, srcCheckins, batches] = await Promise.all([L('rw', 'VisitRewarded'), L('rw', 'SourceCheckIn'), L('rw', 'BatchClaimed')]);
  // Hide the batching gas probe (demo/measure-batching.mjs): its users claim into vaults named "gas probe N".
  const vaultsSeen = [...new Set(visitsAll.map((e) => e.args.vault.toLowerCase()))].filter((v) => !/^0x0+$/.test(v));
  const probeVaults = new Set();
  await Promise.all(vaultsSeen.map(async (v) => {
    try { if (String(await client.readContract({ address: v, abi: ABIS.TripVault, functionName: 'destination' })).startsWith('gas probe')) probeVaults.add(v); } catch { /* not a vault */ }
  }));
  const isProbe = (e) => probeVaults.has(e.args.vault.toLowerCase());
  const probeVisits = visitsAll.filter(isProbe).length;
  visitsAll.splice(0, visitsAll.length, ...visitsAll.filter((e) => !isProbe(e)));
  for (const c of camps) c.totalVisits = visitsAll.filter((e) => Number(e.args.campaignId) === c.id).length;
  const [, cur, best, daysVisited] = await r('rw', 'streakOf', [user]);
  const toursBal = await r('tours', 'balanceOf', [user]);
  const fundClaimable = await r('rw', 'backingClaimable', [demo.artistVault, user]);

  // perks
  const nperk = Number(await r('pk', 'perkCount'));
  const perks = await Promise.all(range(nperk).map(async (i) => ({ id: i, p: await r('pk', 'getPerk', [BigInt(i)]), mine: await r('pk', 'redeemedBy', [BigInt(i), user]) })));
  const redeemed = await L('pk', 'Redeemed', { user });

  // bookings
  const [nl, nb] = await Promise.all([r('bk', 'listingCount'), r('bk', 'bookingCount')]);
  const listings = await Promise.all(range(nl).map(async (i) => ({ id: i, ...(await r('bk', 'getListing', [BigInt(i)])) })));
  const bookings = await Promise.all(range(nb).map(async (i) => ({ id: i, ...(await r('bk', 'getBooking', [BigInt(i)])), accepted: await r('bk', 'accepted', [BigInt(i)]) })));
  const hostScanner = Object.fromEntries(await Promise.all([...new Set(listings.map((l) => l.host))].map(async (h) => [h.toLowerCase(), await r('bk', 'isScanner', [h, user])])));
  const [released, reviewsEv] = await Promise.all([L('bk', 'Released'), L('bk', 'ReviewAnchored')]);

  // venues + shows + tickets
  const [nv, ns] = await Promise.all([r('vn', 'venueCount'), r('vn', 'showCount')]);
  const venues = await Promise.all(range(nv).map(async (i) => {
    const v = await r('vn', 'getVenue', [BigInt(i)]);
    const [held, cancelled, relBps] = await r('vn', 'reliability', [BigInt(i)]);
    const cal = await Promise.all(range(14).map(async (k) => ({ day: today + k, open: await r('vn', 'openOn', [BigInt(i), today + k]), booked: Number(await r('vn', 'bookedOn', [BigInt(i), today + k])) })));
    return { id: i, ...v, held, cancelled, relBps, cal, iScan: await r('vn', 'isScanner', [BigInt(i), user]), manual: await r('vn', 'manualApproval', [BigInt(i)]) };
  }));
  const shows = await Promise.all(range(ns).map(async (i) => {
    const s = await r('vn', 'getShow', [BigInt(i)]);
    const sl = await r('tk', 'sales', [BigInt(i)]);
    const ids = await r('tk', 'ticketsOfShow', [BigInt(i)]);
    const tickets = await Promise.all(ids.map(async (id) => ({ id, ...(await r('tk', 'getTicket', [id])), ask: await r('tk', 'askPrice', [id]) })));
    const [pending, started] = await Promise.all([r('vn', 'awaitingApproval', [BigInt(i)]), r('tk', 'checkInStarted', [BigInt(i)])]);
    return { id: i, ...s, pending, started, sales: { gross: sl[0], sold: sl[1], settled: sl[4], toArtist: sl[5], toVenue: sl[6], fee: sl[7] }, tickets };
  }));
  const [played, cancelledEv, scans, refunds, settledEv, resales] = await Promise.all([L('vn', 'ShowPlayed'), L('vn', 'ShowCancelled'), L('tk', 'TicketScanned'), L('tk', 'TicketRefunded'), L('tk', 'ShowSettled'), L('tk', 'ResaleBought')]);
  const [capBps, royaltyBps] = await Promise.all([r('tk', 'resaleCapBps'), r('tk', 'royaltyBps')]);
  return { C, dep, demo, user, me, nameOf, eq, nowTs, today, trip, fund, usdcBal, monBal, usdcAllowVault, hostScanner, resales, resale: { capBps: Number(capBps), royaltyBps: Number(royaltyBps) }, camps, visitsAll, probeVisits, srcCheckins, batches, streak: { current: cur, best, daysVisited }, toursBal, fundClaimable,
    perks, redeemed, listings, bookings, released, reviewsEv, venues, shows, played, cancelledEv, scans, refunds, settledEv };
}
