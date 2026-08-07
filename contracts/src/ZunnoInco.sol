// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ┌───────────────────────────────────────────────────────────────────────┐
// │  ZunnoInco — Confidential UNO on Inco Lightning (FHE)                    │
// │  WIP SCAFFOLD — design skeleton, NOT compiled/tested/audited.            │
// │  Validate every Inco API against https://docs.inco.org before use.       │
// │  Card encoding: euint8 code 0..(DECK_SIZE-1); map to color/value off-    │
// │  chain or via a helper. Deal/shuffle: prefer Inco's ConfidentialDeck.    │
// └───────────────────────────────────────────────────────────────────────┘

import {e, euint8, ebool, inco} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";

contract ZunnoInco {
    // ---- Types --------------------------------------------------------------
    enum Phase { Waiting, Dealing, Active, Showdown, Finished }

    struct Game {
        address[] players;
        uint8 turn;              // index into players
        int8 direction;          // +1 / -1 (reverse card)
        uint256 pot;             // escrow (wei or token units)
        uint256 buyIn;
        Phase phase;
        euint8 topDiscard;       // last played card (public once played)
        address winner;
    }

    // gameId => Game
    mapping(uint256 => Game) public games;
    // gameId => player => encrypted hand (dynamic; UNO hands grow/shrink)
    mapping(uint256 => mapping(address => euint8[])) internal hands;
    // gameId => remaining encrypted draw pile
    mapping(uint256 => euint8[]) internal deck;

    uint256 public nextGameId;

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 buyIn);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId);
    event CardPlayed(uint256 indexed gameId, address indexed player); // value revealed via topDiscard
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 pot);

    // ---- Lobby / escrow -----------------------------------------------------
    function createGame(uint256 buyIn) external payable returns (uint256 gameId) {
        require(msg.value >= buyIn, "buy-in");
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.players.push(msg.sender);
        g.buyIn = buyIn;
        g.pot = msg.value;
        g.direction = 1;
        g.phase = Phase.Waiting;
        emit GameCreated(gameId, msg.sender, buyIn);
    }

    function joinGame(uint256 gameId) external payable {
        Game storage g = games[gameId];
        require(g.phase == Phase.Waiting, "not joinable");
        require(msg.value >= g.buyIn, "buy-in");
        g.players.push(msg.sender);
        g.pot += msg.value;
        emit PlayerJoined(gameId, msg.sender);
    }

    // ---- Deal (confidential + verifiably random) ----------------------------
    // TODO: prefer Inco ConfidentialDeck for a proper shuffle + draw-without-
    // replacement. Sketch below shows the intent: each dealt card is an
    // encrypted handle that ONLY its owner can decrypt (e.allow), while the
    // contract retains compute rights (e.allowThis) for later reveal.
    function startGame(uint256 gameId) external payable {
        Game storage g = games[gameId];
        require(g.phase == Phase.Waiting, "phase");
        require(g.players.length >= 2, "need players");
        // require(msg.value == inco.getFee() * ...);  // FHE op fees — see docs

        g.phase = Phase.Dealing;
        uint8 HAND = 7; // UNO starting hand
        for (uint256 i = 0; i < g.players.length; i++) {
            address p = g.players[i];
            for (uint8 c = 0; c < HAND; c++) {
                euint8 card = _drawEncrypted(gameId); // TODO distinct-draw
                e.allow(card, p);      // only p can user-decrypt this card
                e.allowThis(card);     // contract can compute/reveal later
                hands[gameId][p].push(card);
            }
        }
        // flip first discard (public)
        g.topDiscard = _revealTop(gameId); // TODO: attested public decrypt
        g.phase = Phase.Active;
        emit GameStarted(gameId);
    }

    // ---- Draw ---------------------------------------------------------------
    function drawCard(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Active, "phase");
        require(g.players[g.turn] == msg.sender, "not your turn");
        euint8 card = _drawEncrypted(gameId);
        e.allow(card, msg.sender);
        e.allowThis(card);
        hands[gameId][msg.sender].push(card);
        // player user-decrypts client-side to see the drawn card (fast)
    }

    // ---- Play ---------------------------------------------------------------
    // The played card becomes PUBLIC. Client submits an attested decryption of
    // the chosen hand card; contract verifies covalidator signatures, checks
    // legality vs topDiscard (same color OR value OR wild), updates state.
    function playCard(
        uint256 gameId,
        uint256 handIndex,
        DecryptionAttestation calldata dec,
        bytes[] calldata sigs
    ) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Active, "phase");
        require(g.players[g.turn] == msg.sender, "not your turn");

        euint8 chosen = hands[gameId][msg.sender][handIndex];
        // 1) the attestation must correspond to THIS card handle
        require(euint8.unwrap(chosen) == dec.handle, "handle mismatch");
        // 2) covalidators must have signed the decryption
        require(inco.incoVerifier().isValidDecryptionAttestation(dec, sigs), "bad attestation");

        // 3) legality check on the revealed value vs current top discard
        //    TODO: implement UNO match rules (color/value/wild) using dec.value
        //    Optionally validate WITHOUT full reveal via attested-compute e.eq.

        // 4) apply: set top discard, remove card from hand, handle action cards
        //    (skip/reverse/draw2/wild), advance turn by g.direction.
        _removeFromHand(gameId, msg.sender, handIndex);
        // g.topDiscard = <revealed card as euint8>;  // now public
        emit CardPlayed(gameId, msg.sender);

        if (hands[gameId][msg.sender].length == 0) {
            _finish(gameId, msg.sender);
        }
    }

    // ---- Settlement ---------------------------------------------------------
    function _finish(uint256 gameId, address winner) internal {
        Game storage g = games[gameId];
        g.phase = Phase.Finished;
        g.winner = winner;
        uint256 payout = g.pot;
        // TODO: rake for Megapot jackpot (see docs/BUILD_PLAN.md). e.g.:
        // uint256 rake = payout * RAKE_BPS / 10_000; payout -= rake;
        // megapot.buyTickets(rake, g.players);
        g.pot = 0;
        (bool ok, ) = winner.call{value: payout}("");
        require(ok, "payout");
        emit GameFinished(gameId, winner, payout);
    }

    // ---- Internal helpers (TODO) -------------------------------------------
    function _drawEncrypted(uint256 gameId) internal returns (euint8) {
        // TODO: draw-without-replacement from encrypted deck, or ConfidentialDeck.
        // Placeholder: fresh encrypted random card 0..53
        gameId; // silence unused in skeleton
        return e.rem(e.randEuint8(), 54);
    }

    function _revealTop(uint256 gameId) internal returns (euint8) {
        // TODO: attested public decryption of the next deck card
        return _drawEncrypted(gameId);
    }

    function _removeFromHand(uint256 gameId, address p, uint256 idx) internal {
        euint8[] storage h = hands[gameId][p];
        h[idx] = h[h.length - 1];
        h.pop();
    }
}
