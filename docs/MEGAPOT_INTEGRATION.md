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
3. The **operator (Khel.fun) wallet is the Megapot `referrer`** → earns purchase
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

```bash
cd contracts && forge test --match-path test/MegapotJackpot.t.sol -vv
```

## Frontend (remaining)
- **Jackpot banner**: current pot + countdown via the Megapot Data API
  (`https://api.megapot.io` — active round). Copy: "Every hand enters today's Megapot jackpot."
- **This table's ticket**: read `getGameJackpot(gameId)` → show ticket id(s) / "entered".
- **Claim**: after the draw settles and the ticket won (check tier off-chain first),
  call `claimGameJackpot(gameId)`.

## Notes / risks
- **Async draw**: the winner is known at the next daily drawing, not instantly — the
  demo shows *ticket purchased + odds + claim flow*, not a live hit inside the demo.
- `claimGameJackpot` reverts for a losing/unsettled ticket (by design) and leaves the
  game retryable; gate the claim button on the off-chain tier check.
- Settlement (`runJackpot`) is triggered by Megapot/keepers and needs ETH for Pyth —
  not our responsibility.
