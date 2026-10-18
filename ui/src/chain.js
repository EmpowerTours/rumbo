// Which chain this build talks to.
//   dev  (vite serve): local Monad Solonet, chain 20143.
//   prod (vite build): Monad TESTNET, chain 10143 (docs.monad.xyz/developer-essentials/testnets). Never mainnet.
// VITE_CHAIN_ID / VITE_CHAIN_NAME / VITE_CHAIN_SHORT / VITE_EXPLORER can override at build time (no .env file
// is committed). The page always talks to the RPC through its own origin (/rpc): the Vite proxy in dev,
// server/index.mjs in production.
const E = import.meta.env;
const TESTNET = { id: 10143, name: 'Monad Testnet', short: 'Monad testnet', explorer: 'https://testnet.monadvision.com' };
const SOLONET = { id: 20143, name: 'Monad Solonet (local)', short: 'Solonet', explorer: '' };
const base = E.PROD ? TESTNET : SOLONET;
const id = Number(E.VITE_CHAIN_ID || base.id);
if (id === 143) throw new Error('Rumbo is testnet-only: refusing Monad mainnet (chain 143).');
export const CHAIN = {
  id,
  name: E.VITE_CHAIN_NAME || base.name,
  short: E.VITE_CHAIN_SHORT || base.short,
  explorer: E.VITE_EXPLORER || base.explorer,
  local: id === 20143,
};
