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

        vm.expectRevert("fund shuffle fee via fundFees()");
        game.startGame(gameId);

        uint256 fee = game.deckFee(108);
        game.fundFees{value: fee}();
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

    function testReverseFromTurnZeroWrapsToLastPlayer() public {
        ZunnoHarness harness = new ZunnoHarness();
        assertEq(harness.reverseFromZero(alice, bob), 1);
    }
}
