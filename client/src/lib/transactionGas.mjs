const GAS_BUFFER_PERCENT = 120n;
const RPC_GAS_LIMIT_CAP = 25_000_000n;

export function getBufferedGasLimit(estimatedGas) {
  const bufferedGas = (estimatedGas * GAS_BUFFER_PERCENT) / 100n;
  return bufferedGas > RPC_GAS_LIMIT_CAP ? RPC_GAS_LIMIT_CAP : bufferedGas;
}
