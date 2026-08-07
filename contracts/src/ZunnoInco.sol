// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ┌──────────────────────────────────────────────────────────────────────────┐
// │  ZunnoInco — Confidential UNO on Inco Lightning v1                          │
// │                                                                            │
// │  Built on Inco's ConfidentialDeck template (the "five moves"):             │
// │    _newShuffledDeck(n) · _dealTo(player) · _draw() · _revealCard/           │
// │    _dealFaceUp · _verifyValue(card, value, sigs)                           │
// │  Inco = confidential compute for the EVM (secret = decrypted by Inco;       │
// │  "provably fair" = covalidator attestation). Hands stay secret on-chain;    │
// │  only played / showdown cards become public.                               │
// │                                                                            │
// │  STATUS: WIP. Plaintext UNO logic (turns, legality via UnoCards) is         │
// │  complete; ConfidentialDeck method names/returns must be confirmed against  │
// │  github.com/Inco-fhevm/confidential-deck-template when the kit is vendored  │
// │  into ./kit. Not yet compiled/tested.                                       │
// └──────────────────────────────────────────────────────────────────────────┘

import {euint256} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "./kit/ConfidentialDeck.sol";
import {UnoCards} from "./UnoCards.sol";

contract ZunnoInco is ConfidentialDeck {
    using UnoCards for uint256;

    uint256 constant DECK = 108; // full UNO deck
    uint8 constant START_HAND = 7;
    uint16 constant RAKE_BPS = 300; // 3% -> Megapot jackpot (see BUILD_PLAN)

    enum Phase { Waiting, Active, Finished }

    struct Game {
        address[] players;
        uint8 turn; // index into players
        int8 dir; // +1 or -1 (reverse)
        uint256 pot; // escrow
        uint256 buyIn;
        Phase phase;
        uint256 topValue; // current top-of-pile card (public)
        uint8 activeColor; // color in force (top color, or wild's chosen color)
        address winner;
    }

    uint256 public nextGameId;
    mapping(uint256 => Game) public games;
    // secret hands: each entry is a ConfidentialDeck card handle, allow()'d to its owner
    mapping(uint256 => mapping(address => euint256[])) internal hands;

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 buyIn);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId, uint256 topValue, uint8 activeColor);
    event CardDrawn(uint256 indexed gameId, address indexed player);
    event CardPlayed(uint256 indexed gameId, address indexed player, uint256 value, uint8 activeColor);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 payout);

    // ── Lobby / escrow ────────────────────────────────────────────────────────
    function createGame(uint256 buyIn) external payable returns (uint256 gameId) {
        require(msg.value >= buyIn, "buy-in");
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.players.push(msg.sender);
        g.buyIn = buyIn;
        g.pot = msg.value;
        g.dir = 1;
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

    // ── Start: shuffle, deal secret hands, flip first card ────────────────────
    // Attach msg.value >= deckFee(DECK) for the shuffle op (ConfidentialDeck).
    function startGame(uint256 gameId) external payable {
        Game storage g = games[gameId];
        require(g.phase == Phase.Waiting, "phase");
        require(g.players.length >= 2, "need >=2 players");

        _newShuffledDeck(DECK); // one confidential shuffle

        for (uint256 i = 0; i < g.players.length; i++) {
            address p = g.players[i];
            for (uint8 c = 0; c < START_HAND; c++) {
                hands[gameId][p].push(_dealTo(p)); // secret: only p can peek
            }
        }

        // Flip the first non-wild card face up to open the pile.
        // TODO: confirm _dealFaceUp() returns the public plaintext value; loop
        // until a non-wild card is drawn (a wild opener needs a chosen color).
        uint256 top = _dealFaceUp();
        g.topValue = top;
        g.activeColor = UnoCards.decode(top).color;
        g.phase = Phase.Active;
        emit GameStarted(gameId, top, g.activeColor);
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    function drawCard(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Active, "phase");
        require(_current(g) == msg.sender, "not your turn");
        hands[gameId][msg.sender].push(_dealTo(msg.sender)); // secret to caller
        emit CardDrawn(gameId, msg.sender);
        // House rule: drawing ends the turn (keeps flow simple for the demo).
        _advance(g);
    }

    // ── Play ────────────────────────────────────────────────────────────────
    // The player peeked their card client-side (allow) and submits its value +
    // covalidator signatures. _verifyValue binds that value to the on-chain
    // handle (they cannot lie). Then we enforce UNO legality on the value.
    // chosenColor is used only when the played card is a wild.
    function playCard(
        uint256 gameId,
        uint256 handIndex,
        uint256 claimedValue,
        bytes[] calldata sigs,
        uint8 chosenColor
    ) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Active, "phase");
        require(_current(g) == msg.sender, "not your turn");

        euint256[] storage hand = hands[gameId][msg.sender];
        require(handIndex < hand.length, "bad index");

        // Trustless reveal: the handle really is `claimedValue`.
        require(_verifyValue(hand[handIndex], claimedValue, sigs), "value mismatch");
        // UNO legality against the current pile.
        require(UnoCards.isPlayable(claimedValue, g.topValue, g.activeColor), "illegal move");

        // Remove the played card from the (still-secret) hand.
        hand[handIndex] = hand[hand.length - 1];
        hand.pop();

        // Update pile + active color.
        g.topValue = claimedValue;
        if (UnoCards.isWild(claimedValue)) {
            require(chosenColor <= 3, "pick a color");
            g.activeColor = chosenColor;
        } else {
            g.activeColor = UnoCards.decode(claimedValue).color;
        }

        emit CardPlayed(gameId, msg.sender, claimedValue, g.activeColor);

        // Win check.
        if (hand.length == 0) {
            _finish(g, gameId, msg.sender);
            return;
        }

        // Apply action-card effects on turn order, then advance.
        _applyEffects(g, gameId, claimedValue);
        _advance(g);
    }

    // ── Effects / turn order ──────────────────────────────────────────────────
    function _applyEffects(Game storage g, uint256 gameId, uint256 value) internal {
        UnoCards.Card memory card = UnoCards.decode(value);
        if (card.kind == UnoCards.REVERSE) {
            g.dir = int8(-g.dir);
            if (g.players.length == 2) _advance(g); // reverse acts as skip in 2p
        } else if (card.kind == UnoCards.SKIP) {
            _advance(g); // skip next player (a second advance happens in caller)
        } else if (card.kind == UnoCards.DRAW_TWO) {
            address next = _peekNext(g);
            for (uint8 i = 0; i < 2; i++) hands[gameId][next].push(_dealTo(next));
            _advance(g); // penalized player loses their turn
        } else if (card.kind == UnoCards.WILD_DRAW_FOUR) {
            address next = _peekNext(g);
            for (uint8 i = 0; i < 4; i++) hands[gameId][next].push(_dealTo(next));
            _advance(g);
        }
    }

    // ── Settlement ─────────────────────────────────────────────────────────────
    function _finish(Game storage g, uint256 gameId, address winner) internal {
        g.phase = Phase.Finished;
        g.winner = winner;
        uint256 payout = g.pot;
        // uint256 rake = payout * RAKE_BPS / 10_000; payout -= rake;
        // TODO(Megapot): buy jackpot tickets with `rake` for g.players (BUILD_PLAN).
        g.pot = 0;
        (bool ok, ) = winner.call{value: payout}("");
        require(ok, "payout");
        emit GameFinished(gameId, winner, payout);
    }

    // ── Turn helpers ────────────────────────────────────────────────────────────
    function _current(Game storage g) internal view returns (address) {
        return g.players[g.turn];
    }

    function _peekNext(Game storage g) internal view returns (address) {
        uint256 n = g.players.length;
        uint256 idx = (uint256(int256(g.turn) + g.dir) + n) % n;
        return g.players[idx];
    }

    function _advance(Game storage g) internal {
        uint256 n = g.players.length;
        g.turn = uint8((uint256(int256(g.turn) + g.dir) + n) % n);
    }
}
