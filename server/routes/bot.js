const express = require('express');
const { joinBotGame } = require('../bot');
const logger = require('../logger');

const router = express.Router();

// Seat the on-chain bot into a table the client just created with
// createGame(creator, isBot=true). The bot then plays its own turns
// automatically — see server/bot/gameBot.js.
router.post('/join', async (req, res) => {
  const { gameId } = req.body || {};
  if (gameId === undefined || gameId === null) {
    return res.status(400).json({ error: 'gameId is required' });
  }
  try {
    const txHash = await joinBotGame(gameId);
    res.json({ txHash });
  } catch (err) {
    logger.error('bot join failed', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
