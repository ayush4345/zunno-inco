// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {inco} from "@inco/lightning/src/Lib.sol";
import {ZunnoInco} from "../src/ZunnoInco.sol";

contract ZunnoHarness is ZunnoInco {
    constructor() ZunnoInco(address(0)) {}

    function reverseFromZero(address first, address second) external returns (uint8) {
        Game storage g = games[++nextGameId];
        g.players.push(first);
        g.players.push(second);
        g.dir = -1;
        _advance(g);
        return g.turn;
    }
}

contract ZunnoIncoTest is IncoTest {
    ZunnoInco game;

    function setUp() public override {
        super.setUp();
        game = new ZunnoInco(address(0));
        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);
    }

    function testShuffleFundingIsSeparateFromEscrowAndHandsStayPrivate() public {
        vm.prank(alice);
        uint256 gameId = game.createGame{value: 1 ether}(1 ether);
        vm.prank(bob);
        game.joinGame{value: 1 ether}(gameId);

        vm.prank(alice);
        vm.expectRevert("fund shuffle fee via fundFees()");
        game.startGame(gameId);

        uint256 fee = game.deckFee(108);
        game.fundFees{value: fee}();
        vm.prank(alice);
        game.startGame(gameId);

        (uint16 dealt, uint16 total, bool ready) = game.getDealProgress(gameId);
        assertEq(dealt, 0);
        assertEq(total, 8);
        assertFalse(ready);
        while (!ready) {
            game.dealCards(gameId, 4);
            (dealt, total, ready) = game.getDealProgress(gameId);
        }
        assertEq(dealt, total);

        assertEq(address(game).balance, 2 ether);
        assertEq(game.feeBalance(), 0);

        vm.prank(alice);
        bytes32[] memory hand = game.getMyHandHandles(gameId);
        assertEq(hand.length, 4);
        for (uint256 i = 0; i < hand.length; i++) {
            assertTrue(inco.persistAllowed(hand[i], alice));
            assertTrue(inco.persistAllowed(hand[i], address(game)));
            assertFalse(inco.persistAllowed(hand[i], bob));
        }
        uint256[] memory handSizes = game.getHandSizes(gameId);
        assertEq(handSizes.length, 2);
        assertEq(handSizes[0], 4);
        assertEq(handSizes[1], 4);
        assertTrue(inco.isRevealed(game.getOpeningHandle(gameId)));
    }

    function testGamesUseIndependentDecks() public {
        vm.startPrank(alice);
        uint256 first = game.createGame(0);
        uint256 second = game.createGame(0);
        vm.stopPrank();
        vm.startPrank(bob);
        game.joinGame(first);
        game.joinGame(second);
        vm.stopPrank();

        game.fundFees{value: game.deckFee(108) * 2}();
        vm.startPrank(alice);
        game.startGame(first);
        game.startGame(second);
        vm.stopPrank();

        game.dealCards(first, 4);
        (uint16 firstDealt,,) = game.getDealProgress(first);
        (uint16 secondDealt,,) = game.getDealProgress(second);
        assertEq(firstDealt, 4);
        assertEq(secondDealt, 0);

        game.dealCards(second, 4);
        game.dealCards(first, 4);
        game.dealCards(second, 4);

        bytes32 firstOpening = game.getOpeningHandle(first);
        bytes32 secondOpening = game.getOpeningHandle(second);
        assertNotEq(firstOpening, secondOpening);
        assertTrue(inco.isRevealed(firstOpening));
        assertTrue(inco.isRevealed(secondOpening));
        assertEq(game.getHandSizes(first)[0], 4);
        assertEq(game.getHandSizes(second)[0], 4);
    }

    function testDealBatchIsBounded() public {
        vm.prank(alice);
        uint256 gameId = game.createGame(0);
        vm.prank(bob);
        game.joinGame(gameId);
        game.fundFees{value: game.deckFee(108)}();
        vm.prank(alice);
        game.startGame(gameId);

        vm.expectRevert("bad batch");
        game.dealCards(gameId, 9);
    }

    function testOnlyCreatorStartsAndGameStateListsPlayers() public {
        vm.prank(alice);
        uint256 gameId = game.createGame(0);
        vm.prank(bob);
        game.joinGame(gameId);

        vm.prank(bob);
        vm.expectRevert("not creator");
        game.startGame(gameId);

        (address[] memory players, address currentPlayer,,,,,,,,) = game.getGameState(gameId);
        assertEq(players.length, 2);
        assertEq(players[0], alice);
        assertEq(players[1], bob);
        assertEq(currentPlayer, alice);
    }

    function testPortedUiLobbyFunctionsKeepSenderAsIdentity() public {
        vm.prank(alice);
        uint256 publicId = game.createGame(alice, false, false, bytes32(0), 4);

        vm.prank(bob);
        game.joinGame(publicId, bob);

        ZunnoInco.GameView memory view_ = game.getGame(publicId);
        assertEq(view_.creator, alice);
        assertEq(view_.players.length, 2);
        assertEq(game.getPublicNotStartedGames()[0], publicId);
        assertEq(game.getGamesByCreator(alice)[0], publicId);

        vm.prank(bob);
        vm.expectRevert("creator != sender");
        game.createGame(alice, true);
    }

    function testReverseFromTurnZeroWrapsToLastPlayer() public {
        ZunnoHarness harness = new ZunnoHarness();
        assertEq(harness.reverseFromZero(alice, bob), 1);
    }

    function testLobbyRejectsMorePlayersThanTheClientCanRender() public {
        vm.prank(alice);
        vm.expectRevert("max players");
        game.createGame(alice, false, false, bytes32(0), 5);
    }

    function testJoinAsBotOnlyOperatorOnBotLobbies() public {
        vm.prank(alice);
        uint256 botGameId = game.createGame(alice, true);

        // botOperator unset (zero address) — nobody can seat a bot yet.
        vm.expectRevert("not bot operator");
        game.joinAsBot(botGameId, carol);

        game.setBotOperator(carol); // test contract deployed `game`, so it's megapotAdmin

        // Only the configured operator may call joinAsBot.
        vm.prank(bob);
        vm.expectRevert("not bot operator");
        game.joinAsBot(botGameId, carol);

        // A human can't join a bot lobby through the normal path.
        vm.prank(bob);
        vm.expectRevert("bot game");
        game.joinGame(botGameId);

        // joinAsBot only works on isBot lobbies.
        vm.prank(alice);
        uint256 humanGameId = game.createGame(alice, false);
        vm.prank(carol);
        vm.expectRevert("bot game");
        game.joinAsBot(humanGameId, carol);

        // Operator seats the bot; lobby is now startable at 2 players.
        vm.prank(carol);
        game.joinAsBot(botGameId, carol);

        (address[] memory players,,,,,,,,,) = game.getGameState(botGameId);
        assertEq(players.length, 2);
        assertEq(players[0], alice);
        assertEq(players[1], carol);

        uint256 fee = game.deckFee(108);
        game.fundFees{value: fee}();
        vm.prank(alice);
        game.startGame(botGameId);
    }
}
