# server — Zunno × Inco

Node.js/Socket.IO backend ported from **Khel-fun/uno-game** (`main` → `/backend`).

```sh
pnpm install
cp .env.example .env
pnpm dev
```

This is still the legacy server-authoritative card flow. Keep it for rooms and
real-time relay; it is not confidential until dealing and plays are routed
through `ZunnoInco` instead of the server-held deck.
