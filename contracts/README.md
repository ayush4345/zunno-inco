# contracts — Zunno × Inco

Foundry project for **confidential UNO** built on Inco's **ConfidentialDeck** kit.

> Inco is **confidential compute for the EVM** (per Inco: *not FHE and not zk*). "Secret" = decrypted by Inco; "provably fair" = a covalidator **attestation**. Hands stay secret on-chain; a card's value enters on-chain state only when someone submits an attestation.

> ⚠️ WIP: not audited. Plaintext UNO logic (`UnoCards.sol`) is unit-tested.

## Files
- `src/kit/ConfidentialDeck.sol` — **vendored** Inco kit (MIT): `deckFee`, `_newShuffledDeck`, `_draw`, `_dealTo`, `_revealCard`, `_dealFaceUp`, `_verifyValue`.
- `src/UnoCards.sol` — pure card codec (108-card layout) + `isPlayable` legality. Fully testable.
- `src/ZunnoInco.sol` — the game: shuffle → secret `_dealTo` hands → `commitOpening` (attested) → `playCard` (attested + legality) → action cards / turns → escrow payout.
- `script/Deploy.s.sol` — Base Sepolia deploy.
- `test/UnoCards.t.sol` — pure-logic unit tests (`forge test`).

## Confidential flow (important)
1. `startGame` creates an independent encrypted deck for that `gameId`; batched calls deal 4 secret cards each via `_dealTo` and flip that game's opener with `_dealFaceUp`.
2. Frontend reads handles (`getMyHandHandles(gameId)`, `getOpeningHandle(gameId)`) and **user-decrypts** the player's own cards client-side.
3. `commitOpening(value, sigs)` submits the opener's covalidator attestation to set the public top card.
4. `playCard(handIndex, value, sigs, chosenColor)` submits the played card's attestation; `_verifyValue` binds value→handle (no lying), then `UnoCards.isPlayable` enforces the rules.
5. Contract must hold ETH for shuffle fees — call `fundFees()` (or send ETH) before `startGame`.

## Setup
```bash
npm install
cp .env.example .env    # BASE_SEPOLIA_RPC, PRIVATE_KEY
forge build
forge test
```

## Deploy (Base Sepolia)
```bash
forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast
```
