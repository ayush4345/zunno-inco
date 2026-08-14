/**
 * The bot's own viem clients. Unlike the meta-tx relayer, the bot submits
 * drawCard/playCard directly with its own key — it's a backend service, not
 * a player who cares about gas cost or wallet popups, so there's no reason
 * to route its moves through the ERC-2771 forwarder.
 */
const { createWalletClient, createPublicClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');

let clients;
function getBotClients() {
  if (!clients) {
    const pk = process.env.BOT_PRIVATE_KEY;
    if (!pk) throw new Error('BOT_PRIVATE_KEY not set');
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

module.exports = { getBotClients };
