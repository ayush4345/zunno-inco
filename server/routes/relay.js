const express = require('express');
const { relayForwardRequest, submitDealCards } = require('../services/relayer');
const logger = require('../logger');

const router = express.Router();

// Forward a player-signed ERC-2771 request (drawCard/playCard) on-chain.
// The player signs off-chain; this endpoint pays gas and submits it.
router.post('/forward', async (req, res) => {
  const { from, to, value, gas, deadline, data, signature } = req.body || {};
  if (!from || !to || value === undefined || gas === undefined || deadline === undefined || !data || !signature) {
    return res.status(400).json({ error: 'missing forward request fields' });
  }
  try {
    const txHash = await relayForwardRequest({ from, to, value, gas, deadline, data, signature });
    res.json({ txHash });
  } catch (err) {
    logger.error('relay forward failed', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Submit dealCards on the caller's behalf right after startGame confirms, so
// the player only signs once. No player signature needed here at all -
// dealCards has no msg.sender gate, the relayer just calls it directly.
router.post('/deal-cards', async (req, res) => {
  const { gameId, count } = req.body || {};
  if (gameId === undefined || count === undefined) {
    return res.status(400).json({ error: 'gameId and count are required' });
  }
  try {
    const txHash = await submitDealCards(gameId, count);
    res.json({ txHash });
  } catch (err) {
    logger.error('relay deal-cards failed', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
