// Read-only loader: everything comes from local Solonet + the demo-state ids. No signing here.
import { createPublicClient, http } from 'viem';
import ABIS from '../abis.json';

const rpc = new URL('/rpc', location.href).toString();
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

export async function loadAll() {
  const [dep, demo] = await Promise.all([fetch('./deployments.json').then((r) => r.json()), fetch('./demo-state.json').then((r) => r.json())]);
  const C = {
    vault: { address: demo.vault, abi: ABIS.TripVault }, fund: { address: demo.artistVault, abi: ABIS.TripVault },
    rw: { address: dep.rewards, abi: ABIS.TourRewards }, tours: { address: dep.tours, abi: ABIS.ToursToken },
    pk: { address: dep.perks, abi: ABIS.PerkMarket }, bk: { address: dep.bookings, abi: ABIS.Bookings },
    vn: { address: dep.venues, abi: ABIS.Venues }, tk: { address: dep.tickets, abi: ABIS.Tickets },
  };
  const r = (c, functionName, args = []) => client.readContract({ ...C[c], functionName, args });
  const head = await client.getBlockNumber();
  const L = (c, eventName, args) => logs({ ...C[c], eventName, args }, demo.fromBlock, head);
  const nowTs = Number((await client.getBlock()).timestamp);
  const today = Math.floor(nowTs / 86400);
  const user = demo.actors.traveler.address;
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
  const [trip, fund] = await Promise.all([vaultInfo('vault'), vaultInfo('fund')]);

  // rewards
  const ncamp = Number(await r('rw', 'campaignCount'));
  const camps = await Promise.all(range(ncamp).map(async (i) => ({ id: i, ...(await r('rw', 'getCampaign', [BigInt(i)])) })));
  const [visitsAll, srcCheckins, batches] = await Promise.all([L('rw', 'VisitRewarded'), L('rw', 'SourceCheckIn'), L('rw', 'BatchClaimed')]);
  // Only demo actors: the batching gas probe (demo/measure-batching.mjs) also claims at these stops.
  const actorSet = new Set(Object.values(demo.actors).map((a) => a.address.toLowerCase()));
  const probeVisits = visitsAll.filter((e) => !actorSet.has(e.args.user.toLowerCase())).length;
  visitsAll.splice(0, visitsAll.length, ...visitsAll.filter((e) => actorSet.has(e.args.user.toLowerCase())));
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
  const bookings = await Promise.all(range(nb).map(async (i) => ({ id: i, ...(await r('bk', 'getBooking', [BigInt(i)])) })));
  const [released, reviewsEv] = await Promise.all([L('bk', 'Released'), L('bk', 'ReviewAnchored')]);

  // venues + shows + tickets
  const [nv, ns] = await Promise.all([r('vn', 'venueCount'), r('vn', 'showCount')]);
  const venues = await Promise.all(range(nv).map(async (i) => {
    const v = await r('vn', 'getVenue', [BigInt(i)]);
    const [held, cancelled, relBps] = await r('vn', 'reliability', [BigInt(i)]);
    const cal = await Promise.all(range(14).map(async (k) => ({ day: today + k, open: await r('vn', 'openOn', [BigInt(i), today + k]), booked: Number(await r('vn', 'bookedOn', [BigInt(i), today + k])) })));
    return { id: i, ...v, held, cancelled, relBps, cal };
  }));
  const shows = await Promise.all(range(ns).map(async (i) => {
    const s = await r('vn', 'getShow', [BigInt(i)]);
    const sl = await r('tk', 'sales', [BigInt(i)]);
    const ids = await r('tk', 'ticketsOfShow', [BigInt(i)]);
    const tickets = await Promise.all(ids.map(async (id) => ({ id, ...(await r('tk', 'getTicket', [id])) })));
    return { id: i, ...s, sales: { gross: sl[0], sold: sl[1], settled: sl[4], toArtist: sl[5], toVenue: sl[6], fee: sl[7] }, tickets };
  }));
  const [played, cancelledEv, scans, refunds, settledEv] = await Promise.all([L('vn', 'ShowPlayed'), L('vn', 'ShowCancelled'), L('tk', 'TicketScanned'), L('tk', 'TicketRefunded'), L('tk', 'ShowSettled')]);
  return { dep, demo, user, nameOf, eq, nowTs, today, trip, fund, camps, visitsAll, probeVisits, srcCheckins, batches, streak: { current: cur, best, daysVisited }, toursBal, fundClaimable,
    perks, redeemed, listings, bookings, released, reviewsEv, venues, shows, played, cancelledEv, scans, refunds, settledEv };
}
