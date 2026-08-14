'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import { unoGameABI } from '@/constants/unogameabi';
import { getContractAddress } from '@/config/networks';
import { fetchMegapotTickets, megapotStatusFor, type MegapotStatus } from '@/lib/megapotTickets';

const CHAIN_ID = 84532;

// Deployment block of the current live ZunnoInco contract — bounds the
// PlayerJoined log scan so it isn't asking the RPC to search the whole
// chain. ponytail: hardcoded per-deploy; bump this if the contract is ever
// redeployed.
const CONTRACT_DEPLOY_BLOCK = 45_419_684n;

// Base Sepolia's public RPC (sepolia.base.org) caps eth_getLogs at a 10,000
// block range per call, so the deploy-block-to-latest scan has to be
// chunked instead of one open-ended request.
const LOG_CHUNK_SIZE = 9_000n;

type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

/** Splits [fromBlock, toBlock] into <=LOG_CHUNK_SIZE-wide ranges to stay under
 *  public RPCs' eth_getLogs block-range cap. */
async function getPlayerJoinedLogsChunked(
  client: PublicClient,
  { address, player, fromBlock, toBlock }: { address: `0x${string}`; player: `0x${string}`; fromBlock: bigint; toBlock: bigint },
) {
  const ranges: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = start + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : start + LOG_CHUNK_SIZE - 1n;
    ranges.push([start, end]);
  }
  const chunks = await Promise.all(
    ranges.map(([start, end]) =>
      client.getLogs({
        address,
        event: {
          type: 'event',
          name: 'PlayerJoined',
          inputs: [
            { name: 'gameId', type: 'uint256', indexed: true },
            { name: 'player', type: 'address', indexed: true },
          ],
        },
        args: { player },
        fromBlock: start,
        toBlock: end,
      }),
    ),
  );
  return chunks.flat();
}

const PHASE_LABEL = ['Waiting for players', 'Dealing', 'In progress', 'Finished'];
const PHASE_PILL_CLASS = [
  'bg-white/10 text-white/70',
  'bg-sky-500/15 text-sky-300',
  'bg-violet-500/15 text-violet-300',
  'bg-white/10 text-white/70',
];

const MEGAPOT_STATUS_LABEL: Record<MegapotStatus, string> = {
  'not-entered': '',
  pending: 'Pending draw',
  lost: 'No win',
  'won-unclaimed': 'Claim jackpot',
  'won-claimed': 'Jackpot claimed',
};
const MEGAPOT_STATUS_PILL_CLASS: Record<MegapotStatus, string> = {
  'not-entered': '',
  pending: 'bg-white/10 text-white/60',
  lost: 'bg-white/5 text-white/40',
  'won-unclaimed': 'bg-[#ff9000]/20 text-[#ff9000]',
  'won-claimed': 'bg-emerald-500/15 text-emerald-300',
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

interface GameSummary {
  gameId: bigint;
  phase: number;
  won: boolean;
  megapotStatus: MegapotStatus;
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
        const [createdIds, latestBlock, megapotTickets] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: unoGameABI,
            functionName: 'getGamesByCreator',
            args: [address],
          }),
          publicClient.getBlockNumber(),
          fetchMegapotTickets(contractAddress),
        ]);
        const ticketsById = new Map(megapotTickets.map((t) => [t.user_ticket_id, t]));

        const joinedLogs = await getPlayerJoinedLogsChunked(publicClient, {
          address: contractAddress,
          player: address,
          fromBlock: CONTRACT_DEPLOY_BLOCK,
          toBlock: latestBlock,
        });

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

            const [ticketIds, , entered] = jackpot;
            const megapotStatus: MegapotStatus =
              entered && ticketIds[0] !== undefined
                ? megapotStatusFor(ticketsById.get(ticketIds[0].toString()))
                : 'not-entered';

            return {
              gameId,
              phase: Number(state[6]),
              won: state[9].toLowerCase() === address.toLowerCase(),
              megapotStatus,
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
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">My Games</h2>
        {games && games.length > 0 && (
          <span className="text-sm text-white/40">{games.length} total</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>
      )}

      {!error && games === null && (
        <ul className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[52px] rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </ul>
      )}

      {games?.length === 0 && (
        <div className="text-center py-14 text-white/50">
          <p>You haven&apos;t played a game yet.</p>
        </div>
      )}

      {games && games.length > 0 && (
        <ul className="flex flex-col gap-2">
          {games.map((g) => {
            const jackpotLabel = MEGAPOT_STATUS_LABEL[g.megapotStatus];
            return (
              <li key={g.gameId.toString()}>
                <Link
                  href={`/game/${g.gameId}`}
                  className="group flex items-center justify-between gap-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] px-4 py-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-white/90 shrink-0">#{g.gameId.toString()}</span>
                    <Pill className={PHASE_PILL_CLASS[g.phase] || 'bg-white/10 text-white/70'}>
                      {PHASE_LABEL[g.phase] || 'Unknown'}
                    </Pill>
                    {g.phase === 3 && g.won && (
                      <Pill className="bg-emerald-500/15 text-emerald-300">You won</Pill>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {jackpotLabel && (
                      <Pill className={MEGAPOT_STATUS_PILL_CLASS[g.megapotStatus]}>{jackpotLabel}</Pill>
                    )}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-white/25 group-hover:text-white/50 transition-colors"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
