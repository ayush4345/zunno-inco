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

    elist internal deck;
    uint16 internal drawIndex;

    /// @notice Fee for shuffledRange(1, n+1): range + shuffle.
    function deckFee(uint16 n) public pure returns (uint256) {
        return 2 * inco.getEListFee(n, ETypes.Uint256);
    }

    function _newShuffledDeck(uint16 n) internal {
        require(n > 0, "empty deck");
        deck = e.shuffledRange(1, n + 1, ETypes.Uint256);
        e.allow(deck, address(this));
        drawIndex = 0;
    }

    function _draw() internal returns (euint256 card) {
        require(drawIndex < e.length(deck), "deck empty");
        card = e.getEuint256(deck, drawIndex);
        drawIndex += 1;
        e.allowThis(card);
    }

    function _dealTo(address player) internal returns (euint256 card) {
        card = _draw();
        e.allow(card, player);
    }

    function _revealCard(euint256 card) internal {
        e.allowThis(card);
        e.reveal(card);
    }

    function _dealFaceUp() internal returns (euint256 card) {
        card = _draw();
        _revealCard(card);
    }

    function _verifyValue(euint256 card, uint256 value, bytes[] calldata sigs) internal view returns (uint256) {
        require(e.verifyDecryption(card, value, sigs), "bad attestation");
        return value;
    }
}
