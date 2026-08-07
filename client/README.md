# client — Zunno × Inco (frontend)

Reuse the existing React client from **Khel-fun/ZunnoGame** (`main-v-02` → `/client`) and add Inco confidentiality.

## Port steps
1. Copy `ZunnoGame/client` here (UI, game board, wallet connect).
2. Add `@inco/lightning-js`:
   - **Encrypt inputs** before sending on-chain (`zap.encrypt(...)`).
   - **User-decrypt own hand** client-side (fast, private) for the `allow`ed player.
3. On **play**, request an **attested decryption** of the chosen card and submit it to `playCard(...)`.
4. UX: show a "revealing…" state during public decryptions (play / showdown / first discard) since covalidator consensus adds ~10–30s.

## Notes
- Wallet/tx via `viem`; target **Base Sepolia** (`supportedChains.baseSepolia`).
- Keep Socket.io (from ZunnoGame) for snappy turn/lobby UX; secrets never touch it.
