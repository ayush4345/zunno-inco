# Zunno × Inco — Build Plan

Deadline: **Aug 14, 2026** (jam ends 8:59 PM PDT). Two tracks, up to **$10K**: Inco privacy ($5K) + Megapot ($5K).

## The port: Zunno (ZK-fair) → Zunno-Inco (confidential hands)
| Original Zunno | On Inco | Action |
|---|---|---|
| Server distributes cards | Encrypted deck on-chain; deal to `euint` handles | replace |
| Shuffle fairness via VRF + SP1 + ZKVerify | Encrypted randomness `e.randEuint8()` | replace (simpler) |
| Hand hidden by server | `e.allow(card, player)` → only owner can user-decrypt | replace |
| Play a card | Reveal that one card via attested decryption; validate legality with `e.eq`/`e.select` (attested compute) | new |
| React client / Rust server / on-chain state machine / escrow | keep | reuse |

**Latency note:** viewing your own hand = fast client-side user-decryption. A card becoming **public** (each play, showdown) = covalidator attested decryption (~10–30s). UNO reveals every turn → design the UI around this (optimistic reveal, validate-and-reveal in one attested step, batch where possible).

## 8-day timeline
- **D1 (Aug 7):** register; run `create-inco-app` + ConfidentialDeck; minimal encrypted-card deploy on Base Sepolia. Port ZunnoGame `client/` + `server/` into this repo.
- **D2:** encrypted deck + deal + `e.allow`; frontend encrypt + user-decrypt own hand.
- **D3:** draw + turn loop wired to on-chain state (reuse Zunno state machine); 2-player.
- **D4:** play (reveal played card via attestation + legality check); discard/color-match rules.
- **D5:** win detection + escrow pot payout; end-to-end 2-player game on Base Sepolia.
- **D6:** Megapot rake-to-jackpot (buy tickets on Base from the pot rake) → 2nd track.
- **D7:** polish UX (reveal "revealing…" states), deploy public demo, harden.
- **D8 (Aug 13→14):** 5-min video, "how we use Inco" + "how we use Megapot" write-ups, submit.

**Must-ship core:** D1–D5 (deal → play → win → payout, 2-player, confidential hands). Megapot = high-value add-on.

## Risks
- FHE reveal latency → confine public decrypts to play/showdown; own-hand is fast.
- Distinct-card dealing in FHE → use ConfidentialDeck shuffle, don't hand-roll.
- Gas + `inco.getFee()` → keep encrypted ops minimal; Base L2 keeps it cheap.
- Scope → 2-player first; more seats only if stable.

## Submission checklist
- [ ] Inco Lightning used for confidential hands; deployed on Base Sepolia; public demo
- [ ] Public repo + "how we use Inco" write-up + 5-min video
- [ ] (Megapot) functional ticket-purchase integration on Base, in the core loop
- [ ] Registered on Typeform; submitted before Aug 14 cutoff
