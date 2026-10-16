// Copies the compiled ABIs the UI needs into ui/abis.json (read-only UI, no bytecode).
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const names = ['TripVault', 'TourRewards', 'ToursToken', 'PerkMarket', 'Bookings', 'Venues', 'Tickets'];
const out = Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(`${ROOT}contracts/out/${n}.sol/${n}.json`, 'utf8')).abi.filter((x) => x.type === 'function' && ['view', 'pure'].includes(x.stateMutability) || x.type === 'event')]));
writeFileSync(`${ROOT}ui/abis.json`, JSON.stringify(out));
console.log('wrote ui/abis.json', Object.keys(out).join(', '));
