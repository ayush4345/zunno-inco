/**
 * Submits ERC-2771 meta-tx requests on behalf of players so a card move only
 * needs an off-chain EIP-712 signature, not a full on-chain wallet tx.
 *
 * Required env vars:
 *   RELAYER_PRIVATE_KEY  — hot key that pays gas for relayed moves
 *   BASE_SEPOLIA_RPC_URL — RPC endpoint for Base Sepolia
 *   ZUNNOINCO_ADDRESS    — deployed ZunnoInco contract (the only allowed `to`)
 *   FORWARDER_ADDRESS    — deployed ERC2771Forwarder contract
 */
const { createWalletClient, createPublicClient, http, getAddress, toFunctionSelector } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');

const FORWARDER_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'deadline', type: 'uint48' },
          { name: 'data', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
];

// Only these two moves are relayed — see contracts/src/ZunnoInco.sol: they're
// the only functions gated by player identity (turn check + hand ownership),
// so they're the only ones a relayer forwarding on someone's behalf can touch.
const ALLOWED_SELECTORS = new Set([
  toFunctionSelector('drawCard(uint256)'),
  toFunctionSelector('playCard(uint256,uint256,uint256,bytes[],uint8)'),
]);

// dealCards has no msg.sender gate at all — recipients/order are fixed by
// contract state, so anyone can advance the deal. That means it doesn't need
// ERC-2771 forwarding or a player signature; the relayer can just call it
// directly with its own key, right after startGame confirms, saving the
// player a second wallet popup.
const DEAL_CARDS_ABI = [
  { type: 'function', name: 'dealCards', stateMutability: 'nonpayable', inputs: [{ name: 'gameId', type: 'uint256' }, { name: 'count', type: 'uint8' }], outputs: [] },
];

/** Pure guard, no network calls — kept separate so it's cheaply unit-testable. */
function validateForwardRequest(request, { contractAddress }) {
  if (getAddress(request.to) !== getAddress(contractAddress)) {
    throw new Error('request.to is not the ZunnoInco contract');
  }
  const selector = request.data.slice(0, 10);
  if (!ALLOWED_SELECTORS.has(selector)) {
    throw new Error('function not allowlisted for relaying');
  }
  if (BigInt(request.value) !== 0n) {
    throw new Error('value must be zero — relayer never forwards ETH');
  }
}

let clients;
function getClients() {
  if (!clients) {
    const pk = process.env.RELAYER_PRIVATE_KEY;
    if (!pk) throw new Error('RELAYER_PRIVATE_KEY not set');
    const account = privateKeyToAccount(pk);
    const transport = http(process.env.BASE_SEPOLIA_RPC_URL);
    clients = {
      account,
      walletClient: createWalletClient({ account, chain: baseSepolia, transport }),
      publicClient: createPublicClient({ chain: baseSepolia, transport }),
    };
  }
  return clients;
}

/** @param {{from,to,value,gas,deadline,data,signature}} request Signed ERC2771Forwarder.ForwardRequestData (as strings/hex over JSON) */
async function relayForwardRequest(request) {
  const contractAddress = process.env.ZUNNOINCO_ADDRESS;
  const forwarderAddress = process.env.FORWARDER_ADDRESS;
  if (!contractAddress || !forwarderAddress) throw new Error('relayer not configured');
  validateForwardRequest(request, { contractAddress });

  const { walletClient } = getClients();
  return walletClient.writeContract({
    address: forwarderAddress,
    abi: FORWARDER_ABI,
    functionName: 'execute',
    args: [
      {
        from: request.from,
        to: request.to,
        value: BigInt(request.value),
        gas: BigInt(request.gas),
        deadline: Number(request.deadline),
        data: request.data,
        signature: request.signature,
      },
    ],
    value: 0n,
  });
}

/** @param {string|number} gameId  @param {number} count Cards to deal, 1..MAX_DEAL_BATCH (8) */
async function submitDealCards(gameId, count) {
  const contractAddress = process.env.ZUNNOINCO_ADDRESS;
  if (!contractAddress) throw new Error('relayer not configured');

  const { walletClient } = getClients();
  return walletClient.writeContract({
    address: contractAddress,
    abi: DEAL_CARDS_ABI,
    functionName: 'dealCards',
    args: [BigInt(gameId), count],
  });
}

module.exports = { relayForwardRequest, validateForwardRequest, submitDealCards, ALLOWED_SELECTORS };
