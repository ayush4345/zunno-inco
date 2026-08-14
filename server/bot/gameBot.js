const { encodeFunctionData } = require('viem');
const { getBotClients } = require('./wallet');
const { decryptBotHand } = require('./incoHand');
const { isPlayable, isWild } = require('./cards');
const logger = require('../logger');

const GAME_ABI = [
  {
    type: 'function',
    name: 'getGameState',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [
      { name: 'players', type: 'address[]' },
      { name: 'currentPlayer', type: 'address' },
      { name: 'turn', type: 'uint8' },
      { name: 'direction', type: 'int8' },
      { name: 'pot', type: 'uint256' },
      { name: 'buyIn', type: 'uint256' },
      { name: 'phase', type: 'uint8' },
      { name: 'topValue', type: 'uint256' },
      { name: 'activeColor', type: 'uint8' },
      { name: 'winner', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'getMyHandHandles',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{ name: 'out', type: 'bytes32[]' }],
  },
  {
    type: 'function',
    name: 'drawCard',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'playCard',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'gameId', type: 'uint256' },
      { name: 'handIndex', type: 'uint256' },
      { name: 'claimedValue', type: 'uint256' },
      { name: 'sigs', type: 'bytes[]' },
      { name: 'chosenColor', type: 'uint8' },
    ],
    outputs: [],
  },
];

const PHASE = { waiting: 0, opening: 1, active: 2, finished: 3 };
const POLL_MS = 4000;

const watchers = new Map(); // gameId string -> interval handle
// ponytail: one global lock, not per-game — a hackathon bot only ever plays
// one table at a time in practice. Upgrade to per-game nonce management (or
// viem's nonce manager) if the bot needs to run several games concurrently.
let acting = false;

function startWatching(gameId) {
  const key = gameId.toString();
  if (watchers.has(key)) return;

  const tick = async () => {
    if (acting) return;
    try {
      await maybeAct(gameId);
    } catch (err) {
      logger.error('[Bot] game %s tick failed: %s', key, err.message);
    }
  };

  watchers.set(key, setInterval(() => void tick(), POLL_MS));
  void tick();
}

function stopWatching(gameId) {
  const key = gameId.toString();
  const interval = watchers.get(key);
  if (interval) {
    clearInterval(interval);
    watchers.delete(key);
  }
}

async function maybeAct(gameId) {
  const { account, walletClient, publicClient } = getBotClients();
  const contractAddress = process.env.ZUNNOINCO_ADDRESS;

  const state = await publicClient.readContract({
    address: contractAddress,
    abi: GAME_ABI,
    functionName: 'getGameState',
    args: [gameId],
  });
  const [, currentPlayer, , , , , phase, topValue, activeColor] = state;

  if (Number(phase) === PHASE.finished) {
    stopWatching(gameId);
    return;
  }
  if (Number(phase) !== PHASE.active) return;
  if (currentPlayer.toLowerCase() !== account.address.toLowerCase()) return;

  acting = true;
  try {
    const handles = await publicClient.readContract({
      address: contractAddress,
      abi: GAME_ABI,
      functionName: 'getMyHandHandles',
      args: [gameId],
      account: account.address,
    });
    if (handles.length === 0) return;

    const hand = await decryptBotHand(walletClient, handles);

    // ponytail: naive strategy — first legal card in hand order, else draw.
    // Upgrade path: prefer clearing action cards, hold wilds, weigh the
    // opponent's visible hand size.
    const playIndex = hand.findIndex((card) => isPlayable(card.value, topValue, activeColor));

    if (playIndex === -1) {
      const data = encodeFunctionData({ abi: GAME_ABI, functionName: 'drawCard', args: [gameId] });
      const hash = await walletClient.sendTransaction({ to: contractAddress, data });
      logger.info('[Bot] game %s: drew a card (%s)', gameId.toString(), hash);
      return;
    }

    const card = hand[playIndex];
    const chosenColor = isWild(card.value) ? Math.floor(Math.random() * 4) : 0;
    const data = encodeFunctionData({
      abi: GAME_ABI,
      functionName: 'playCard',
      args: [gameId, BigInt(playIndex), card.value, card.signatures, chosenColor],
    });
    const hash = await walletClient.sendTransaction({ to: contractAddress, data });
    logger.info('[Bot] game %s: played card value %s (%s)', gameId.toString(), card.value.toString(), hash);
  } finally {
    acting = false;
  }
}

module.exports = { startWatching, stopWatching, GAME_ABI };
