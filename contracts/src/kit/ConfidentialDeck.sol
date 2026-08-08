// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {euint256, elist, ETypes, e, inco} from "@inco/lightning/src/Lib.sol";

/// @notice Base kit for hidden-card games on Inco Lightning.
/// Inherit and write only your game rules.
/// Source: Inco ConfidentialDeck template (MIT). Vendored so the project builds;
/// keep in sync with upstream.
abstract contract ConfidentialDeck {
    using e for euint256;
    using e for elist;

    struct DeckState {
        elist cards;
        uint16 drawIndex;
    }

    mapping(uint256 => DeckState) internal decks;

    /// @notice Fee for shuffledRange(1, n+1): range + shuffle.
    function deckFee(uint16 n) public pure returns (uint256) {
        return 2 * inco.getEListFee(n, ETypes.Uint256);
    }

    function _newShuffledDeck(uint256 gameId, uint16 n) internal {
        require(n > 0, "empty deck");
        DeckState storage state = decks[gameId];
        state.cards = e.shuffledRange(1, n + 1, ETypes.Uint256);
        e.allow(state.cards, address(this));
        state.drawIndex = 0;
    }

    function _draw(uint256 gameId) internal returns (euint256 card) {
        DeckState storage state = decks[gameId];
        require(state.drawIndex < e.length(state.cards), "deck empty");
        card = e.getEuint256(state.cards, state.drawIndex);
        state.drawIndex += 1;
        e.allowThis(card);
    }

    function _dealTo(uint256 gameId, address player) internal returns (euint256 card) {
        card = _draw(gameId);
        e.allow(card, player);
    }

    function _revealCard(euint256 card) internal {
        e.allowThis(card);
        e.reveal(card);
    }

    function _dealFaceUp(uint256 gameId) internal returns (euint256 card) {
        card = _draw(gameId);
        _revealCard(card);
    }

    function _verifyValue(euint256 card, uint256 value, bytes[] calldata sigs) internal view returns (uint256) {
        require(e.verifyDecryption(card, value, sigs), "bad attestation");
        return value;
    }
}
