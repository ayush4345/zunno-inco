/**
 * Server-side Inco hand decryption for the bot — same voucher-session
 * mechanism client/incoDeckClient.ts uses in the browser, confirmed
 * Node-compatible by Inco's own session-key-decrypt.ts example (a plain
 * Node script, no browser/DOM dependency). The bot has one identity across
 * every game it plays, so one session (re-granted on expiry) covers all of
 * them — no per-game session needed.
 */
const { Lightning } = require('@inco/lightning-js/lite');
const { bytesToHex } = require('viem');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

const DEFAULT_SESSION_VERIFIER = '0xc34569efc25901bdd6b652164a2c8a7228b23005';
const HAND_SESSION_MS = 10 * 60 * 1000;

let zapPromise;
function getZap() {
  return (zapPromise ??= Lightning.baseSepoliaTestnet());
}

let session;
async function getBotHandSession(walletClient) {
  if (session && session.expiresAt > Date.now()) return session;
  const zap = await getZap();
  const account = privateKeyToAccount(generatePrivateKey());
  const expiresAt = Date.now() + HAND_SESSION_MS;
  const voucher = await zap.grantSessionKeyAllowanceVoucher(
    walletClient,
    account.address,
    new Date(expiresAt),
    DEFAULT_SESSION_VERIFIER,
  );
  session = { account, voucher, expiresAt };
  return session;
}

/** @returns {Promise<Array<{handle: string, value: bigint, signatures: string[]}>>} */
async function decryptBotHand(walletClient, handles) {
  if (handles.length === 0) return [];
  const zap = await getZap();
  const activeSession = await getBotHandSession(walletClient);
  let results;
  try {
    results = await zap.attestedDecryptWithVoucher(activeSession.account, activeSession.voucher, handles);
  } catch (cause) {
    session = null; // voucher may have been rejected/expired server-side — force a fresh grant next tick
    throw cause;
  }
  return results.map((result) => ({
    handle: result.handle,
    value: result.plaintext.value,
    signatures: result.covalidatorSignatures.map((sig) => bytesToHex(sig)),
  }));
}

module.exports = { decryptBotHand };
