// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UnoCards} from "../src/UnoCards.sol";

/// @notice Pure-logic tests for the UNO card codec + legality rules.
/// These run WITHOUT any Inco/confidential dependency (`forge test`).
contract UnoCardsTest is Test {
    // ── decode ────────────────────────────────────────────────────────────────
    function test_decode_red_zero() public {
        UnoCards.Card memory c = UnoCards.decode(1); // id 0
        assertEq(c.color, 0);
        assertEq(c.kind, UnoCards.NUMBER);
        assertEq(c.number, 0);
    }

    function test_decode_red_five() public {
        UnoCards.Card memory c = UnoCards.decode(10); // id 9 -> number 5
        assertEq(c.color, 0);
        assertEq(c.kind, UnoCards.NUMBER);
        assertEq(c.number, 5);
    }

    function test_decode_red_skip() public {
        UnoCards.Card memory c = UnoCards.decode(20); // id 19
        assertEq(c.color, 0);
        assertEq(c.kind, UnoCards.SKIP);
    }

    function test_decode_blue_five() public {
        UnoCards.Card memory c = UnoCards.decode(85); // id 84 -> color 3, number 5
        assertEq(c.color, 3);
        assertEq(c.number, 5);
    }

    function test_decode_wilds() public {
        assertEq(UnoCards.decode(101).kind, UnoCards.WILD); // id 100
        assertEq(UnoCards.decode(105).kind, UnoCards.WILD_DRAW_FOUR); // id 104
        assertTrue(UnoCards.isWild(101));
        assertTrue(UnoCards.isWild(105));
        assertFalse(UnoCards.isWild(10));
    }

    // ── legality ────────────────────────────────────────────────────────────────
    function test_playable_colorMatch() public {
        // Red 5 on Red 3, active color red(0)
        assertTrue(UnoCards.isPlayable(10, 6, 0));
    }

    function test_playable_numberMatch_acrossColors() public {
        // Blue 5 on Red 5, active color red(0): colors differ but number matches
        assertTrue(UnoCards.isPlayable(85, 10, 0));
    }

    function test_playable_actionSymbolMatch() public {
        // Red Skip(20) on Blue Skip(95), active color blue(3): same action kind
        assertTrue(UnoCards.isPlayable(20, 95, 3));
    }

    function test_playable_wildAlways() public {
        assertTrue(UnoCards.isPlayable(101, 6, 0)); // Wild
        assertTrue(UnoCards.isPlayable(105, 85, 3)); // Wild Draw Four
    }

    function test_illegal_noMatch() public {
        // Blue 5 on Red 3, active color red(0): different color, different number
        assertFalse(UnoCards.isPlayable(85, 6, 0));
    }
}
