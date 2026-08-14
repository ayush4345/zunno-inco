"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWalletClient,
} from "wagmi";
import {
  attestRevealedCard,
  cardAsset,
  createHandDecryptSession,
  decodeUnoCard,
  getZap,
  peekMyHand,
  type AttestedValue,
  type ConnectedWalletClient,
  type HandDecryptSession,
  type UnoCard,
} from "../../../incoDeckClient";
import { unoGameABI } from "@/constants/unogameabi";
import { getContractAddress, getForwarderAddress } from "@/config/networks";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useSoundProvider } from "@/context/SoundProvider";
import GameBackground from "./GameBackground";
import GameScreen from "./GameScreen";
import ColourDialog from "./colourDialog";

const CHAIN_ID = 84532;
const PHASE = { waiting: 0, opening: 1, active: 2, finished: 3 } as const;
const COLOR_INDEX: Record<string, number> = { R: 0, Y: 1, G: 2, B: 3 };
const COLOR_CODE = ["R", "Y", "G", "B"] as const;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

// Minimal ERC2771Forwarder ABI slice — only what the client needs to sign a
// meta-tx request (nonce read). Submission goes through the backend relayer.
const FORWARDER_ABI = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

type PeekedCard = Awaited<ReturnType<typeof peekMyHand>>[number] & {
  asset: string;
};

type ChainGame = {
  players: Address[];
  currentPlayer: Address;
  turn: number;
  direction: number;
  pot: bigint;
  buyIn: bigint;
  phase: number;
  topValue: bigint;
  activeColor: number;
  winner: Address;
  handSizes: number[];
  dealt: number;
  dealTotal: number;
  openingReady: boolean;
};

type PendingColor =
  | { kind: "opening"; attested: AttestedValue }
  | { kind: "play"; handIndex: number };

type JackpotState = { entered: boolean; claimed: boolean; ticketCount: number };
type MegapotRound = { potUsdc: number; endsAt: string };

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

const formatCountdown = (endsAt: string) => {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "drawing now";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
};

const errorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "shortMessage" in error) {
    return String((error as { shortMessage: unknown }).shortMessage);
  }
  return error instanceof Error ? error.message : "Unknown error";
};

export default function ConfidentialGame({ gameId }: { gameId: bigint }) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_ID });
  const { sendTransactionAsync } = useSendTransaction();
  const { toast } = useToast();
  const {
    playCardPlayedSound,
    playDraw2CardSound,
    playDraw4CardSound,
    playGameOverSound,
    playShufflingSound,
    playSkipCardSound,
    playUnoSound,
    playWildCardSound,
  } = useSoundProvider();
  const contractAddress = getContractAddress(CHAIN_ID) as Address;
  const forwarderAddress = getForwarderAddress(CHAIN_ID) as Address | "";

  const [game, setGame] = useState<ChainGame | null>(null);
  const [handles, setHandles] = useState<Hex[]>([]);
  const [hand, setHand] = useState<PeekedCard[]>([]);
  const [needsDecrypt, setNeedsDecrypt] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingColor, setPendingColor] = useState<PendingColor | null>(null);
  const [jackpot, setJackpot] = useState<JackpotState | null>(null);
  const [megapotRound, setMegapotRound] = useState<MegapotRound | null>(null);
  const cardCache = useRef(new Map<string, PeekedCard>());
  const handSession = useRef<HandDecryptSession | null>(null);
  const previousGame = useRef<ChainGame | null>(null);

  const isPlayer = useCallback(
    (players: readonly string[]) =>
      !!address && players.some((player) => player.toLowerCase() === address.toLowerCase()),
    [address],
  );

  const syncHandles = useCallback((nextHandles: readonly Hex[]) => {
    const nextHand = nextHandles
      .map((handle) => cardCache.current.get(handle.toLowerCase()))
      .filter((card): card is PeekedCard => !!card);
    setHandles([...nextHandles]);
    setHand(nextHand);
    setNeedsDecrypt(nextHand.length !== nextHandles.length);
  }, []);

  const refresh = useCallback(async () => {
    if (!publicClient || !contractAddress) return null;
    try {
      const [state, sizes, deal, jackpotState] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: unoGameABI,
          functionName: "getGameState",
          args: [gameId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: unoGameABI,
          functionName: "getHandSizes",
          args: [gameId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: unoGameABI,
          functionName: "getDealProgress",
          args: [gameId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: unoGameABI,
          functionName: "getGameJackpot",
          args: [gameId],
        }),
      ]);
      setJackpot({
        ticketCount: jackpotState[0].length,
        entered: jackpotState[2],
        claimed: jackpotState[3],
      });

      const nextGame: ChainGame = {
        players: [...state[0]],
        currentPlayer: state[1],
        turn: Number(state[2]),
        direction: Number(state[3]),
        pot: state[4],
        buyIn: state[5],
        phase: Number(state[6]),
        topValue: state[7],
        activeColor: Number(state[8]),
        winner: state[9],
        handSizes: sizes.map(Number),
        dealt: Number(deal[0]),
        dealTotal: Number(deal[1]),
        openingReady: deal[2],
      };
      setGame(nextGame);
      setError(null);

      let nextHandles: Hex[] = [];
      if (
        address &&
        isPlayer(nextGame.players) &&
        nextGame.phase >= PHASE.opening &&
        nextGame.phase < PHASE.finished
      ) {
        nextHandles = [...(await publicClient.readContract({
          account: address,
          address: contractAddress,
          abi: unoGameABI,
          functionName: "getMyHandHandles",
          args: [gameId],
        }))];
        syncHandles(nextHandles);
      }
      return nextHandles;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    }
  }, [address, contractAddress, gameId, isPlayer, publicClient, syncHandles]);

  const decryptHandles = useCallback(
    async (nextHandles: readonly Hex[]) => {
      if (!walletClient?.account) throw new Error("Connect your browser wallet first");
      const missing = nextHandles.filter(
        (handle) => !cardCache.current.has(handle.toLowerCase()),
      );
      if (missing.length) {
        const zap = await getZap();
        const wallet = walletClient as ConnectedWalletClient;
        let session = handSession.current;
        if (!session || session.expiresAt <= Date.now()) {
          setBusy("Authorize a 10-minute private-hand session…");
          session = await createHandDecryptSession(zap, wallet);
          handSession.current = session;
        }
        let revealed;
        try {
          revealed = await peekMyHand(zap, missing, session);
        } catch (cause) {
          handSession.current = null;
          throw cause;
        }
        revealed.forEach((card) => {
          cardCache.current.set(card.handle.toLowerCase(), {
            ...card,
            asset: cardAsset(card.card),
          });
        });
      }
      syncHandles(nextHandles);
    },
    [syncHandles, walletClient],
  );

  const unlockHand = useCallback(async () => {
    setBusy("Decrypting your private hand…");
    setError(null);
    try {
      await decryptHandles(handles);
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      toast({ title: "Could not decrypt hand", description: message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }, [decryptHandles, handles, toast]);

  const transact = useCallback(
    async (label: string, data: Hex, decryptAfter = false, gas?: bigint) => {
      if (!address || !publicClient || !walletClient?.account) {
        throw new Error("Connect your browser wallet first");
      }
      if (chain?.id !== CHAIN_ID) throw new Error("Switch your wallet to Base Sepolia");

      setBusy(`${label}: checking move…`);
      setError(null);
      try {
        await publicClient.call({ account: address, to: contractAddress, data });
        setBusy(`${label}: confirm in wallet…`);
        const hash = await sendTransactionAsync({ to: contractAddress, data, chainId: CHAIN_ID, gas });
        setBusy(`${label}: confirming on Base Sepolia…`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        const nextHandles = await refresh();
        if (decryptAfter && nextHandles) {
          setBusy("Decrypting your new card…");
          await decryptHandles(nextHandles);
        }
        return receipt;
      } catch (cause) {
        const message = errorMessage(cause);
        setError(message);
        toast({ title: `${label} failed`, description: message, variant: "destructive" });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [address, chain?.id, contractAddress, decryptHandles, publicClient, refresh, sendTransactionAsync, toast, walletClient],
  );

  /** Same as `transact`, but for drawCard/playCard: the player signs an
   *  off-chain EIP-712 request instead of a transaction, and the backend
   *  relayer submits + pays gas. Falls back to `transact` when no forwarder
   *  is configured for this network. */
  const relayTransact = useCallback(
    async (label: string, data: Hex, decryptAfter = false, gas: bigint = 300_000n) => {
      if (!forwarderAddress) return transact(label, data, decryptAfter);
      if (!address || !publicClient || !walletClient?.account) {
        throw new Error("Connect your browser wallet first");
      }
      if (chain?.id !== CHAIN_ID) throw new Error("Switch your wallet to Base Sepolia");

      setBusy(`${label}: sign…`);
      setError(null);
      try {
        const nonce = await publicClient.readContract({
          address: forwarderAddress,
          abi: FORWARDER_ABI,
          functionName: "nonces",
          args: [address],
        });
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const message = {
          from: address,
          to: contractAddress,
          value: 0n,
          gas,
          nonce,
          deadline,
          data,
        };
        const signature = await walletClient.signTypedData({
          account: address,
          domain: { name: "ZunnoInco", version: "1", chainId: CHAIN_ID, verifyingContract: forwarderAddress },
          types: FORWARD_REQUEST_TYPES,
          primaryType: "ForwardRequest",
          message,
        });

        setBusy(`${label}: relaying…`);
        const res = await fetch(`${BACKEND_URL}/api/relay/forward`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({
            from: message.from,
            to: message.to,
            value: message.value.toString(),
            gas: message.gas.toString(),
            deadline: message.deadline.toString(),
            data: message.data,
            signature,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Relay failed");

        setBusy(`${label}: confirming on Base Sepolia…`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: body.txHash as Hex });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        const nextHandles = await refresh();
        if (decryptAfter && nextHandles) {
          setBusy("Decrypting your new card…");
          await decryptHandles(nextHandles);
        }
        return receipt;
      } catch (cause) {
        const message = errorMessage(cause);
        setError(message);
        toast({ title: `${label} failed`, description: message, variant: "destructive" });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [address, chain?.id, contractAddress, decryptHandles, forwarderAddress, publicClient, refresh, toast, transact, walletClient],
  );

  useEffect(() => {
    cardCache.current.clear();
    handSession.current = null;
    previousGame.current = null;
    setGame(null);
    setHandles([]);
    setHand([]);
    setNeedsDecrypt(false);
  }, [address, gameId]);

  useEffect(() => {
    if (game?.phase === PHASE.finished) handSession.current = null;
  }, [game?.phase]);

  useEffect(() => {
    const previous = previousGame.current;
    previousGame.current = game;
    if (!game || !previous) return;

    if (game.phase === PHASE.finished && previous.phase !== PHASE.finished) {
      playGameOverSound();
      return;
    }
    if (game.handSizes.some((size, index) => size === 1 && previous.handSizes[index] !== 1)) {
      playUnoSound();
      return;
    }
    if (game.topValue !== previous.topValue && game.topValue > 0n) {
      const card = decodeUnoCard(game.topValue);
      if (card.kind === "skip") playSkipCardSound();
      else if (card.kind === "drawTwo") playDraw2CardSound();
      else if (card.kind === "wildDraw4") playDraw4CardSound();
      else if (card.kind === "wild") playWildCardSound();
      else playCardPlayedSound();
      return;
    }
    const cardCount = (sizes: number[]) => sizes.reduce((total, size) => total + size, 0);
    if (cardCount(game.handSizes) > cardCount(previous.handSizes)) playShufflingSound();
  }, [
    game,
    playCardPlayedSound,
    playDraw2CardSound,
    playDraw4CardSound,
    playGameOverSound,
    playShufflingSound,
    playSkipCardSound,
    playUnoSound,
    playWildCardSound,
  ]);

  useEffect(() => {
    void getZap().catch(() => undefined);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  // Once a hand-decrypt voucher session exists, decrypt newly-dealt cards
  // silently instead of waiting on a manual click — the voucher already
  // covers this, no wallet popup needed. First-ever decrypt in a game still
  // needs the button, since that's what creates the session (a real wallet
  // signature the user should consciously approve).
  useEffect(() => {
    if (!needsDecrypt || busy) return;
    const session = handSession.current;
    if (session && session.expiresAt > Date.now()) {
      void unlockHand();
    }
  }, [needsDecrypt, busy, unlockHand]);

  useEffect(() => {
    const loadRound = async () => {
      try {
        // Base Sepolia only enters Megapot's *testnet* rounds — the production
        // host (api.megapot.io) serves the real mainnet lottery, an entirely
        // different pot/schedule unrelated to what our contract's tickets are
        // actually in.
        const res = await fetch("https://api-testnet.megapot.io/v1/rounds/active");
        if (!res.ok) return;
        const round = await res.json();
        setMegapotRound({
          potUsdc: Number(round.prize_pool.amount) / 10 ** round.prize_pool.decimals,
          endsAt: round.ended_at,
        });
      } catch {
        // Data API is best-effort — the game never blocks on it.
      }
    };
    void loadRound();
    const interval = window.setInterval(() => void loadRound(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const startGame = async () => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "startGame",
      args: [gameId],
    });
    // startGame's internal Megapot entry is wrapped in try/catch, so eth_estimateGas
    // returns the lowest gas that lets the OUTER call succeed — the path where the
    // inner call starves under EIP-150 and silently skips the jackpot. Force a
    // generous limit (measured ~1.5M for shuffle + ticket buy) so it actually enters.
    const receipt = await transact("Start game", data, false, 4_000_000n);
    if (!receipt) return;

    // dealCards has no msg.sender gate (anyone can advance the deal), so the
    // relayer submits it directly with its own key — no second wallet popup.
    // MAX_DEAL_BATCH (8) covers a full 2-player deal in one call. Falls back
    // to the manual "Deal next 8 cards" button (rendered while !openingReady)
    // if the relay call fails for any reason.
    try {
      const res = await fetch(`${BACKEND_URL}/api/relay/deal-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ gameId: gameId.toString(), count: 8 }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      // non-fatal — manual deal button covers this
    } finally {
      void refresh();
    }
  };

  const dealCards = async () => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "dealCards",
      args: [gameId, 8],
    });
    await transact("Deal encrypted cards", data);
  };

  const commitOpening = async (attested: AttestedValue, chosenColor: number) => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "commitOpening",
      args: [gameId, attested.value, attested.signatures, chosenColor],
    });
    await transact("Commit opening card", data);
  };

  const revealOpening = async () => {
    if (!publicClient) return;
    setBusy("Revealing the public opening card…");
    setError(null);
    try {
      const handle = await publicClient.readContract({
        address: contractAddress,
        abi: unoGameABI,
        functionName: "getOpeningHandle",
        args: [gameId],
      });
      const attested = await attestRevealedCard(await getZap(), handle);
      const card = decodeUnoCard(attested.value);
      if (card.kind === "wild" || card.kind === "wildDraw4") {
        setPendingColor({ kind: "opening", attested });
      } else {
        await commitOpening(attested, card.color);
      }
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      toast({ title: "Opening reveal failed", description: message, variant: "destructive" });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const submitPlay = async (handIndex: number, chosenColor: number) => {
    const handle = handles[handIndex];
    const selected = handle && cardCache.current.get(handle.toLowerCase());
    if (!selected) throw new Error("Decrypt this card before playing it");
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "playCard",
      args: [gameId, BigInt(handIndex), selected.attested.value, selected.attested.signatures, chosenColor],
    });
    // Draw Two / Wild Draw Four deal 2/4 extra confidential cards inside the
    // same call (~120k gas each on Base Sepolia) on top of the base playCard
    // cost — the default 300k relay gas limit isn't enough and the meta-tx
    // reverts with FailedCall() (out of gas, swallowed by the forwarder).
    const gas =
      selected.card.kind === "wildDraw4" ? 1_000_000n : selected.card.kind === "drawTwo" ? 700_000n : 300_000n;
    await relayTransact("Play card", data, false, gas);
  };

  const playCard = async (asset: string) => {
    const handIndex = handles.findIndex(
      (handle) => cardCache.current.get(handle.toLowerCase())?.asset === asset,
    );
    if (handIndex < 0) return;
    const selected = cardCache.current.get(handles[handIndex].toLowerCase());
    if (!selected) return;
    if (selected.card.kind === "wild" || selected.card.kind === "wildDraw4") {
      setPendingColor({ kind: "play", handIndex });
      return;
    }
    await submitPlay(handIndex, selected.card.color);
  };

  const drawCard = async () => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "drawCard",
      args: [gameId],
    });
    await relayTransact("Draw card", data, true);
  };

  const claimJackpot = async () => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "claimGameJackpot",
      args: [gameId],
    });
    await transact("Claim jackpot", data);
  };

  const selectColor = async (color: string) => {
    const pending = pendingColor;
    setPendingColor(null);
    if (!pending) return;
    const chosenColor = COLOR_INDEX[color];
    if (chosenColor === undefined) return;
    if (pending.kind === "opening") await commitOpening(pending.attested, chosenColor);
    else await submitPlay(pending.handIndex, chosenColor);
  };

  const playerIndex = game && address
    ? game.players.findIndex((player) => player.toLowerCase() === address.toLowerCase())
    : -1;
  const currentUser = playerIndex >= 0 ? `Player ${playerIndex + 1}` : "Spectator";
  const turn = game ? `Player ${game.turn + 1}` : "";
  const topCard: UnoCard | null = game?.phase === PHASE.active && game.topValue
    ? decodeUnoCard(game.topValue)
    : null;
  const topAsset = topCard ? cardAsset(topCard) : null;
  const decks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => {
      if (!game || index >= game.players.length) return [];
      if (index === playerIndex) return hand.map((card) => card.asset);
      return Array.from({ length: game.handSizes[index] || 0 }, (__, card) => `hidden-${index}-${card}`);
    }),
    [game, hand, playerIndex],
  );

  const shell = (content: React.ReactNode) => (
    <div style={{ minHeight: "100svh", position: "relative", overflow: "hidden" }}>
      <GameBackground turn={turn} currentColor="B" currentUser={currentUser} totalPlayers={game?.players.length || 2} />
      <div style={{ position: "relative", zIndex: 20 }}>
        {content}
      </div>
      <Toaster />
    </div>
  );

  const { expanded: jackpotExpanded, expand: expandJackpot } = useJackpotCollapse();

  // startGame now auto-triggers dealCards via the relayer, so dealing is
  // normally hands-off. Only surface the manual "Deal next N cards" button
  // as a fallback if the deal hasn't progressed in a while (relay down,
  // etc.) — otherwise just show a "Dealing…" status with nothing to click.
  const [showManualDeal, setShowManualDeal] = useState(false);
  useEffect(() => {
    if (game?.phase !== PHASE.opening || game.openingReady) {
      setShowManualDeal(false);
      return;
    }
    setShowManualDeal(false);
    const timer = window.setTimeout(() => setShowManualDeal(true), 8000);
    return () => window.clearTimeout(timer);
  }, [game?.phase, game?.dealt, game?.openingReady]);

  if (!contractAddress) return shell(<StatusPanel title="Contract not configured" detail="Set NEXT_PUBLIC_BASE_SEPOLIA_CONTRACT_ADDRESS." />);
  if (!address) return shell(<StatusPanel title="Connect your wallet" detail="Use a browser wallet on Base Sepolia." />);
  if (!game) return shell(<StatusPanel title="Loading confidential game…" detail={error || `Game #${gameId}`} />);

  if (game.phase === PHASE.waiting) {
    const creator = game.players[0]?.toLowerCase() === address.toLowerCase();
    return shell(
      <StatusPanel
        title={`Game #${gameId}`}
        detail={game.players.map((player, index) => `Player ${index + 1}: ${shortAddress(player)}`).join("  •  ")}
      >
        {creator ? (
          <button className="glossy-button glossy-button-blue" disabled={!!busy || game.players.length < 2} onClick={() => void startGame()}>
            {busy || (game.players.length < 2 ? "Waiting for another player" : "Start confidential game")}
          </button>
        ) : (
          <span style={{ color: "white" }}>Waiting for the creator to start…</span>
        )}
        <MegapotInfoBox
          round={megapotRound}
          jackpot={jackpot}
          finished={false}
          busy={!!busy}
          onClaim={() => void claimJackpot()}
          style={{ width: "100%" }}
        />
      </StatusPanel>,
    );
  }

  if (game.phase === PHASE.opening) {
    const remaining = game.dealTotal - game.dealt;
    return shell(
      <StatusPanel
        title={game.openingReady ? "Encrypted hands dealt" : "Dealing encrypted hands"}
        detail={game.openingReady
          ? "Reveal the public opening card to activate turns."
          : `${game.dealt}/${game.dealTotal} cards dealt. Batches keep each transaction below Base Sepolia's gas cap.`}
      >
        {game.openingReady && needsDecrypt && (
          <button className="glossy-button glossy-button-blue" disabled={!!busy} onClick={() => void unlockHand()}>
            Decrypt my {handles.length}-card hand
          </button>
        )}
        {game.openingReady ? (
          <button className="glossy-button glossy-button-blue" disabled={!!busy} onClick={() => void revealOpening()}>
            {busy || "Reveal opening card"}
          </button>
        ) : showManualDeal ? (
          <button className="glossy-button glossy-button-blue" disabled={!!busy} onClick={() => void dealCards()}>
            {busy || `Deal next ${Math.min(8, remaining)} cards`}
          </button>
        ) : (
          <span style={{ color: "white", opacity: 0.75 }}>{busy || "Dealing…"}</span>
        )}
        <MegapotInfoBox
          round={megapotRound}
          jackpot={jackpot}
          finished={false}
          busy={!!busy}
          onClaim={() => void claimJackpot()}
          style={{ width: "100%" }}
        />
      </StatusPanel>,
    );
  }

  if (game.phase === PHASE.finished) {
    const won = game.winner.toLowerCase() === address.toLowerCase();
    return shell(
      <StatusPanel title={won ? "You won!" : `${shortAddress(game.winner)} won`}>
        <MegapotInfoBox
          round={megapotRound}
          jackpot={jackpot}
          finished
          busy={!!busy}
          onClaim={() => void claimJackpot()}
          style={{ width: "100%" }}
        />
      </StatusPanel>,
    );
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100svh", overflow: "hidden" }}>
      <GameBackground
        turn={turn}
        currentColor={COLOR_CODE[game.activeColor] || "B"}
        currentUser={currentUser}
        totalPlayers={game.players.length}
      />
      {jackpotExpanded && (
        <MegapotInfoBox
          round={megapotRound}
          jackpot={jackpot}
          finished={game.phase === PHASE.finished}
          busy={!!busy}
          onClaim={() => void claimJackpot()}
          style={{ position: "fixed", top: 52, right: 12, zIndex: 85, maxWidth: "70vw" }}
        />
      )}
      <div style={{ position: "relative", zIndex: 10 }}>
        <GameScreen
          currentUser={currentUser}
          turn={turn}
          player1Deck={decks[0]}
          player2Deck={decks[1]}
          player3Deck={decks[2]}
          player4Deck={decks[3]}
          player5Deck={decks[4]}
          player6Deck={decks[5]}
          playerCount={game.players.length}
          onCardDrawnHandler={() => void drawCard()}
          onCardPlayedHandler={(asset: string) => void playCard(asset)}
          playedCardsPile={topAsset ? [topAsset] : []}
          drawButtonPressed={false}
          onSkipButtonHandler={() => undefined}
          onUnoClicked={playUnoSound}
          turnTimerEnabled={false}
          actionsDisabled={!!busy || needsDecrypt || playerIndex < 0}
          jackpotButton={<MegapotPotButton round={megapotRound} onClick={expandJackpot} />}
        />
      </div>

      <div style={{ position: "fixed", top: 58, left: "50%", transform: "translateX(-50%)", zIndex: 80, padding: "0.55rem 1rem", borderRadius: 999, background: "rgba(0,0,0,.72)", color: "white", fontFamily: "monospace", textAlign: "center" }}>
        {busy || (turn === currentUser ? "Your turn" : `${shortAddress(game.currentPlayer)} is playing`)}
        <span style={{ opacity: 0.65 }}> · {game.direction === 1 ? "clockwise" : "counter-clockwise"}</span>
      </div>

      {needsDecrypt && !busy && playerIndex >= 0 && (
        <button
          className="glossy-button glossy-button-blue"
          style={{ position: "fixed", top: 108, left: "50%", transform: "translateX(-50%)", zIndex: 90 }}
          onClick={() => void unlockHand()}
        >
          Decrypt private cards
        </button>
      )}

      {error && (
        <div style={{ position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 90, maxWidth: "90vw", padding: "0.6rem 1rem", borderRadius: 10, background: "rgba(127,29,29,.92)", color: "white" }}>
          {error}
        </div>
      )}

      <ColourDialog
        isDialogOpen={!!pendingColor}
        onClose={() => setPendingColor(null)}
        onSubmit={(color) => void selectColor(color)}
      />
      <Toaster />
    </div>
  );
}

function megapotPotLabel(round: MegapotRound | null) {
  return round ? `$${round.potUsdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "Megapot";
}

/** 15s open on first mount, 10s on any re-open via `expand()`. */
function useJackpotCollapse() {
  const [expanded, setExpanded] = useState(true);
  const collapseTimer = useRef<number | null>(null);

  const clearCollapseTimer = () => {
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
  };

  useEffect(() => {
    collapseTimer.current = window.setTimeout(() => setExpanded(false), 15000);
    return clearCollapseTimer;
  }, []);

  const expand = () => {
    clearCollapseTimer();
    setExpanded(true);
    collapseTimer.current = window.setTimeout(() => setExpanded(false), 10000);
  };

  return { expanded, expand };
}

/** Full jackpot details — pot, countdown, ticket status, claim button. No
 *  positioning of its own; callers place it (inline in a status panel, or
 *  as a positioned overlay while in-game). */
function MegapotInfoBox({
  round,
  jackpot,
  finished,
  busy,
  onClaim,
  style,
}: {
  round: MegapotRound | null;
  jackpot: JackpotState | null;
  finished: boolean;
  busy: boolean;
  onClaim: () => void;
  style?: React.CSSProperties;
}) {
  // ponytail: the ticket's own drawing window isn't tracked on-chain by us, so we
  // approximate "settled" with the currently-active round's end time — accurate
  // as long as the game finishes inside the same ~30min drawing it entered.
  const roundEnded = round ? new Date(round.endsAt).getTime() <= Date.now() : false;
  const claimReady = finished && jackpot?.entered && !jackpot.claimed && roundEnded;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        padding: "0.4rem 0.9rem",
        borderRadius: 18,
        background: "rgba(0,0,0,.72)",
        color: "white",
        fontFamily: "monospace",
        fontSize: "0.8rem",
        maxWidth: "94vw",
        textAlign: "center",
        ...style,
      }}
    >
      <span>
        🎰 Megapot{" "}
        {round ? `${megapotPotLabel(round)} · draws in ${formatCountdown(round.endsAt)}` : "loading…"}
      </span>
      {jackpot?.entered && (
        <span style={{ opacity: 0.75 }}>· table ticket bought ({jackpot.ticketCount}, sponsored — free for players)</span>
      )}
      {jackpot?.entered && !jackpot.claimed && finished && (
        <button
          className="glossy-button glossy-button-blue"
          style={{ padding: "0.2rem 0.7rem" }}
          disabled={busy || !claimReady}
          title={claimReady ? undefined : "Waiting for the Megapot drawing to settle"}
          onClick={onClaim}
        >
          {claimReady ? "Claim jackpot" : `Claim opens in ${formatCountdown(round?.endsAt || new Date().toISOString())}`}
        </button>
      )}
      {jackpot?.claimed && <span style={{ opacity: 0.75 }}>· claimed</span>}
    </div>
  );
}

/** Compact pot pill — sized to its own content, meant to sit inline beside
 *  other header buttons rather than floating absolutely. */
function MegapotPotButton({ round, onClick }: { round: MegapotRound | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "fit-content",
        height: 28,
        padding: "0 12px",
        borderRadius: 18,
        background: "rgba(0,0,0,.72)",
        color: "white",
        fontFamily: "monospace",
        fontSize: "0.8rem",
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      🎰 {megapotPotLabel(round)}
    </button>
  );
}

function StatusPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(92vw, 620px)", padding: "2rem", borderRadius: 28, border: "2px solid #9CA34C", background: "rgba(76,55,28,.94)", color: "white", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.45)" }}>
        <h1 style={{ marginBottom: 12, fontSize: "1.75rem", fontWeight: 800 }}>{title}</h1>
        {detail && <p style={{ marginBottom: children ? 24 : 0, opacity: 0.8, overflowWrap: "anywhere" }}>{detail}</p>}
        {children && <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>{children}</div>}
      </div>
    </div>
  );
}
