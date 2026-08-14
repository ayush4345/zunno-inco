# server — Zunno × Inco

Node.js/Socket.IO backend.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

This is the server-authoritative card flow used for rooms and real-time
relay; it is not confidential until dealing and plays are routed through
`ZunnoInco` instead of the server-held deck.
