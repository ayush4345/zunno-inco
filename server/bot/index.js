const { encodeFunctionData } = require('viem');
const { getBotClients } = require('./wallet');
const { startWatching, getBotStatus, GAME_ABI } = require('./gameBot');
const logger = require('../logger');

const BOT_JOIN_ABI = [
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
  {
    type: 'function',
    name: 'seated',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

// Deployment block of the current live ZunnoInco contract — bounds the
// PlayerJoined scan in resumeActiveBotGames(). ponytail: hardcoded
// per-deploy; bump this if the contract is ever redeployed.
const CONTRACT_DEPLOY_BLOCK = 45_475_362n;
// Public RPCs cap eth_getLogs at a 10,000 block range per call.
const LOG_CHUNK_SIZE = 9_000n;
const PHASE_OPENING = 1;
const PHASE_ACTIVE = 2;

/** Seats the bot into an isBot lobby. Idempotent: if it's already seated
 *  (e.g. a prior call succeeded but the in-memory watcher was later lost to
 *  a server restart), this skips the on-chain join - which would otherwise
 *  revert "already joined" - and just (re)starts watching. */
async function joinBotGame(gameId) {
  const { account, walletClient, publicClient } = getBotClients();
  const contractAddress = process.env.ZUNNOINCO_ADDRESS;
  if (!contractAddress) throw new Error('bot not configured');

  const alreadySeated = await publicClient.readContract({
    address: contractAddress,
    abi: BOT_JOIN_ABI,
    functionName: 'seated',
    args: [BigInt(gameId), account.address],
  });

  let hash = null;
  if (!alreadySeated) {
    const data = encodeFunctionData({
      abi: BOT_JOIN_ABI,
      functionName: 'joinAsBot',
      args: [BigInt(gameId), account.address],
    });
    hash = await walletClient.sendTransaction({ to: contractAddress, data });
  }
  startWatching(BigInt(gameId));
  return hash;
}

/**
 * Re-attaches turn-watchers for every bot game still in progress. The
 * watcher is just an in-memory setInterval (see gameBot.js), so a server
 * restart silently drops it for any game the bot had already joined - the
 * bot would otherwise sit there forever on its next turn with nothing
 * driving it. Call this once at server startup.
 */
async function resumeActiveBotGames() {
  let clients;
  try {
    clients = getBotClients();
  } catch {
    return; // BOT_PRIVATE_KEY not set on this deployment — nothing to resume
  }
  const { account, publicClient } = clients;
  const contractAddress = process.env.ZUNNOINCO_ADDRESS;
  if (!contractAddress) return;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const ranges = [];
    for (let start = CONTRACT_DEPLOY_BLOCK; start <= latestBlock; start += LOG_CHUNK_SIZE) {
      const end = start + LOG_CHUNK_SIZE - 1n > latestBlock ? latestBlock : start + LOG_CHUNK_SIZE - 1n;
      ranges.push([start, end]);
    }
    const chunks = await Promise.all(
      ranges.map(([start, end]) =>
        publicClient.getLogs({
          address: contractAddress,
          event: {
            type: 'event',
            name: 'PlayerJoined',
            inputs: [
              { name: 'gameId', type: 'uint256', indexed: true },
              { name: 'player', type: 'address', indexed: true },
            ],
          },
          args: { player: account.address },
          fromBlock: start,
          toBlock: end,
        }),
      ),
    );
    const gameIds = [...new Set(chunks.flat().map((log) => log.args.gameId).filter((id) => id !== undefined))];

    for (const gameId of gameIds) {
      const state = await publicClient.readContract({
        address: contractAddress,
        abi: GAME_ABI,
        functionName: 'getGameState',
        args: [gameId],
      });
      const phase = Number(state[6]);
      if (phase === PHASE_OPENING || phase === PHASE_ACTIVE) {
        startWatching(gameId);
        logger.info('[Bot] resumed watching game %s (phase %s)', gameId.toString(), phase);
      }
    }
  } catch (err) {
    logger.error('[Bot] resumeActiveBotGames failed: %s', err.message);
  }
}

module.exports = { joinBotGame, getBotStatus, resumeActiveBotGames };
