# client — Zunno × Inco (frontend)

Reuse the existing React client from **Khel-fun/ZunnoGame** (`main-v-02` → `/client`) and add the confidential layer via **`@inco/lightning-js`**.

## What's here
- `incoDeckClient.ts` — the Inco bridge: `getZap()`, `attestCard()` (user-decrypt a handle → value + covalidator sigs), `peekMyHand()`, and `decodeUnoCard()` (mirrors `contracts/src/UnoCards.sol` so the UI can render cards). **WIP:** confirm SDK method names against docs.inco.org (js-sdk → attestations).

## Port steps
1. Copy `ZunnoGame/client` here (board, lobby, wallet connect). Keep Socket.io for snappy turns.
2. `npm i @inco/lightning-js viem`.
3. Wire the confidential flow (see below).

## Confidential game flow (frontend ↔ ZunnoInco.sol)
1. **See your hand:** read handles via `getMyHandHandles(gameId)` → `peekMyHand(zap, wallet, handles)` → render `card.label`. Only you can decrypt your handles (you're `allow`ed).
2. **Open the pile:** read `getOpeningHandle()`, `attestCard(...)` it, then call `commitOpening(gameId, value, signatures, chosenColor)`.
3. **Play:** pick a card you peeked → submit `playCard(gameId, handIndex, value, signatures, chosenColor)` using that card's `attested` value + sigs. The contract's `_verifyValue` binds value→handle (no lying), then enforces UNO legality.
4. **Draw:** `drawCard(gameId)` (adds a secret card; peek it client-side).
5. **UX:** show a brief "revealing…" state around attestation calls (covalidator round-trip).

## Notes
- Target **Base Sepolia** (`supportedChains.baseSepolia`); use `Lightning.baseMainnet()` for mainnet.
- The server (`/server`) no longer holds cards — confidentiality is enforced on-chain by Inco + covalidators.
