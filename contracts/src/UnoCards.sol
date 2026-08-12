// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title UnoCards — pure card codec + legality rules for UNO
/// @notice Plaintext helpers only (no confidential ops). A card is a value
///         1..108 as dealt by ConfidentialDeck's shuffledRange(1, 109).
///         id = value - 1, laid out as:
///           - id 0..99   : 4 colors x 25 cards  (color = id / 25)
///           - id 100..103: Wild
///           - id 104..107: Wild Draw Four
///         Within a color (w = id % 25):
///           w == 0            -> number 0
///           w in 1..18        -> numbers 1..9 (two each): number = (w + 1) / 2
///           w in 19..20       -> Skip
///           w in 21..22       -> Reverse
///           w in 23..24       -> Draw Two
library UnoCards {
    uint8 constant COLOR_WILD = 4; // 0=Red 1=Yellow 2=Green 3=Blue, 4=wild/none

    // kinds
    uint8 constant NUMBER = 0;
    uint8 constant SKIP = 1;
    uint8 constant REVERSE = 2;
    uint8 constant DRAW_TWO = 3;
    uint8 constant WILD = 4;
    uint8 constant WILD_DRAW_FOUR = 5;

    struct Card {
        uint8 color; // 0..3, or 4 for wild
        uint8 kind; // one of the constants above
        uint8 number; // 0..9 (valid only when kind == NUMBER)
    }

    function decode(uint256 value) internal pure returns (Card memory c) {
        require(value >= 1 && value <= 108, "card out of range");
        uint256 id = value - 1;
        if (id >= 100) {
            c.color = COLOR_WILD;
            c.number = type(uint8).max;
            c.kind = id < 104 ? WILD : WILD_DRAW_FOUR;
            return c;
        }
        c.color = uint8(id / 25);
        uint256 w = id % 25;
        if (w == 0) {
            c.kind = NUMBER;
            c.number = 0;
        } else if (w <= 18) {
            c.kind = NUMBER;
            c.number = uint8((w + 1) / 2); // 1,2->1 ... 17,18->9
        } else if (w <= 20) {
            c.kind = SKIP;
        } else if (w <= 22) {
            c.kind = REVERSE;
        } else {
            c.kind = DRAW_TWO;
        }
    }

    function isWild(uint256 value) internal pure returns (bool) {
        return value >= 101; // ids 100..107
    }

    /// @notice Can `played` be placed on top of the current pile?
    /// @param played       the card the player wants to play (1..108)
    /// @param topValue     the card currently on top of the discard pile
    /// @param activeColor  the color in force (top's color, or a wild's chosen color)
    function isPlayable(uint256 played, uint256 topValue, uint8 activeColor)
        internal
        pure
        returns (bool)
    {
        Card memory p = decode(played);
        if (p.kind == WILD || p.kind == WILD_DRAW_FOUR) return true; // wilds always ok
        if (p.color == activeColor) return true; // color match
        Card memory t = decode(topValue);
        if (p.kind == NUMBER && t.kind == NUMBER && p.number == t.number) return true; // number match
        if (p.kind != NUMBER && p.kind == t.kind) return true; // same action symbol
        return false;
    }
}
