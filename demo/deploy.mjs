// Deploy the stack to LOCAL Solonet. Key is read from PK_FILE and passed via env only.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { assertSolonet, actor, deployerKey, RPC, ROOT } from './lib.mjs';

await assertSolonet();
const env = {
  ...process.env,
  DEPLOYER_PK: deployerKey(),
  ATTESTER: actor('attester').address,
  PARTNER: actor('artist').address,
  TREASURY: actor('treasury').address,
  TOURS_TRANSFERABLE: process.env.TOURS_TRANSFERABLE || 'false',
};
const forge = process.env.FORGE || `${process.env.HOME}/.foundry/bin/forge`;
const r = spawnSync(forge, ['script', 'script/DeploySolonet.s.sol', '--rpc-url', RPC, '--broadcast',
  '--gas-estimate-multiplier', '300', '--slow'], { cwd: `${ROOT}contracts`, env, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
mkdirSync(`${ROOT}ui/public`, { recursive: true });
copyFileSync(`${ROOT}contracts/deployments/solonet.json`, `${ROOT}ui/public/deployments.json`);
await import('./export-abis.mjs');
console.log('deployed; addresses in contracts/deployments/solonet.json');
