#!/usr/bin/env bash
# LOCAL anvil fork of Monad mainnet only. Rehearses the approved shared-$TOURS steps with impersonated
# accounts. Never touches a key and never sends to mainnet.
#   anvil --fork-url https://monad-mainnet.drpc.org --port 8547 &  ;  scripts/fork-sim-shared-tours.sh
#   SNAP_TO_BLOCK=N limits the testnet log scan; SAMPLE=1 uses a synthetic 8-wallet epoch instead (full history from fromBlock takes hours at 100-block chunks).
set -euo pipefail
cd "$(dirname "$0")/.."
A=${ANVIL:-http://127.0.0.1:8547}
[ "$(cast chain-id --rpc-url $A)" = 143 ] || { echo "need a chain-143 fork"; exit 1; }
case "$A" in http://127.0.0.1*|http://localhost*) ;; *) echo "refusing non-local RPC"; exit 1;; esac
PUB=0x00000000000000000000000000000000000b0b01
T=0x45b76a127167fD7FC7Ed264ad490144300eCfcBF; MGR=0x056452a44d81AB502e24510b2e4FB1789C6faf85
SAFE=0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA; EOA=0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1
for x in $EOA $SAFE $PUB; do cast rpc --rpc-url $A anvil_impersonateAccount $x >/dev/null; cast rpc --rpc-url $A anvil_setBalance $x 0x56BC75E2D63100000 >/dev/null; done
OUT=audits/shared-tours-fork-sim.log; : > $OUT
g() { local label=$1; shift; local r; r=$(cast send --rpc-url $A --unlocked --json "$@"); local gas; gas=$(echo "$r" | jq -r .gasUsed | xargs cast to-dec); echo "$label gasUsed=$gas" | tee -a $OUT; }
bal() { cast call --rpc-url $A $T "balanceOf(address)(uint256)" $1 | awk '{print $1}'; }
echo "fork block $(cast block-number --rpc-url $A)" | tee -a $OUT
echo "manager balance $(bal $MGR)  safe before $(bal $SAFE)" | tee -a $OUT
g "1 EOA  manager.transferOwnership(Safe)" --from $EOA $MGR "transferOwnership(address)" $SAFE
g "2 Safe manager.emergencyWithdraw()" --from $SAFE $MGR "emergencyWithdraw()"
echo "manager after $(bal $MGR)  safe after $(bal $SAFE)" | tee -a $OUT
(cd contracts && forge build -q)
BC=$(jq -r .bytecode.object contracts/out/ToursClaimDistributor.sol/ToursClaimDistributor.json)
ARGS=$(cast abi-encode "c(address,address,address,uint256,uint256,uint256,uint64)" $SAFE $PUB $T 250000000000000000000000 500000000000000000000 5000000000000000000000 604800)
R=$(cast send --rpc-url $A --unlocked --from $EOA --json --create "$BC${ARGS#0x}")
D=$(echo "$R" | jq -r .contractAddress); echo "3 deploy distributor gasUsed=$(echo "$R" | jq -r .gasUsed | xargs cast to-dec) at $D" | tee -a $OUT
SNAP=${SNAP:-/tmp/shared-tours-epoch1.json}
if [ -n "${SAMPLE:-}" ]; then node scripts/tours-sample-snapshot.mjs --distributor $D --chain-id 143 --out $SNAP | tee -a $OUT; else node scripts/tours-snapshot.mjs --distributor $D --chain-id 143 ${SNAP_TO_BLOCK:+--to-block $SNAP_TO_BLOCK} --out $SNAP | tee -a $OUT; fi
ROOT=$(jq -r .root $SNAP); TOT=$(jq -r .cumulativeTotal $SNAP); INC=$(jq -r .epochIncrease $SNAP); H=$(jq -r .snapshotHash $SNAP); N=$(jq '.claims|length' $SNAP)
echo "snapshot: $N wallets, total $TOT wei" | tee -a $OUT
g "4 Safe TOURS.transfer(distributor, epochIncrease)" --from $SAFE $T "transfer(address,uint256)" $D $INC
g "5 publisher publishEpoch" --from $PUB $D "publishEpoch(bytes32,uint256,bytes32)" $ROOT $TOT $H
for i in $(seq 0 $(( N < 5 ? N-1 : 4 ))); do
  ADDR=$(jq -r ".claims[$i].address" $SNAP); AMT=$(jq -r ".claims[$i].cumulative" $SNAP); P=$(jq -c ".claims[$i].proof" $SNAP | tr -d '"')
  g "6 claim[$i] $AMT" --from $PUB $D "claim(address,uint256,bytes32[])" $ADDR $AMT "$P"
  python3 -c "import sys; sys.exit(0 if int(sys.argv[1])>=int(sys.argv[2]) else 1)" "$(bal $ADDR)" "$AMT" || { echo "claim balance mismatch"; exit 1; }
done
expect_revert() { local label=$1; shift; if cast send --rpc-url $A --unlocked "$@" >/dev/null 2>&1; then echo "FAIL $label succeeded" | tee -a $OUT; exit 1; else echo "OK refused: $label" | tee -a $OUT; fi; }
ADDR=$(jq -r ".claims[0].address" $SNAP); AMT=$(jq -r ".claims[0].cumulative" $SNAP); P=$(jq -c ".claims[0].proof" $SNAP | tr -d '"')
expect_revert "double claim" --from $PUB $D "claim(address,uint256,bytes32[])" $ADDR $AMT "$P"
expect_revert "publish too soon" --from $PUB $D "publishEpoch(bytes32,uint256,bytes32)" $ROOT $TOT $H
cast rpc --rpc-url $A evm_increaseTime 604800 >/dev/null; cast rpc --rpc-url $A evm_mine >/dev/null
g "  Safe over-fund for ceiling test" --from $SAFE $T "transfer(address,uint256)" $D 250001000000000000000000
expect_revert "epoch > 250k" --from $PUB $D "publishEpoch(bytes32,uint256,bytes32)" $ROOT $(python3 -c "print($TOT+250001*10**18)") $H
# single-leaf root over the per-wallet cap (epoch 2 => cap 1000)
X=0x00000000000000000000000000000000000c0ffe
LEAF=$(cast call --rpc-url $A $D "leaf(address,uint256)(bytes32)" $X 1001000000000000000000)
g "7 publisher publishEpoch (epoch 2, single leaf 1001)" --from $PUB $D "publishEpoch(bytes32,uint256,bytes32)" $LEAF $(python3 -c "print($TOT+1001*10**18)") $H
expect_revert "wallet over 2x500 cap" --from $PUB $D "claim(address,uint256,bytes32[])" $X 1001000000000000000000 "[]"
expect_revert "non-publisher publish" --from $EOA $D "pause()"
g "8 publisher pause()" --from $PUB $D "pause()"
expect_revert "claim while paused" --from $PUB $D "claim(address,uint256,bytes32[])" $X 1001000000000000000000 "[]"
expect_revert "publisher unpause" --from $PUB $D "unpause()"
g "9 Safe unpause()" --from $SAFE $D "unpause()"
S=$(cast call --rpc-url $A $D "surplus()(uint256)" | awk '{print $1}')
g "10 Safe withdrawSurplus($S)" --from $SAFE $D "withdrawSurplus(address,uint256)" $SAFE $S
echo "distributor now holds $(bal $D) (= owed, unclaimed)" | tee -a $OUT
