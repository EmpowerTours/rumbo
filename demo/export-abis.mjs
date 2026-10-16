// Copies the compiled ABIs the UI needs into ui/abis.json (full ABIs: the UI signs real transactions; no bytecode).
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const names = ['TripVault', 'TripVaultFactory', 'TourRewards', 'ToursToken', 'PerkMarket', 'Bookings', 'Venues', 'Tickets', 'MockToken'];
const out = Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(`${ROOT}contracts/out/${n}.sol/${n}.json`, 'utf8')).abi.filter((x) => ['function', 'event', 'error'].includes(x.type))]));
writeFileSync(`${ROOT}ui/abis.json`, JSON.stringify(out));
console.log('wrote ui/abis.json', Object.keys(out).join(', '));
