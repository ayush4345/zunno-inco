
# Zunno client

UI ported from `Khel-fun/uno-game` (`main` → `/frontend`) with the Inco deck
bridge retained in `incoDeckClient.ts`.

```sh
# Node 20
cp .env.example .env
pnpm install
pnpm dev
```

The imported screens still use the legacy socket/ZK game flow. The Inco bridge
is ready for wiring `getMyHandHandles` → private hand decrypts and
`commitOpening`/`playCard` attestations.
