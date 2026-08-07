# Zunno × Inco — Confidential UNO on FHE

**Zunno**, rebuilt so your **hand is encrypted on-chain**. Cards are dealt as encrypted state via [Inco Lightning](https://docs.inco.org) (FHE) on **Base** — no server holds your cards, and only the cards you *play* become public. Built for the **Inco × Megapot Summer Game Jam 2026**.

> Status: 🚧 WIP scaffold. Contract code in `contracts/src/ZunnoInco.sol` is a **design skeleton** — not yet compiled or audited. Validate all Inco API usage against https://docs.inco.org before relying on it.

## Why this matters
The original [Zunno](https://zunno.xyz) proves the **shuffle** is fair (Chainlink VRF + SP1 + ZKVerify) but still relies on the **server to distribute cards**. Inco closes that gap: **hands live as encrypted values on-chain**, so nobody — not even us — can see your cards until you play them.

- **Confidential hands** — each player's cards are `euint` handles, readable only by their owner (`e.allow`).
- **Verifiably fair deal** — encrypted randomness via `e.randEuint8()` (no trusted dealer).
- **Trustless reveal** — a card is decrypted (played / showdown) only via covalidator **attestation**, verified on-chain.

## Architecture
```
client (React)  ──►  server (orchestration only, NO card custody)
     │                         │
     │  @inco/lightning-js     │
     ▼                         ▼
ZunnoInco.sol (Base) ──► Inco coprocessor + covalidators (FHE + threshold decryption)
     └── encrypted deck/hands · e.allow per player · attested reveal · escrow pot
```

## Monorepo
```
/contracts   → Foundry + Inco Lightning confidential UNO contract (NEW)
/client      → React frontend (reuse from Khel-fun/ZunnoGame @ main-v-02) + @inco/lightning-js
/server      → Rust backend (reuse from ZunnoGame) — role reduced to matchmaking/turns
/docs        → BUILD_PLAN.md (8-day plan, port map, submission checklist)
```

## Quickstart (contracts)
```bash
cd contracts
forge install
cp .env.example .env   # set BASE_SEPOLIA_RPC, PRIVATE_KEY
forge build
# deploy script TBD
```

## Links
- Jam: register https://taglg1ysk8z.typeform.com/to/q2REER5u · workshops https://luma.com/1e0zdrwi · TG https://t.me/summergamejam
- Inco docs: https://docs.inco.org/games/overview · Megapot: https://docs.megapot.io/
- Base reference (original): https://github.com/Khel-fun/ZunnoGame (branch `main-v-02`)
