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

`setMegapotConfig(usdc, jackpot, buyer)` repoints to mainnet (8453) or new deployments.

## Base Mainnet (chain 8453) addresses — verified, not yet wired
Sourced from `https://llms.megapot.io/` and independently confirmed on-chain
(2026-08-12: `eth_getCode` shows deployed bytecode at all three via
`https://mainnet.base.org`; `USDC.decimals()==6`/`symbol()=="USDC"`,
`Jackpot.ticketPrice()==1_000_000`, matching the testnet price). `ZunnoInco`
itself has **not** been deployed to mainnet yet (only Base Sepolia — see
`client/.env.example`), so nothing needs wiring until that happens; once it is,
call `setMegapotConfig` with these:

| Contract | Address |
|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Jackpot | `0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2` |
| JackpotRandomTicketBuyer | `0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd` |

## Funding & operating
- The contract must hold **USDC** to buy tickets. Fund via `fundJackpot(amount)`
  (needs a prior USDC `approve` to the ZunnoInco contract). If unfunded, entry is
  skipped silently (emits `JackpotSkipped`) and the game proceeds normally.
- Get Base Sepolia testnet USDC from a faucet, send some to the deployer, then
  `approve` + `fundJackpot`.

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
- **Mainnet deploy**: `ZunnoInco` only exists on Base Sepolia today. Deploying
  to Base mainnet is a real transaction from a funded wallet — the verified
  addresses above are ready for `setMegapotConfig` once that happens.
- **Funding**: the contract needs real USDC to buy tickets — `approve` the
  contract then call `fundJackpot(amount)` from a funded wallet. This is a real
  on-chain transaction and has to be done by whoever holds the operator key; it
  isn't part of `Deploy.s.sol`. Until it's funded, entries no-op silently
  (`JackpotSkipped`).
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
