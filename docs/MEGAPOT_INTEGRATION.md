# Megapot integration — Zunno × Inco

Every Zunno table buys a **Megapot** daily-lottery ticket (USDC). The confidential
UNO game is unchanged; the jackpot is an additive USDC side-entry so we didn't have
to convert the ETH escrow. This qualifies the build for the **Megapot track**.

## How it works (Option A — USDC side-entry)
1. `startGame(gameId)` shuffles the deck as before, then best-effort calls
   `enterJackpot(gameId)` (wrapped in `try/catch` — a jackpot failure can never
   block the game).
2. `enterJackpot` → `_enterJackpot` approves USDC and calls
   `JackpotRandomTicketBuyer.buyTickets(1, address(this), referrers, split, source)`.
   The ticket (ERC-721) is **owned by the contract**; the game's players are stored.
3. The **operator wallet is the Megapot `referrer`** → earns purchase
   fees + a share of any win. Set it via `setJackpotReferrers([...])`.
4. After the daily drawing settles, `claimGameJackpot(gameId)` claims the USDC and
   **splits it equally** across that game's players (remainder to the last player).

The ETH escrow still pays out in full to the game winner in `_finish` — jackpot and
game pot are independent.

## Base Sepolia (chain 84532) addresses — defaults baked into `MegapotJackpot`
| Contract | Address |
|---|---|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Jackpot | `0x465dA3c859f193A3807386387bEE941B2A4c3279` |
| JackpotRandomTicketBuyer | `0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746` |
| Ticket price | `ticketPrice()` (~`1_000_000` = 1 USDC) |
| Source tag | `keccak256("zunno-inco")` |

`setMegapotConfig(usdc, jackpot, buyer)` repoints to a different deployment if
ever needed — everything for this project stays on Base Sepolia by design, no
mainnet deploy planned. (Base mainnet, chain 8453, addresses were looked up and
verified on-chain anyway in case that changes later: USDC
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Jackpot
`0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2`, JackpotRandomTicketBuyer
`0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd` — source: `https://llms.megapot.io/`.)

## Deployment & funding status (Base Sepolia)
Live contract: `0x82b2cCe9A52C7e56838a5C46833067F9Eb006911` (matches
`client/.env` / `docs/INCO_INTEGRATION.md`). Deployed 2026-08-14 to add
`joinAsBot`/`botOperator` (on-chain "Play with Computer") — trusted forwarder
`0x464F256Dc30057Ed080FCd38f5dF6B6f745F9f26`.
- **megapotAdmin** is `0x030e255635dfE3eB318943B726870535BFe6B9FB` (same key
  as prior deployments).
- **botOperator** is a dedicated bot key (see `server/.env` `BOT_PRIVATE_KEY`)
  — the only address allowed to call `joinAsBot`.
- Funded with **0.021145 USDC** (all that was left in the deployer wallet —
  the prior 20 USDC funding is stranded on the old contract below) and 10
  shuffle fees via the deploy script. Top up via `fundJackpot(amount)` /
  `fundFees()` — both permissionless, callable by anyone.

Four earlier deployments are now stale/abandoned — **do not fund or
reference them**:
- `0x1174a52267ae81cF0A5b565F272a98F2aB972164` — prior live contract (had
  meta-tx support, no bot support). Holds **20 USDC that cannot be
  recovered**: `MegapotJackpot` has no withdraw/rescue function, only
  `fundJackpot` (one-way in).
- `0x1138A6984cCBAa8b09a10fd24753c0897F65fB70` — holds **18 USDC**, same
  one-way-in reason.
- `0x8Be448437C4f1789230d01f75C64A8B9b980081E` — holds **21.98 USDC**,
  same one-way-in reason.
- `0xCe647b1EAc4866470b43124B988bEac3EF0562Ef` — redundant deploy from an
  earlier false alarm (chasing a stale-docs address that turned out fine).
  Has the Megapot code but 0 USDC, never wired into anything.

## Tests
`contracts/test/MegapotJackpot.t.sol` (+ `test/mocks/MegapotMocks.sol`) runs without
the Inco harness — a `MegapotHarness` exposes `_enterJackpot`. Covered:
skip-when-unfunded, buy with referral split summing to `1e18`, idempotent entry,
equal + odd-remainder win split, losing-claim revert stays retryable, double-claim
blocked, admin-only config.

`contracts/test/MegapotFork.t.sol` forks Base Sepolia (needs `BASE_SEPOLIA_RPC` in
`.env`; no-ops if unset) and checks the hardcoded default addresses are live
contracts and `ticketPrice()`/`decimals()` respond sanely — catches a stale/wrong
default before it silently no-ops `enterJackpot` on a real deploy.

```bash
cd contracts && forge test
```

## Frontend
Done — `ConfidentialGame.tsx`'s `JackpotBanner` shows the live pot from the Megapot
Data API (`https://api.megapot.io/v1/rounds/active`), this table's ticket via
`getGameJackpot(gameId)`, and a claim button wired to `claimGameJackpot(gameId)`.

## Remaining work
- **Top up funding eventually**: the live contract holds ~1.98 USDC (good for
  ~1–2 more ticket buys). Keep an eye on the balance and `approve` +
  `fundJackpot(amount)` again from the `megapotAdmin` key before it runs dry —
  until then entries no-op silently (`JackpotSkipped`), never blocking the game.
- **Live draw**: nothing exercises an actual settled/winning draw end-to-end —
  that only happens by entering a real round and waiting for Megapot's daily
  drawing. `MegapotFork.t.sol` verifies the integration points are live and
  correct, which is as far as this can be checked ahead of time.

## Notes / risks
- **Async draw**: the winner is known at the next daily drawing, not instantly — the
  demo shows *ticket purchased + odds + claim flow*, not a live hit inside the demo.
- `claimGameJackpot` reverts for a losing/unsettled ticket (by design) and leaves the
  game retryable; gate the claim button on the off-chain tier check.
- Settlement (`runJackpot`) is triggered by Megapot/keepers and needs ETH for Pyth —
  not our responsibility.
