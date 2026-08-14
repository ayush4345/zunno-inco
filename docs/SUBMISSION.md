# Zunno × Inco — Hackathon Submission

## One-line pitch*

UNO with your hand actually hidden — dealt and played as encrypted on-chain
state via Inco, with every table also a free entry into a live Megapot
jackpot.

## What does your game do?*

Zunno is a 2-player UNO card game played fully on-chain on Base, with each
player's hand kept genuinely secret via Inco's confidential compute — not
just off-chain in a trusted server, but as encrypted state the contract
itself enforces rules against.

- A creator opens a table and funds an ETH pot; a second player joins and the
  creator starts the game.
- The deck is shuffled confidentially on-chain and dealt in batches; each
  player can only ever decrypt their own cards.
- Players take turns drawing or playing cards, with the contract verifying
  every claimed play against the encrypted hand before applying standard UNO
  rules (color/value matching, Draw Two, Skip, Reverse, Wild, Wild Draw Four).
- The first player to empty their hand wins and the ETH escrow pays out
  automatically on-chain — no dealer, no server-held cards, no way for either
  player (or us) to peek at an opponent's hand or rig the deck.
- Alongside the card game, every table also buys a Megapot lottery ticket, so
  playing a hand of Zunno doubles as an entry into a shared daily jackpot,
  claimable by that table's players if it hits.

## How does your game use Inco + Megapot in the core gameplay loop?

Zunno is UNO rebuilt so a player's hand is never known to anyone but them —
not even the server. Every core action in the turn loop is backed on-chain by
Inco Lightning, and every table also carries a Megapot side-bet, entered
automatically when the game starts.

**Inco — the deck and every hand are confidential on-chain state, not server state.**
- `startGame` shuffles the full deck as one confidential Inco `elist`
  (`e.shuffledRange`) — no one, including the contract deployer, controls or
  sees the order.
- `dealCards` draws from that encrypted deck and calls `e.allow(card, player)`,
  handing decrypt permission for each card handle to exactly one player's
  address. Opponents hold the same on-chain data but cannot decrypt it.
- On their turn, a player fetches their hand's opaque handles
  (`getMyHandHandles`) and decrypts them client-side via Inco's covalidators
  (`attestedDecryptWithVoucher`) — only their browser ever sees the plaintext.
- To play a card, the client submits the claimed value **plus covalidator
  signatures** back to `playCard`, which calls `e.verifyDecryption(handle,
  claimedValue, signatures)` on-chain. This cryptographically binds the claim
  to the exact stored handle, so a player cannot lie about what card they're
  playing or replay someone else's card. Only cards actually played ever
  become public.
- The opening card is the one exception: it's explicitly `e.reveal`'d so both
  players can see the starting color/value, same as physical UNO.
- `drawCard`/`playCard` — the two turn-actions gated by player identity — are
  also relayable through an ERC-2771 forwarder, so a move is one off-chain
  signature instead of a wallet popup per card. `_msgSender()` still resolves
  to the real player under the meta-tx, so Inco's `e.allow` permissions and
  hand storage stay correctly scoped to them rather than the relayer.

**Megapot — every table is also a jackpot ticket, orthogonal to who wins the hand.**
- When `startGame` runs, it best-effort calls `enterJackpot(gameId)`, which
  buys one USDC ticket via Megapot's `JackpotRandomTicketBuyer`, split with
  our operator wallet as `referrer`. A jackpot failure is caught and never
  blocks the confidential game from starting.
- The UNO game's ETH escrow pot and the Megapot USDC ticket are fully
  independent systems — winning the hand pays the escrow via `_finish`;
  winning the daily Megapot drawing is claimed separately via
  `claimGameJackpot(gameId)`, which splits any USDC win equally across that
  table's players.
- The frontend's `JackpotBanner` shows the live pot pulled from Megapot's Data
  API alongside this table's ticket status, so the jackpot is visible in the
  same UI as the card game, not a bolted-on separate flow.

In short: Inco makes the *card game itself* trustless (fair shuffle, private
hands, unforgeable plays), and Megapot turns *every game played* into a free
shot at a shared daily jackpot — both wired into the same `startGame` →
`dealCards`/`drawCard`/`playCard` → `_finish` loop rather than as separate
demos.

**Live deployment (Base Sepolia):** [`0x1174a52267ae81cF0A5b565F272a98F2aB972164`](https://sepolia.basescan.org/address/0x1174a52267ae81cF0A5b565F272a98F2aB972164)

See [`INCO_INTEGRATION.md`](./INCO_INTEGRATION.md) and
[`MEGAPOT_INTEGRATION.md`](./MEGAPOT_INTEGRATION.md) for full technical detail.
