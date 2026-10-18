# Deployments

`monad-testnet.json` lands here after a real Monad TESTNET (chain 10143) deploy with
`npm run deploy:testnet`. Committing it is what turns production on: Railway autodeploys `main`,
`server/index.mjs` serves this file as `/deployments.json` (it only counts if `chainId` is 10143 and it has
a `bookings` address), `/healthz` reports `deployed: true`, and the app leaves its "coming soon" page.

Dry runs write throwaway addresses to `contracts/deployments/monad-testnet-dryrun-*.json`, which are
gitignored and never served.

Testnet admin, treasury, attester and partner roles all belong to the deployer
(`0x7560019f79253D84347962D658f58AcB62D52622`). **Before mainnet, every role moves to the EmpowerTours
2-of-3 Safe.**
