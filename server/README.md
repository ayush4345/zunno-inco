# server — Zunno × Inco (backend)

Reuse the Rust backend from **Khel-fun/ZunnoGame** (`main-v-02` → `/server`), but its role **shrinks**:

- ❌ No longer distributes or holds cards (Inco handles confidentiality on-chain).
- ❌ No VRF/SP1/ZKVerify shuffle pipeline needed for hiding hands (encrypted deal replaces it).
- ✅ Keep: matchmaking, room/turn orchestration, real-time relay (WebSocket), and any indexing of public on-chain events (plays, results).

The security win: because the server no longer sees cards, there's nothing to leak or collude with — confidentiality is enforced by Inco + covalidators, not by trusting this service.
