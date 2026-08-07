# contracts — Zunno × Inco

Foundry project for **confidential UNO** built on Inco's **ConfidentialDeck** template.

> Inco is **confidential compute for the EVM** (per Inco: *not FHE and not zk*). "Secret" = the value is decrypted by Inco; "provably fair" = a covalidator **attestation**. Hands stay secret on-chain; only played/showdown cards become public.

> ⚠️ WIP: plaintext UNO logic (`UnoCards.sol`, turns, legality) is complete and unit-tested. The confidential moves in `ZunnoInco.sol` depend on the ConfidentialDeck kit (below) — confirm method names/returns against the template before deploying.

## Files
- `src/UnoCards.sol` — pure card codec (108-card layout) + `isPlayable` legality. Fully testable.
- `src/ZunnoInco.sol` — game contract; inherits `ConfidentialDeck`, uses the five moves (`_newShuffledDeck`, `_dealTo`, `_draw`, `_revealCard`/`_dealFaceUp`, `_verifyValue`).
- `script/Deploy.s.sol` — Base Sepolia deploy.
- `test/UnoCards.t.sol` — pure-logic unit tests (`forge test`).

## Setup
```bash
forge install foundry-rs/forge-std

# Vendor the ConfidentialDeck kit into src/kit/ (import is "./kit/ConfidentialDeck.sol")
# from https://github.com/Inco-fhevm/confidential-deck-template
# and install the Inco Lightning solidity lib, then fix remappings.txt.

cp .env.example .env    # set BASE_SEPOLIA_RPC, PRIVATE_KEY
forge build
forge test              # runs UnoCards logic tests (no Inco needed)
```

## Deploy (Base Sepolia)
```bash
forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast
```

## The five confidential moves (from Inco ConfidentialDeck)
| Move | Kit call | Use in Zunno |
|---|---|---|
| Shuffle | `_newShuffledDeck(108)` | new round |
| Deal (private) | `_dealTo(player)` | secret 7-card hands + draws |
| Reveal (public) | `_revealCard` / `_dealFaceUp` | open the discard pile |
| Settle | `_verifyValue(card, value, sigs)` | validate a played card trustlessly |
