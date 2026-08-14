// Base Sepolia only ever enters Megapot's *testnet* rounds — the production
// host (api.megapot.io) serves the real mainnet lottery, an entirely
// different pot/schedule unrelated to what our contract's tickets are
// actually in.
const MEGAPOT_TESTNET_API = 'https://api-testnet.megapot.io/v1';

export interface MegapotTicket {
  user_ticket_id: string;
  round_id: string;
  matched_normals: number | null;
  winnings_amount: { amount: string; decimals: number } | null;
  claimed: boolean;
}

/** Every ticket Megapot has recorded for this wallet (our contract — tickets
 *  are bought in the contract's name, not the player's), paginated. */
export async function fetchMegapotTickets(wallet: string): Promise<MegapotTicket[]> {
  const tickets: MegapotTicket[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL(`${MEGAPOT_TESTNET_API}/wallets/${wallet}/tickets`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString());
    if (!res.ok) break;
    const body: { data: MegapotTicket[]; next_cursor: string | null; has_more: boolean } = await res.json();
    tickets.push(...body.data);
    cursor = body.has_more ? body.next_cursor : null;
  } while (cursor);
  return tickets;
}

export type MegapotStatus = 'not-entered' | 'pending' | 'lost' | 'won-unclaimed' | 'won-claimed';

export function megapotStatusFor(ticket: MegapotTicket | undefined): MegapotStatus {
  if (!ticket || ticket.matched_normals === null) return 'pending';
  if (ticket.winnings_amount && ticket.winnings_amount.amount !== '0') {
    return ticket.claimed ? 'won-claimed' : 'won-unclaimed';
  }
  return 'lost';
}
