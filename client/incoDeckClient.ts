// Zunno × Inco — frontend confidential-deck client
//
// Bridges the React app to Inco Lightning: read your secret hand handles from
// the contract, user-decrypt them client-side to SEE your cards, and produce
// the covalidator attestation (value + signatures) you submit on-chain to
// commitOpening()/playCard().
//
import { Lightning } from "@inco/lightning-js/lite";
import { supportedChains, type HexString } from "@inco/lightning-js";
import { bytesToHex, type Account, type Chain, type Transport, type WalletClient } from "viem";

export type ConnectedWalletClient = WalletClient<Transport, Chain, Account>;

// ── Zap (Inco client) ───────────────────────────────────────────────────────
let baseSepoliaZap: ReturnType<typeof Lightning.baseSepoliaTestnet> | undefined;

export function getZap(rpcUrl?: string) {
  // For Base mainnet use Lightning.baseMainnet(). Pass your own RPC for reliability.
  if (rpcUrl) return Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [rpcUrl] });
  return baseSepoliaZap ??= Lightning.baseSepoliaTestnet();
}

export const BASE_SEPOLIA = supportedChains.baseSepolia;

type IncoWalletClient = Parameters<
  Awaited<ReturnType<typeof getZap>>["attestedDecrypt"]
>[0];

// lightning-js pins an older viem minor; the connected client is runtime-compatible.
const asIncoWallet = (wallet: ConnectedWalletClient) =>
  wallet as unknown as IncoWalletClient;

// ── Attested decryption: value + signatures for on-chain _verifyValue ─────────
// The player is `allow`ed on their own card handles (and everyone on the opener),
// so they can obtain a covalidator attestation of the plaintext. The same
// { value, signatures } is submitted to playCard()/commitOpening(), where the
// contract calls e.verifyDecryption(handle, value, sigs).
export interface AttestedValue {
  value: bigint; // 1..108 (deck value)
  signatures: HexString[]; // covalidator sigs -> contract `bytes[] sigs`
}

const DECRYPT_OPTIONS = {
  backoffConfig: { maxRetries: 12, baseDelayInMs: 350, backoffFactor: 1.4 },
} as const;

function toAttestedValue(result: {
  plaintext: { value: bigint | boolean };
  covalidatorSignatures: Uint8Array[];
}): AttestedValue {
  if (typeof result.plaintext.value !== "bigint") {
    throw new Error("card attestation was not an encrypted uint256");
  }
  return {
    value: result.plaintext.value,
    signatures: result.covalidatorSignatures.map((signature) => bytesToHex(signature)),
  };
}

export async function attestCard(
  zap: Awaited<ReturnType<typeof getZap>>,
  wallet: ConnectedWalletClient,
  handle: HexString
): Promise<AttestedValue> {
  const [result] = await zap.attestedDecrypt(asIncoWallet(wallet), [handle], DECRYPT_OPTIONS);
  if (!result) throw new Error("card attestation was not returned");
  return toAttestedValue(result);
}

export async function attestRevealedCard(
  zap: Awaited<ReturnType<typeof getZap>>,
  handle: HexString
): Promise<AttestedValue> {
  const [result] = await zap.attestedReveal([handle], DECRYPT_OPTIONS);
  if (!result) throw new Error("public card attestation was not returned");
  return toAttestedValue(result);
}

// ── UNO card codec (mirror of contracts/src/UnoCards.sol) ─────────────────────
export type Kind = "number" | "skip" | "reverse" | "drawTwo" | "wild" | "wildDraw4";
export const COLORS = ["Red", "Yellow", "Green", "Blue", "Wild"] as const;

export interface UnoCard {
  color: number; // 0..3, 4 = wild
  kind: Kind;
  number: number; // 0..9 (valid when kind === "number")
  label: string; // e.g. "Red 5", "Blue Skip", "Wild +4"
}

export function decodeUnoCard(value: number | bigint): UnoCard {
  const v = Number(value);
  if (v < 1 || v > 108) throw new Error("card out of range");
  const id = v - 1;
  if (id >= 100) {
    const kind: Kind = id < 104 ? "wild" : "wildDraw4";
    return { color: 4, kind, number: -1, label: kind === "wild" ? "Wild" : "Wild +4" };
  }
  const color = Math.floor(id / 25);
  const w = id % 25;
  let kind: Kind, number = -1;
  if (w === 0) { kind = "number"; number = 0; }
  else if (w <= 18) { kind = "number"; number = Math.floor((w + 1) / 2); } // 1,2->1 ... 17,18->9
  else if (w <= 20) kind = "skip";
  else if (w <= 22) kind = "reverse";
  else kind = "drawTwo";
  const cname = COLORS[color];
  const label =
    kind === "number" ? `${cname} ${number}`
    : kind === "skip" ? `${cname} Skip`
    : kind === "reverse" ? `${cname} Reverse`
    : `${cname} +2`;
  return { color, kind, number, label };
}

const COLOR_CODES = ["R", "Y", "G", "B"] as const;

/** Map the contract codec to the existing card artwork filenames. */
export function cardAsset(card: UnoCard): string {
  if (card.kind === "wild") return "W";
  if (card.kind === "wildDraw4") return "D4W";
  const color = COLOR_CODES[card.color];
  if (!color) throw new Error("card color out of range");
  if (card.kind === "skip") return `skip${color}`;
  if (card.kind === "reverse") return `_${color}`;
  if (card.kind === "drawTwo") return `D2${color}`;
  return `${card.number}${color}`;
}

// ── High-level: read + peek your hand ─────────────────────────────────────────
// `readHandHandles` should call the contract view getMyHandHandles(gameId).
export async function peekMyHand(
  zap: Awaited<ReturnType<typeof getZap>>,
  wallet: ConnectedWalletClient,
  handles: HexString[]
): Promise<Array<{ handle: HexString; card: UnoCard; attested: AttestedValue }>> {
  if (handles.length === 0) return [];
  const results = await zap.attestedDecrypt(asIncoWallet(wallet), handles, DECRYPT_OPTIONS);
  if (results.length !== handles.length) throw new Error("incomplete hand attestation");
  return results.map((result) => {
    const attested = toAttestedValue(result);
    return { handle: result.handle, card: decodeUnoCard(attested.value), attested };
  });
}
