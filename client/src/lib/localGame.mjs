export function getLocalComputerGameId(timestamp = Date.now()) {
  return BigInt(timestamp);
}
