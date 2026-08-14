"use client";

import { useParams, useSearchParams } from "next/navigation";
import ConfidentialGame from "./ConfidentialGame";
import Game from "./Game";
import CenterInfo from "./CenterInfo";

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  let gameId: bigint;
  try {
    gameId = BigInt(id);
  } catch {
    return <CenterInfo msg="Invalid game ID" />;
  }

  // "Play with Computer" now creates a real on-chain bot table (see
  // play/page.tsx's startComputerGame + server/bot/) and never sets this
  // query param. Kept as a manual/debug fallback to the local-only engine.
  if (searchParams.get("mode") === "computer") {
    return <Game room={id} currentUser="Player 1" isComputerMode playerCount={2} onZKStateChange={undefined} />;
  }

  return <ConfidentialGame gameId={gameId} />;
}
