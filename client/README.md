# Zunno × Inco client

The frontend is a two-player confidential UNO experience designed around encrypted
hands and Inco's attested public-card reveals.

## Run locally

```bash
npm install
npm run dev
```

## Current UI flow

The initial experience ships a safe local UI demo for the lobby, encrypted-deal,
private-card selection, public-reveal status, settlement preview, and opt-in sound.
It deliberately does **not** send a transaction or expose hand data.

## Audio credits

- `public/audio/arcade-loop.mp3` — “Arcade_Soundtracks” by hanzlab, CC0:
  https://opengameart.org/content/arcadesoundtracks
- Interaction effects in `public/audio/*.ogg` — Kenney casino audio pack, CC0;
  the included `KENNEY-LICENSE.txt` preserves the source license.

Wire `@inco/lightning-js`, `viem`, and the deployed contract only after the
contract's unfinished encryption/deck/UNO-rule paths have been implemented and
verified. The current Solidity contract remains a documented scaffold.

```bash
npm test
npm run build
```
