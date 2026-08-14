const express = require('express');
const { relayForwardRequest } = require('../services/relayer');
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

module.exports = router;
