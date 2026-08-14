'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import { unoGameABI } from '@/constants/unogameabi';
import { getContractAddress } from '@/config/networks';

const CHAIN_ID = 84532;

// Deployment block of the current live ZunnoInco contract — bounds the
// PlayerJoined log scan so it isn't asking the RPC to search the whole
// chain. ponytail: hardcoded per-deploy; bump this if the contract is ever
// redeployed, or switch to a paginated scan if the range grows large enough
// for public RPCs to start rejecting it.
const CONTRACT_DEPLOY_BLOCK = 45_419_684n;

const PHASE_LABEL = ['Waiting for players', 'Dealing', 'In progress', 'Finished'];

interface GameSummary {
  gameId: bigint;
  phase: number;
  won: boolean;
  jackpotEntered: boolean;
  jackpotClaimed: boolean;
}

export function MyGames() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !publicClient) {
      setGames(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const contractAddress = getContractAddress(CHAIN_ID) as `0x${string}`;
      if (!contractAddress) return;
      setError(null);

      try {
        const [createdIds, joinedLogs] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: unoGameABI,
            functionName: 'getGamesByCreator',
            args: [address],
          }),
          publicClient.getLogs({
            address: contractAddress,
            event: {
              type: 'event',
              name: 'PlayerJoined',
              inputs: [
                { name: 'gameId', type: 'uint256', indexed: true },
                { name: 'player', type: 'address', indexed: true },
              ],
            },
            args: { player: address },
            fromBlock: CONTRACT_DEPLOY_BLOCK,
            toBlock: 'latest',
          }),
        ]);

        const ids = new Set<bigint>(createdIds);
        for (const log of joinedLogs) {
          if (log.args.gameId !== undefined) ids.add(log.args.gameId);
        }

        const summaries = await Promise.all(
          [...ids].map(async (gameId): Promise<GameSummary> => {
            const [state, jackpot] = await Promise.all([
              publicClient.readContract({
                address: contractAddress,
                abi: unoGameABI,
                functionName: 'getGameState',
                args: [gameId],
              }),
              publicClient.readContract({
                address: contractAddress,
                abi: unoGameABI,
                functionName: 'getGameJackpot',
                args: [gameId],
              }),
            ]);
            return {
              gameId,
              phase: Number(state[6]),
              won: state[9].toLowerCase() === address.toLowerCase(),
              jackpotEntered: jackpot[2],
              jackpotClaimed: jackpot[3],
            };
          }),
        );

        if (!cancelled) {
          summaries.sort((a, b) => (b.gameId > a.gameId ? 1 : -1));
          setGames(summaries);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  if (!address) return null;

  return (
    <div className="bg-black/30 p-6 rounded-lg">
      <h2 className="text-xl font-semibold mb-4">My Games</h2>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!error && games === null && <p className="text-sm text-gray-300">Loading…</p>}
      {games?.length === 0 && <p className="text-sm text-gray-300">No games yet.</p>}
      {games && games.length > 0 && (
        <ul className="space-y-2">
          {games.map((g) => {
            const jackpotNote = g.jackpotClaimed
              ? 'Jackpot claimed'
              : g.jackpotEntered
                ? 'Jackpot ticket active'
                : null;
            return (
              <li key={g.gameId.toString()}>
                <Link
                  href={`/game/${g.gameId}`}
                  className="flex items-center justify-between bg-black/20 hover:bg-black/40 p-3 rounded-lg transition-colors"
                >
                  <span>Game #{g.gameId.toString()}</span>
                  <span className="text-sm text-gray-300 text-right">
                    {PHASE_LABEL[g.phase] || 'Unknown'}
                    {g.phase === 3 && (g.won ? ' · You won' : ' · Finished')}
                    {jackpotNote && (
                      <span className={g.jackpotClaimed ? undefined : 'text-[#ff9000] font-semibold'}>
                        {' '}
                        · {jackpotNote}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
