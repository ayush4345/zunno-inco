// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {euint256, e} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "./kit/ConfidentialDeck.sol";
import {UnoCards} from "./UnoCards.sol";

/// @title ZunnoInco — Confidential UNO on Inco Lightning
/// @notice Hands are secret on-chain (ConfidentialDeck `_dealTo`). A card's
///         value only enters on-chain state when someone submits a covalidator
///         attestation (`_verifyValue`) — that's how "play" and "opening" work.
/// @dev ConfidentialDeck holds a SINGLE shuffled deck (an `elist`) at a time, so
///      only ONE game can be mid-deal at once. For the hackathon demo we run one
///      active table; `startGame` reshuffles and marks the deck busy until the
///      game finishes. Fund the contract for shuffle fees via `fundFees()`.
contract ZunnoInco is ConfidentialDeck {
    using e for euint256;

    uint16 constant DECK = 108; // full UNO deck
    uint8 constant START_HAND = 7;
    uint16 constant RAKE_BPS = 300; // 3% -> Megapot jackpot (see BUILD_PLAN)

    enum Phase { Waiting, Opening, Active, Finished }

    struct Game {
        address[] players;
        uint8 turn; // index into players
        int8 dir; // +1 or -1 (reverse)
        uint256 pot; // escrow
        uint256 buyIn;
        Phase phase;
        uint256 topValue; // plaintext of current top card (set via attestation)
        uint8 activeColor; // color in force (top color, or wild's chosen color)
        address winner;
    }

    uint256 public nextGameId;
    bool public deckBusy; // true while a game holds the singleton deck
    mapping(uint256 => Game) public games;
    mapping(uint256 => mapping(address => euint256[])) internal hands;
    euint256 internal openingCard; // face-up opener handle awaiting commit

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 buyIn);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId);
    event OpeningCommitted(uint256 indexed gameId, uint256 value, uint8 activeColor);
    event CardDrawn(uint256 indexed gameId, address indexed player);
    event CardPlayed(uint256 indexed gameId, address indexed player, uint256 value, uint8 activeColor);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 payout);

    receive() external payable {}
    /// @notice Pre-fund the contract so it can pay ConfidentialDeck shuffle fees.
    function fundFees() external payable {}

    // ── Lobby / escrow ────────────────────────────────────────────────────────
    function createGame(uint256 buyIn) external payable returns (uint256 gameId) {
        require(msg.value >= buyIn, "buy-in");
        gameId = ++nextGameId;
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

    // ── Start: shuffle, deal secret hands, flip opener face up ────────────────
    function startGame(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Waiting, "phase");
        require(g.players.length >= 2, "need >=2 players");
        require(!deckBusy, "deck busy (one game at a time)");
        require(address(this).balance >= deckFee(DECK), "fund shuffle fee via fundFees()");

        deckBusy = true;
        _newShuffledDeck(DECK);

        for (uint256 i = 0; i < g.players.length; i++) {
            address p = g.players[i];
            for (uint8 c = 0; c < START_HAND; c++) {
                hands[gameId][p].push(_dealTo(p)); // secret: only p can peek
            }
        }
        openingCard = _dealFaceUp(); // public, but value learned via attestation
        g.phase = Phase.Opening;
        emit GameStarted(gameId);
    }

    /// @notice Submit the attested value of the face-up opener to begin play.
    ///         `chosenColor` (0..3) is used only if the opener is a wild.
    function commitOpening(uint256 gameId, uint256 value, bytes[] calldata sigs, uint8 chosenColor) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Opening, "phase");
        _verifyValue(openingCard, value, _copySigs(sigs)); // reverts if wrong
        g.topValue = value;
        if (UnoCards.isWild(value)) {
            require(chosenColor <= 3, "pick a color");
            g.activeColor = chosenColor;
        } else {
            g.activeColor = UnoCards.decode(value).color;
        }
        g.phase = Phase.Active;
        emit OpeningCommitted(gameId, value, g.activeColor);
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    function drawCard(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Active, "phase");
        require(_current(g) == msg.sender, "not your turn");
        hands[gameId][msg.sender].push(_dealTo(msg.sender)); // secret to caller
        emit CardDrawn(gameId, msg.sender);
        _advance(g); // house rule: drawing ends the turn (simple demo flow)
    }

    // ── Play ────────────────────────────────────────────────────────────────
    /// @notice The caller peeked their card client-side (they are `allow`ed) and
    ///         submits its value + covalidator sigs. `_verifyValue` binds the
    ///         value to the on-chain handle, so they cannot lie. `chosenColor`
    ///         (0..3) applies only when the played card is a wild.
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

        _verifyValue(hand[handIndex], claimedValue, _copySigs(sigs)); // trustless reveal
        require(UnoCards.isPlayable(claimedValue, g.topValue, g.activeColor), "illegal move");

        // remove played card from the (still-secret) hand
        hand[handIndex] = hand[hand.length - 1];
        hand.pop();

        // update pile + active color
        g.topValue = claimedValue;
        if (UnoCards.isWild(claimedValue)) {
            require(chosenColor <= 3, "pick a color");
            g.activeColor = chosenColor;
        } else {
            g.activeColor = UnoCards.decode(claimedValue).color;
        }
        emit CardPlayed(gameId, msg.sender, claimedValue, g.activeColor);

        if (hand.length == 0) {
            _finish(g, gameId, msg.sender);
            return;
        }
        _applyEffects(g, gameId, claimedValue);
        _advance(g);
    }

    // ── Action-card effects ─────────────────────────────────────────────────────
    function _applyEffects(Game storage g, uint256 gameId, uint256 value) internal {
        UnoCards.Card memory card = UnoCards.decode(value);
        if (card.kind == UnoCards.REVERSE) {
            g.dir = int8(-g.dir);
            if (g.players.length == 2) _advance(g); // reverse == skip in 2p
        } else if (card.kind == UnoCards.SKIP) {
            _advance(g); // skip next (caller advances again)
        } else if (card.kind == UnoCards.DRAW_TWO) {
            address next = _peekNext(g);
            for (uint8 i = 0; i < 2; i++) hands[gameId][next].push(_dealTo(next));
            _advance(g);
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
        deckBusy = false; // release the singleton deck
        uint256 payout = g.pot;
        // uint256 rake = payout * RAKE_BPS / 10_000; payout -= rake;
        // TODO(Megapot): buy jackpot tickets with `rake` for g.players (BUILD_PLAN).
        g.pot = 0;
        (bool ok, ) = winner.call{value: payout}("");
        require(ok, "payout");
        emit GameFinished(gameId, winner, payout);
    }

    // ── Views for the frontend (fetch handles, then user-decrypt client-side) ──
    function getMyHandHandles(uint256 gameId) external view returns (bytes32[] memory out) {
        euint256[] storage hand = hands[gameId][msg.sender];
        out = new bytes32[](hand.length);
        for (uint256 i = 0; i < hand.length; i++) out[i] = euint256.unwrap(hand[i]);
    }

    function getOpeningHandle() external view returns (bytes32) {
        return euint256.unwrap(openingCard);
    }

    // ── Turn helpers ────────────────────────────────────────────────────────────
    function _current(Game storage g) internal view returns (address) {
        return g.players[g.turn];
    }

    function _peekNext(Game storage g) internal view returns (address) {
        uint256 n = g.players.length;
        return g.players[(uint256(int256(uint256(g.turn)) + g.dir) + n) % n];
    }

    function _advance(Game storage g) internal {
        uint256 n = g.players.length;
        g.turn = uint8((uint256(int256(uint256(g.turn)) + g.dir) + n) % n);
    }

    function _copySigs(bytes[] calldata src) internal pure returns (bytes[] memory out) {
        out = new bytes[](src.length);
        for (uint256 i = 0; i < src.length; i++) out[i] = src[i];
    }
}
