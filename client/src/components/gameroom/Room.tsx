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

  // ponytail: computer mode stays local until an on-chain bot wallet exists.
  if (searchParams.get("mode") === "computer") {
    return <Game room={id} currentUser="Player 1" isComputerMode playerCount={2} onZKStateChange={undefined} />;
  }

  return <ConfidentialGame gameId={gameId} />;
}
