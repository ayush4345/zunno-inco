const { encodeFunctionData } = require('viem');
const { getBotClients } = require('./wallet');
const { startWatching, getBotStatus } = require('./gameBot');

const JOIN_AS_BOT_ABI = [
  {
    type: 'function',
    name: 'joinAsBot',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'gameId', type: 'uint256' },
      { name: 'bot', type: 'address' },
    ],
    outputs: [],
  },
];

/** Seats the bot into an isBot lobby and starts watching it for its turn. */
async function joinBotGame(gameId) {
  const { account, walletClient } = getBotClients();
  const contractAddress = process.env.ZUNNOINCO_ADDRESS;
  if (!contractAddress) throw new Error('bot not configured');

  const data = encodeFunctionData({
    abi: JOIN_AS_BOT_ABI,
    functionName: 'joinAsBot',
    args: [BigInt(gameId), account.address],
  });
  const hash = await walletClient.sendTransaction({ to: contractAddress, data });
  startWatching(BigInt(gameId));
  return hash;
}

module.exports = { joinBotGame, getBotStatus };
