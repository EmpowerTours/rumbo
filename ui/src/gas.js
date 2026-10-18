// What an action costs in MON, before anything is signed.
//
// Monad charges the gas LIMIT (not gas used), so every limit here is the estimate + 10% that the app
// actually sends, and the cost is   Σ limit × maxFeePerGas   — the worst case the wallet can be charged.
// The table is only for button hints and for steps that cannot be estimated yet (e.g. "buy" before the
// "approve" in front of it has landed). The real pre-send check estimates live (wallet.js quote()).
// Numbers are the limits measured on Solonet in demo/ui-flows.json and demo/transcript.md.
import { formatEther } from 'viem';

/** Gas limit per contract function (estimate × 1.10, rounded up). */
export const GAS = {
  approve: 57_400, faucet: 70_200, deposit: 271_200, claimBatch: 520_500, redeem: 228_400,
  buy: 380_000, buyResale: 316_000, listForResale: 110_000, cancelResale: 60_000, book: 631_000,
  confirmCheckIn: 513_000, claimBacking: 212_000, acceptBooking: 76_300, hostCancel: 433_600,
  setScanner: 77_200, confirmWithAttestation: 496_400, acceptShow: 57_100, declineShow: 470_000,
  venueCancel: 480_300, scan: 259_700, setOpenDates: 260_000,
  // round 4 (partner creation flows): limits measured by demo/ui-create.mjs (Monad charges the limit;
  // string-heavy calls grow with title/place/URI length, so these carry ~5-10% headroom)
  setHostProfile: 140_000, createListingWithMeta: 420_000, editListing: 110_000, updateListing: 60_000, removeListing: 82_000,
  listVenueWithMeta: 420_000, setArtistProfile: 140_000, bookShow: 530_000, openSales: 92_000, settle: 205_000, artistCancel: 480_000,
  confirmShow: 220_000, claimArtistNoShow: 245_000, bookDirect: 300_000,
};

/** Typical total per UI action (including the approve in front of it when one is usually needed). */
export const ACTION_GAS = {
  faucet: GAS.faucet, contribute: GAS.approve + GAS.deposit, checkin: GAS.claimBatch, redeem: GAS.approve + GAS.redeem,
  buyTicket: GAS.approve + GAS.buy, buyResale: GAS.approve + GAS.buyResale, listResale: GAS.listForResale, cancelResale: GAS.cancelResale,
  book: GAS.book, confirmStay: GAS.confirmCheckIn, claimBacking: GAS.claimBacking, hostAccept: GAS.acceptBooking, hostCancel: GAS.hostCancel,
  hostScanner: GAS.setScanner, hostScan: GAS.confirmWithAttestation, venueScanner: GAS.setScanner, venueAccept: GAS.acceptShow,
  venueDecline: GAS.declineShow, venueCancel: GAS.venueCancel, scanTicket: GAS.scan, openDates: GAS.setOpenDates,
  saveListing: GAS.createListingWithMeta, toggleListing: GAS.updateListing, removeListing: GAS.removeListing,
  createVenue: GAS.listVenueWithMeta + 70_000 + 7 * 32_000 + GAS.setScanner, saveArtist: GAS.setArtistProfile, requestDate: GAS.approve + GAS.bookShow,
  openSales: GAS.openSales, settleShow: GAS.settle, artistCancel: GAS.artistCancel, confirmShow: GAS.confirmShow, noShowClaim: GAS.claimArtistNoShow,
  bookDirect: GAS.approve + GAS.bookDirect,
};

/** Solonet's fee quote at load time; refreshed by data.js on every reload. */
export const feeCtx = { maxFeePerGas: 122_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n, mon: 0n, signed: false };

export const actionCost = (name) => BigInt(ACTION_GAS[name] || 0) * feeCtx.maxFeePerGas;

/** "0.0484" style: 4 significant decimals, always rounded UP so we never under-quote. */
export function mon(wei, dp = 4) {
  const unit = 10n ** BigInt(18 - dp);
  const up = ((wei + unit - 1n) / unit) * unit;
  return Number(formatEther(up)).toFixed(dp);
}

/** Need + a small buffer (25%, at least 0.01 MON), rounded up to 0.01 MON — the amount we suggest sending. */
export function suggested(need) {
  const cent = 10n ** 16n;
  let s = (need * 125n) / 100n;
  if (s < need + cent) s = need + cent;
  return ((s + cent - 1n) / cent) * cent;
}
