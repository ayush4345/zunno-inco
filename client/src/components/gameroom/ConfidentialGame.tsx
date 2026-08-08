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
  decodeUnoCard,
  getZap,
  peekMyHand,
  type AttestedValue,
  type ConnectedWalletClient,
  type UnoCard,
} from "../../../incoDeckClient";
import { unoGameABI } from "@/constants/unogameabi";
import { getContractAddress } from "@/config/networks";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import GameBackground from "./GameBackground";
import GameScreen from "./GameScreen";
import ColourDialog from "./colourDialog";

const CHAIN_ID = 84532;
const PHASE = { waiting: 0, opening: 1, active: 2, finished: 3 } as const;
const COLOR_INDEX: Record<string, number> = { R: 0, Y: 1, G: 2, B: 3 };
const COLOR_CODE = ["R", "Y", "G", "B"] as const;

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

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

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
  const contractAddress = getContractAddress(CHAIN_ID) as Address;

  const [game, setGame] = useState<ChainGame | null>(null);
  const [handles, setHandles] = useState<Hex[]>([]);
  const [hand, setHand] = useState<PeekedCard[]>([]);
  const [needsDecrypt, setNeedsDecrypt] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingColor, setPendingColor] = useState<PendingColor | null>(null);
  const cardCache = useRef(new Map<string, PeekedCard>());

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
      const [state, sizes, deal] = await Promise.all([
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
      ]);

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
        const revealed = await peekMyHand(
          zap,
          walletClient as ConnectedWalletClient,
          missing,
        );
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
    async (label: string, data: Hex, decryptAfter = false) => {
      if (!address || !publicClient || !walletClient?.account) {
        throw new Error("Connect your browser wallet first");
      }
      if (chain?.id !== CHAIN_ID) throw new Error("Switch your wallet to Base Sepolia");

      setBusy(`${label}: checking move…`);
      setError(null);
      try {
        await publicClient.call({ account: address, to: contractAddress, data });
        setBusy(`${label}: confirm in wallet…`);
        const hash = await sendTransactionAsync({ to: contractAddress, data, chainId: CHAIN_ID });
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

  useEffect(() => {
    cardCache.current.clear();
    setHandles([]);
    setHand([]);
    setNeedsDecrypt(false);
  }, [address, gameId]);

  useEffect(() => {
    void getZap().catch(() => undefined);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const startGame = async () => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "startGame",
      args: [gameId],
    });
    await transact("Start game", data);
  };

  const dealCards = async () => {
    const data = encodeFunctionData({
      abi: unoGameABI,
      functionName: "dealCards",
      args: [gameId, 4],
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
    await transact("Play card", data);
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
    await transact("Draw card", data, true);
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
      <div style={{ position: "relative", zIndex: 20 }}>{content}</div>
      <Toaster />
    </div>
  );

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
        <button
          className="glossy-button glossy-button-blue"
          disabled={!!busy}
          onClick={() => void (game.openingReady ? revealOpening() : dealCards())}
        >
          {busy || (game.openingReady ? "Reveal opening card" : `Deal next ${Math.min(4, remaining)} cards`)}
        </button>
      </StatusPanel>,
    );
  }

  if (game.phase === PHASE.finished) {
    const won = game.winner.toLowerCase() === address.toLowerCase();
    return shell(
      <StatusPanel
        title={won ? "You won!" : `${shortAddress(game.winner)} won`}
        detail="The contract settled the pot automatically."
      />,
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
          onUnoClicked={() => undefined}
          turnTimerEnabled={false}
          actionsDisabled={!!busy || needsDecrypt || playerIndex < 0}
        />
      </div>

      <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 80, padding: "0.55rem 1rem", borderRadius: 999, background: "rgba(0,0,0,.72)", color: "white", fontFamily: "monospace", textAlign: "center" }}>
        {busy || (turn === currentUser ? "Your turn" : `${shortAddress(game.currentPlayer)} is playing`)}
        <span style={{ opacity: 0.65 }}> · {game.direction === 1 ? "clockwise" : "counter-clockwise"}</span>
      </div>

      {needsDecrypt && !busy && playerIndex >= 0 && (
        <button
          className="glossy-button glossy-button-blue"
          style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 90 }}
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

function StatusPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(92vw, 620px)", padding: "2rem", borderRadius: 28, border: "2px solid #9CA34C", background: "rgba(76,55,28,.94)", color: "white", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.45)" }}>
        <h1 style={{ marginBottom: 12, fontSize: "1.75rem", fontWeight: 800 }}>{title}</h1>
        <p style={{ marginBottom: children ? 24 : 0, opacity: 0.8, overflowWrap: "anywhere" }}>{detail}</p>
        {children && <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>{children}</div>}
      </div>
    </div>
  );
}
