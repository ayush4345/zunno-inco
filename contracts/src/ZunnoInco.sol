// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {euint256, e} from "@inco/lightning/src/Lib.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ConfidentialDeck} from "./kit/ConfidentialDeck.sol";
import {UnoCards} from "./UnoCards.sol";
import {MegapotJackpot} from "./MegapotJackpot.sol";

/// @title ZunnoInco — Confidential UNO on Inco Lightning
/// @notice Hands are secret on-chain (ConfidentialDeck `_dealTo`). A card's
///         value only enters on-chain state when someone submits a covalidator
///         attestation (`_verifyValue`) — that's how "play" and "opening" work.
/// @dev Every game owns an independent encrypted deck and draw cursor. Fund the
///      contract for each shuffle via `fundFees()`. Every started table also
///      buys a Megapot lottery ticket (USDC) via the inherited MegapotJackpot
///      module — see `enterJackpot` / `claimGameJackpot`.
contract ZunnoInco is ConfidentialDeck, ReentrancyGuard, MegapotJackpot {
    using e for euint256;

    uint16 constant DECK = 108; // full UNO deck
    uint8 constant START_HAND = 4;
    uint8 public constant MAX_DEAL_BATCH = 8;
    // ponytail: one 108-card shoe; add encrypted discard reshuffling if long games exhaust it.
    uint256 public constant MAX_PLAYERS = 4;

    enum Phase {
        Waiting,
        Opening,
        Active,
        Finished
    }

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

    struct Lobby {
        address creator;
        bool isPrivate;
        bool isBot;
        bytes32 gameCodeHash;
        uint256 maxPlayers;
        uint256 startTime;
        uint256 endTime;
    }

    struct GameView {
        uint256 id;
        address creator;
        address[] players;
        uint8 status;
        bool isPrivate;
        bytes32 gameCodeHash;
        uint256 maxPlayers;
        uint256 startTime;
        uint256 endTime;
        bytes32 deckCommitment;
        bytes32[] moveCommitments;
    }

    uint256 public nextGameId;
    uint256 public feeBalance;
    mapping(uint256 => Game) public games;
    mapping(uint256 => Lobby) public lobbies;
    mapping(address => uint256[]) internal createdGames;
    mapping(uint256 => mapping(address => bool)) public seated;
    mapping(uint256 => mapping(address => euint256[])) internal hands;
    mapping(uint256 => uint16) public dealtCards;
    mapping(uint256 => bool) public openingReady;
    mapping(uint256 => euint256) internal openingCards; // face-up opener awaiting commit

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 buyIn);
    event GameCreated(uint256 indexed gameId, address indexed creator, bool isPrivate);
    event GameDeleted(uint256 indexed gameId, address indexed creator);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId);
    event CardsDealt(uint256 indexed gameId);
    event OpeningCommitted(uint256 indexed gameId, uint256 value, uint8 activeColor);
    event CardDrawn(uint256 indexed gameId, address indexed player);
    event CardPlayed(uint256 indexed gameId, address indexed player, uint256 value, uint8 activeColor);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 payout);

    receive() external payable {
        feeBalance += msg.value;
    }

    /// @notice Pre-fund the contract so it can pay ConfidentialDeck shuffle fees.
    function fundFees() external payable {
        feeBalance += msg.value;
    }

    // ── Lobby / escrow ────────────────────────────────────────────────────────
    function createGame(uint256 buyIn) external payable returns (uint256 gameId) {
        return _createGame(msg.sender, buyIn, msg.value, false, false, bytes32(0), MAX_PLAYERS);
    }

    function createGame(address creator, bool isBot) external returns (uint256 gameId) {
        require(creator == msg.sender, "creator != sender");
        return _createGame(creator, 0, 0, false, isBot, bytes32(0), isBot ? 2 : MAX_PLAYERS);
    }

    function createGame(address creator, bool isBot, bool isPrivate, bytes32 gameCodeHash, uint256 maxPlayers)
        external
        returns (uint256 gameId)
    {
        require(creator == msg.sender, "creator != sender");
        return _createGame(creator, 0, 0, isPrivate, isBot, gameCodeHash, maxPlayers);
    }

    function _createGame(
        address creator,
        uint256 buyIn,
        uint256 paid,
        bool isPrivate,
        bool isBot,
        bytes32 gameCodeHash,
        uint256 maxPlayers
    ) internal returns (uint256 gameId) {
        require(paid >= buyIn, "buy-in");
        require(maxPlayers >= 2 && maxPlayers <= MAX_PLAYERS, "max players");
        gameId = ++nextGameId;
        Game storage g = games[gameId];
        g.players.push(creator);
        seated[gameId][creator] = true;
        g.buyIn = buyIn;
        g.pot = paid;
        g.dir = 1;
        g.phase = Phase.Waiting;
        lobbies[gameId] = Lobby({
            creator: creator,
            isPrivate: isPrivate,
            isBot: isBot,
            gameCodeHash: gameCodeHash,
            maxPlayers: maxPlayers,
            startTime: 0,
            endTime: 0
        });
        createdGames[creator].push(gameId);
        emit GameCreated(gameId, creator, buyIn);
        emit GameCreated(gameId, creator, isPrivate);
    }

    function joinGame(uint256 gameId) external payable {
        _joinGame(gameId, msg.sender, msg.value);
    }

    function joinGame(uint256 gameId, address joinee) external payable {
        require(joinee == msg.sender, "joinee != sender");
        _joinGame(gameId, joinee, msg.value);
    }

    function joinGameWithCode(uint256 gameId, address joinee, string calldata gameCode) external payable {
        require(joinee == msg.sender, "joinee != sender");
        Lobby storage lobby = lobbies[gameId];
        require(lobby.isPrivate, "not private");
        require(keccak256(bytes(gameCode)) == lobby.gameCodeHash, "invalid game code");
        _joinGame(gameId, joinee, msg.value);
    }

    function _joinGame(uint256 gameId, address player, uint256 paid) internal {
        Game storage g = games[gameId];
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        require(g.phase == Phase.Waiting, "not joinable");
        require(!lobbies[gameId].isBot, "bot game");
        require(!seated[gameId][player], "already joined");
        require(g.players.length < lobbies[gameId].maxPlayers, "table full");
        require(paid >= g.buyIn, "buy-in");
        g.players.push(player);
        seated[gameId][player] = true;
        g.pot += paid;
        emit PlayerJoined(gameId, player);
    }

    function deleteGame(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        Lobby storage lobby = lobbies[gameId];
        require(lobby.creator == msg.sender, "not creator");
        require(g.phase == Phase.Waiting, "already started");

        g.phase = Phase.Finished;
        lobby.endTime = block.timestamp;
        uint256 refund = g.pot;
        g.pot = 0;

        uint256[] storage ids = createdGames[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == gameId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }

        if (refund != 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            require(ok, "refund");
        }
        emit GameDeleted(gameId, msg.sender);
    }

    // ── Start: shuffle first, then deal in bounded transactions ──────────────
    function startGame(uint256 gameId) external {
        Game storage g = games[gameId];
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        require(g.players[0] == msg.sender, "not creator");
        require(g.phase == Phase.Waiting, "phase");
        require(g.players.length >= 2, "need >=2 players");
        uint256 fee = deckFee(DECK);
        require(feeBalance >= fee, "fund shuffle fee via fundFees()");

        feeBalance -= fee;
        _newShuffledDeck(gameId, DECK);
        g.phase = Phase.Opening;
        lobbies[gameId].startTime = block.timestamp;
        emit GameStarted(gameId);

        // Enter this table into Megapot's daily jackpot (USDC). Best-effort: an
        // external self-call wrapped in try/catch so an under-funded jackpot or a
        // Megapot revert can NEVER block the confidential game from starting.
        try this.enterJackpot(gameId) {} catch {}
    }

    /// @notice Buy this table's Megapot lottery ticket (idempotent per game).
    ///         Called automatically by `startGame`; also callable directly to
    ///         retry after the contract is funded with USDC via `fundJackpot`.
    function enterJackpot(uint256 gameId) external {
        Game storage g = games[gameId];
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        require(g.phase != Phase.Waiting, "not started");
        _enterJackpot(gameId, g.players);
    }

    /// @notice Deal at most `MAX_DEAL_BATCH` encrypted cards per transaction —
    ///         real dealCards txs on Base Sepolia run ~120k gas/card, far below
    ///         the network's ~1.2B block gas limit, so 8 covers a full 2-player
    ///         deal (2 * START_HAND) in one call. Anyone may advance the deal;
    ///         recipients and order are fixed by contract state.
    function dealCards(uint256 gameId, uint8 count) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Opening && !openingReady[gameId], "not dealing");
        require(count > 0 && count <= MAX_DEAL_BATCH, "bad batch");

        uint16 total = uint16(g.players.length) * START_HAND;
        uint16 cursor = dealtCards[gameId];
        uint16 end = cursor + count;
        if (end > total) end = total;

        while (cursor < end) {
            address player = g.players[cursor % uint16(g.players.length)];
            hands[gameId][player].push(_dealTo(gameId, player));
            cursor++;
        }
        dealtCards[gameId] = cursor;

        if (cursor == total) {
            openingCards[gameId] = _dealFaceUp(gameId);
            openingReady[gameId] = true;
            emit CardsDealt(gameId);
        }
    }

    /// @notice Submit the attested value of the face-up opener to begin play.
    ///         `chosenColor` (0..3) is used only if the opener is a wild.
    function commitOpening(uint256 gameId, uint256 value, bytes[] calldata sigs, uint8 chosenColor) external {
        Game storage g = games[gameId];
        require(g.phase == Phase.Opening, "phase");
        require(openingReady[gameId], "deal incomplete");
        _verifyValue(openingCards[gameId], value, sigs); // reverts if wrong
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
        hands[gameId][msg.sender].push(_dealTo(gameId, msg.sender)); // secret to caller
        emit CardDrawn(gameId, msg.sender);
        _advance(g); // house rule: drawing ends the turn (simple demo flow)
    }

    // ── Play ────────────────────────────────────────────────────────────────
    /// @notice The caller peeked their card client-side (they are `allow`ed) and
    ///         submits its value + covalidator sigs. `_verifyValue` binds the
    ///         value to the on-chain handle, so they cannot lie. `chosenColor`
    ///         (0..3) applies only when the played card is a wild.
    function playCard(uint256 gameId, uint256 handIndex, uint256 claimedValue, bytes[] calldata sigs, uint8 chosenColor)
        external
        nonReentrant
    {
        Game storage g = games[gameId];
        require(g.phase == Phase.Active, "phase");
        require(_current(g) == msg.sender, "not your turn");

        euint256[] storage hand = hands[gameId][msg.sender];
        require(handIndex < hand.length, "bad index");

        _verifyValue(hand[handIndex], claimedValue, sigs); // trustless reveal
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
            for (uint8 i = 0; i < 2; i++) {
                hands[gameId][next].push(_dealTo(gameId, next));
            }
            _advance(g);
        } else if (card.kind == UnoCards.WILD_DRAW_FOUR) {
            address next = _peekNext(g);
            for (uint8 i = 0; i < 4; i++) {
                hands[gameId][next].push(_dealTo(gameId, next));
            }
            _advance(g);
        }
    }

    // ── Settlement ─────────────────────────────────────────────────────────────
    function _finish(Game storage g, uint256 gameId, address winner) internal {
        g.phase = Phase.Finished;
        lobbies[gameId].endTime = block.timestamp;
        g.winner = winner;
        uint256 payout = g.pot;
        // Note: the ETH escrow pays out in full to the winner. The Megapot jackpot
        // is a SEPARATE USDC entry bought at `startGame` (see MegapotJackpot); its
        // winnings are distributed via `claimGameJackpot` after the daily drawing.
        g.pot = 0;
        (bool ok,) = winner.call{value: payout}("");
        require(ok, "payout");
        emit GameFinished(gameId, winner, payout);
    }

    // ── Views for the frontend (fetch handles, then user-decrypt client-side) ──
    function getMyHandHandles(uint256 gameId) external view returns (bytes32[] memory out) {
        euint256[] storage hand = hands[gameId][msg.sender];
        out = new bytes32[](hand.length);
        for (uint256 i = 0; i < hand.length; i++) {
            out[i] = euint256.unwrap(hand[i]);
        }
    }

    /// @notice Public hand counts for table rendering; card values stay encrypted.
    function getHandSizes(uint256 gameId) external view returns (uint256[] memory out) {
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        address[] storage players = games[gameId].players;
        out = new uint256[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            out[i] = hands[gameId][players[i]].length;
        }
    }

    function getOpeningHandle(uint256 gameId) external view returns (bytes32) {
        require(openingReady[gameId], "deal incomplete");
        return euint256.unwrap(openingCards[gameId]);
    }

    function getDealProgress(uint256 gameId) external view returns (uint16 dealt, uint16 total, bool ready) {
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        dealt = dealtCards[gameId];
        total = uint16(games[gameId].players.length) * START_HAND;
        ready = openingReady[gameId];
    }

    /// @notice Public game state for the confidential frontend. Card values in
    ///         each hand remain opaque and are exposed separately as handles.
    function getGameState(uint256 gameId)
        external
        view
        returns (
            address[] memory players,
            address currentPlayer,
            uint8 turn,
            int8 direction,
            uint256 pot,
            uint256 buyIn,
            Phase phase,
            uint256 topValue,
            uint8 activeColor,
            address winner
        )
    {
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        Game storage g = games[gameId];
        return
            (g.players, g.players[g.turn], g.turn, g.dir, g.pot, g.buyIn, g.phase, g.topValue, g.activeColor, g.winner);
    }

    function getGame(uint256 gameId) external view returns (GameView memory view_) {
        require(gameId != 0 && gameId <= nextGameId, "invalid game");
        Game storage g = games[gameId];
        Lobby storage lobby = lobbies[gameId];
        bytes32[] memory moves = new bytes32[](0);
        view_ = GameView({
            id: gameId,
            creator: lobby.creator,
            players: g.players,
            status: g.phase == Phase.Waiting ? 0 : g.phase == Phase.Finished ? 2 : 1,
            isPrivate: lobby.isPrivate,
            gameCodeHash: lobby.gameCodeHash,
            maxPlayers: lobby.maxPlayers,
            startTime: lobby.startTime,
            endTime: lobby.endTime,
            deckCommitment: bytes32(0),
            moveCommitments: moves
        });
    }

    function getGameCount() external view returns (uint256) {
        return nextGameId;
    }

    function getGamesByCreator(address creator) external view returns (uint256[] memory) {
        return createdGames[creator];
    }

    function getNotStartedGames() external view returns (uint256[] memory) {
        return _listGames(false, false);
    }

    function getPublicNotStartedGames() external view returns (uint256[] memory) {
        return _listGames(false, true);
    }

    function getActiveGames() external view returns (uint256[] memory) {
        return _listGames(true, false);
    }

    function isGamePrivate(uint256 gameId) external view returns (bool) {
        return lobbies[gameId].isPrivate;
    }

    function _listGames(bool active, bool publicOnly) internal view returns (uint256[] memory out) {
        uint256 count;
        for (uint256 id = 1; id <= nextGameId; id++) {
            Game storage g = games[id];
            Lobby storage lobby = lobbies[id];
            bool phaseMatches = active ? g.phase == Phase.Opening || g.phase == Phase.Active : g.phase == Phase.Waiting;
            if (phaseMatches && (!publicOnly || (!lobby.isPrivate && !lobby.isBot))) count++;
        }

        out = new uint256[](count);
        uint256 index;
        for (uint256 id = 1; id <= nextGameId; id++) {
            Game storage g = games[id];
            Lobby storage lobby = lobbies[id];
            bool phaseMatches = active ? g.phase == Phase.Opening || g.phase == Phase.Active : g.phase == Phase.Waiting;
            if (phaseMatches && (!publicOnly || (!lobby.isPrivate && !lobby.isBot))) out[index++] = id;
        }
    }

    // ── Turn helpers ────────────────────────────────────────────────────────────
    function _current(Game storage g) internal view returns (address) {
        return g.players[g.turn];
    }

    function _peekNext(Game storage g) internal view returns (address) {
        return g.players[_nextTurn(g)];
    }

    function _advance(Game storage g) internal {
        g.turn = _nextTurn(g);
    }

    function _nextTurn(Game storage g) internal view returns (uint8) {
        if (g.dir == 1) return uint8((uint256(g.turn) + 1) % g.players.length);
        return g.turn == 0 ? uint8(g.players.length - 1) : g.turn - 1;
    }
}
