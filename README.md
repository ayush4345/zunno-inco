# Zunno × Inco — Confidential UNO on Inco

**Zunno** is UNO built so your **hand is encrypted on-chain**. Cards are dealt as encrypted state via [Inco Lightning](https://docs.inco.org), Inco's TEE-based confidential compute layer on **Base** — no server holds your cards, and only the cards you *play* become public. Built for the **Inco × Megapot Summer Game Jam 2026**.

> Status: 🚧 The contract prototype builds and tests, but is not audited. The client/server integration is still WIP.

## Why this matters
Card games need a fair shuffle and a way to keep each player's hand private — normally that means trusting a server to hold and distribute the cards. Inco removes that trust requirement: **hands live as encrypted values on-chain**, so nobody — not even us — can see your cards until you play them.

- **Confidential hands** — each player's cards are `euint` handles, readable only by their owner (`e.allow`).
- **Verifiably fair deal** — encrypted randomness via `e.randEuint8()` (no trusted dealer).
- **Trustless reveal** — a card is decrypted (played / showdown) only via covalidator **attestation**, verified on-chain.

## What does it do?
Zunno is a 2-player UNO card game played fully on-chain on Base, with each
player's hand kept genuinely secret via Inco's confidential compute.

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
- Every table also buys a **Megapot** lottery ticket, so playing a hand of
  Zunno doubles as an entry into a shared daily jackpot, claimable by that
  table's players if it hits.

## How Inco + Megapot power the core loop
- **Inco** — `startGame` shuffles the deck as one confidential `elist`;
  `dealCards` hands each player `e.allow`'d decrypt access to only their own
  card handles. To play, a player submits their claimed card value plus
  covalidator signatures, and `playCard` calls `e.verifyDecryption` on-chain
  to bind that claim to the real stored handle — so no one can lie about or
  swap a card. `drawCard`/`playCard` are relayable through an ERC-2771
  forwarder (one off-chain signature instead of a wallet popup per move),
  while `_msgSender()` still resolves to the real player so hand permissions
  stay correctly scoped.
- **Megapot** — `startGame` also best-effort buys a USDC jackpot ticket via
  `JackpotRandomTicketBuyer` (never blocks the game if it fails). The ETH
  game pot and the Megapot USDC ticket are independent: winning the hand pays
  the escrow via `_finish`; winning the daily Megapot drawing is claimed
  separately via `claimGameJackpot`, split equally across that table's
  players.

See [`docs/INCO_INTEGRATION.md`](docs/INCO_INTEGRATION.md) and
[`docs/MEGAPOT_INTEGRATION.md`](docs/MEGAPOT_INTEGRATION.md) for full technical detail.

## Deployed contracts (Base Sepolia, chain 84532)
| Contract | Address |
|---|---|
| `ZunnoInco` (game + Megapot) | [`0x1174a52267ae81cF0A5b565F272a98F2aB972164`](https://sepolia.basescan.org/address/0x1174a52267ae81cF0A5b565F272a98F2aB972164) |
| `ERC2771Forwarder` (meta-tx relayer) | [`0x9534B95CF466ce81cf5C6E256b4554F48A7e1E1d`](https://sepolia.basescan.org/address/0x9534B95CF466ce81cf5C6E256b4554F48A7e1E1d) |
| Megapot USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |
| Megapot Jackpot | [`0x465dA3c859f193A3807386387bEE941B2A4c3279`](https://sepolia.basescan.org/address/0x465dA3c859f193A3807386387bEE941B2A4c3279) |
| Megapot `JackpotRandomTicketBuyer` | [`0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746`](https://sepolia.basescan.org/address/0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746) |

No mainnet deployment — this build stays on Base Sepolia by design.

## Architecture
```
client (React)  ──►  server (orchestration only, NO card custody)
     │                         │
     │  @inco/lightning-js     │
     ▼                         ▼
ZunnoInco.sol (Base) ──► Inco TEE executor + covalidator attestations
     └── encrypted deck/hands · e.allow per player · attested reveal · escrow pot
```

## Monorepo
```
/contracts   → Foundry + Inco Lightning confidential UNO contract
/client      → Next.js/React frontend + @inco/lightning-js
/server      → Node.js backend — matchmaking/turns orchestration, no card custody
/docs        → INCO_INTEGRATION.md, MEGAPOT_INTEGRATION.md
```

## Quickstart (contracts)
```bash
cd contracts
npm install
cp .env.example .env   # set BASE_SEPOLIA_RPC, PRIVATE_KEY
forge build
forge test
forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast
```

## Links
- Jam: register https://taglg1ysk8z.typeform.com/to/q2REER5u · workshops https://luma.com/1e0zdrwi · TG https://t.me/summergamejam
- Inco docs: https://docs.inco.org/games/overview · Megapot: https://docs.megapot.io/
