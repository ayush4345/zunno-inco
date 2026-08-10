# Zunno × Inco — Remaining To-Do (Game Jam, due Aug 14)

## Status snapshot

**Repo:** ayush4345/zunno-inco · **Branches:** `feat/confidential-uno` (game, code-complete) → `feat/megapot-jackpot` (jackpot module + tests + docs, just pushed).

**Done**
- Confidential UNO contract on the real Inco ConfidentialDeck kit (per-game encrypted decks, batched dealing, attested opening/play).
- Frontend confidential flow wired (`ConfidentialGame.tsx`, `incoDeckClient.ts` attested decrypt fixed by the team, reachable via the game route).
- Megapot module (Option A: USDC side-entry) — `MegapotJackpot.sol`, `enterJackpot` hooked into `startGame` (best-effort), `claimGameJackpot`, referrer = operator wallet, unit tests + mocks, integration doc.

**Not done yet** → the checklists below.

## 1. Contracts — Inco

- [x] `forge build` green (remapping was already correct — `@inco/=node_modules/@inco/`; that line in this doc was stale).
- [x] `forge test` green — `ZunnoInco.t.sol` (7 tests) + `UnoCards.t.sol` (10 tests), all passing.
- [x] Deploy `ZunnoInco` to Base Sepolia (`script/Deploy.s.sol`) → **`0x8Be448437C4f1789230d01f75C64A8B9b980081E`**.
- [x] `fundFees()` with ETH — done automatically by the deploy script (funded 10 shuffle fees, 0.00216 ETH).
- [x] (nice) Verify on Basescan — [source verified](https://sepolia.basescan.org/address/0x8be448437c4f1789230d01f75c64a8b9b980081e).

## 2. Contracts — Megapot

- [x] `forge test --match-path test/MegapotJackpot.t.sol -vv` green locally — was failing on 3 claim tests (`MockJackpot.claimWinnings` transferred USDC out of its own balance but `setPrize` never funded that balance; fixed in `test/mocks/MegapotMocks.sol`, contract code was fine).
- [x] `setJackpotReferrers([operator wallet])` — set to `0x030e...B9FB` on-chain (was already the default, now explicit).
- [x] Get Base Sepolia testnet USDC → `approve` + `fundJackpot(amount)` — deployer wallet was funded with 20 USDC by the team; approved + funded the contract with 2 USDC (~200 tickets worth).
- [x] Live testnet check: one real `startGame` → confirm `JackpotEntered`, a ticket NFT owned by the contract, referrer recorded — **done, but surfaced a real bug (fixed, see below).**
- [x] Confirm testnet drawings are active + `ticketPrice()` — round `139` is `"active"`, ends `2026-08-10T17:00:00.000Z`, pot ≈ $1.1M USDC (`GET https://api.megapot.io/v1/rounds/active`, no auth needed for anonymous reads); `ticketPrice()` on-chain = `10000` (0.01 USDC, 6 decimals).

**Bug found + fixed during the live test:** `startGame`'s internal `try this.enterJackpot(gameId) {} catch {}` silently skipped the Megapot purchase — no `JackpotEntered` *or* `JackpotSkipped` event fired. Root cause: buying a Megapot ticket costs ~1.5M gas, and `eth_estimateGas` (what any wallet uses to size the transaction) picks the *lowest* gas that lets the outer `startGame` call succeed — which is exactly the path where the inner try-call starves under EIP-150's 63/64 rule and reverts, silently caught. Confirmed live: `startGame(1)` with auto-estimated gas entered nothing; calling `enterJackpot(1)` right after (fresh 1.5M gas budget) bought the ticket fine; `startGame(2)` with an explicit 5,000,000 gas limit bought the ticket in the same transaction (event confirmed on-chain, topic0 matches `keccak256("JackpotEntered(uint256,uint256)")`). **Fix:** `client/src/components/gameroom/ConfidentialGame.tsx` now sends the `startGame` transaction with an explicit `gas: 4_000_000n` instead of relying on auto-estimation — every other transaction still auto-estimates.

## 3. Frontend

- [x] Point `NEXT_PUBLIC_BASE_SEPOLIA_CONTRACT_ADDRESS` at the newly deployed ZunnoInco — updated in `client/.env` (gitignored, not committed).
- [x] Add Megapot entries to the ABI (`unogameabi.ts`): `enterJackpot`, `claimGameJackpot`, `getGameJackpot`, events `JackpotEntered`/`JackpotSkipped`/`JackpotClaimed`.
- [x] Jackpot banner: current pot + countdown via Megapot Data API (`api.megapot.io/v1/rounds/active`), in `ConfidentialGame.tsx`.
- [x] This-table ticket status from `getGameJackpot(gameId)` — folded into the same banner.
- [x] Claim button → `claimGameJackpot`, shown once the game is finished and a ticket was entered.
- [ ] Full 2-wallet E2E on Base Sepolia: create → join → start → deal batches → commitOpening → play/draw with attested values → finish → payout — needs a live browser session with two wallets, not something to run headlessly.

## 4. Submission (hard deadline Aug 14)

- [ ] Register via the Game Jam Typeform.
- [ ] Host the demo (e.g. Vercel) + document contract addresses.
- [ ] 5-min demo video: show secret hands (only owner decrypts) + jackpot entry/claim.
- [ ] "How we use Inco" write-up (confidential hands via ConfidentialDeck + covalidator attestations).
- [ ] "How we use Megapot" write-up (per-game USDC ticket, referrer revenue) — draft exists in `docs/MEGAPOT_INTEGRATION.md`.
- [ ] README polish.
- [ ] Submit to BOTH tracks (Inco privacy + Megapot).

## 5. Ops / risks

- [x] ETH for deck fees — funded at deploy (10 shuffle fees).
- [x] USDC for the jackpot — contract funded with 2 USDC (~200 tickets); deployer still holds 18 USDC spare.
- [x] Reliable Base Sepolia RPC in env — `sepolia.base.org` in `contracts/.env`.
- **Async draw**: winner known at the next daily drawing, not instantly — demo shows *ticket bought + odds + claim flow*, not a live hit.
- **PR**: open `feat/megapot-jackpot` → `feat/confidential-uno` once tests pass, then both → `main` at the end.
