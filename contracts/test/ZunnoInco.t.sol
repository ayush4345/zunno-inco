// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {inco} from "@inco/lightning/src/Lib.sol";
import {ZunnoInco} from "../src/ZunnoInco.sol";

contract ZunnoHarness is ZunnoInco {
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
        game = new ZunnoInco();
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

        assertEq(address(game).balance, 2 ether);
        assertEq(game.feeBalance(), 0);

        vm.prank(alice);
        bytes32[] memory hand = game.getMyHandHandles(gameId);
        assertEq(hand.length, 7);
        for (uint256 i = 0; i < hand.length; i++) {
            assertTrue(inco.persistAllowed(hand[i], alice));
            assertTrue(inco.persistAllowed(hand[i], address(game)));
            assertFalse(inco.persistAllowed(hand[i], bob));
        }
        assertTrue(inco.isRevealed(game.getOpeningHandle()));
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
}
