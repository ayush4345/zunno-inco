
# Zunno client

UI ported from `Khel-fun/uno-game` (`main` → `/frontend`) with confidential
multiplayer powered by the Inco contract and browser wallet.

```sh
# Node 20
cp .env.example .env
pnpm install
pnpm dev
```

Multiplayer uses `ConfidentialGame.tsx` for contract state, batched encrypted
dealing, private hand decrypts, and attested plays. Computer mode stays local.
