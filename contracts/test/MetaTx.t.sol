// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {ZunnoInco} from "../src/ZunnoInco.sol";

/// @dev Test-only: lets us reach Phase.Active without generating a real Inco
///      covalidator attestation for `commitOpening` (unrelated to what this
///      file is checking — the `_msgSender()` plumbing, identical for
///      `drawCard` and `playCard`, is proven once via `drawCard`).
contract ZunnoMetaTxHarness is ZunnoInco {
    constructor(address trustedForwarder) ZunnoInco(trustedForwarder) {}

    function forceActivePhase(uint256 gameId) external {
        games[gameId].phase = Phase.Active;
    }
}

contract MetaTxTest is IncoTest {
    bytes32 constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );

    ERC2771Forwarder forwarder;
    ZunnoMetaTxHarness game;
    uint256 gameId;

    function setUp() public override {
        super.setUp();
        forwarder = new ERC2771Forwarder("ZunnoInco");
        game = new ZunnoMetaTxHarness(address(forwarder));
        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);

        vm.prank(alice);
        gameId = game.createGame(0);
        vm.prank(bob);
        game.joinGame(gameId);
        game.fundFees{value: game.deckFee(108)}();
        vm.prank(alice);
        game.startGame(gameId); // Opening phase, real shuffled Inco deck live

        game.forceActivePhase(gameId); // skip commitOpening's attestation step
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ZunnoInco")),
                keccak256(bytes("1")),
                block.chainid,
                address(forwarder)
            )
        );
    }

    function _signRequest(uint256 signerPrivKey, address from, bytes memory data)
        internal
        view
        returns (ERC2771Forwarder.ForwardRequestData memory req)
    {
        uint256 nonce = forwarder.nonces(from);
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes32 structHash = keccak256(
            abi.encode(FORWARD_REQUEST_TYPEHASH, from, address(game), uint256(0), uint256(300_000), nonce, deadline, keccak256(data))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivKey, digest);
        req = ERC2771Forwarder.ForwardRequestData({
            from: from,
            to: address(game),
            value: 0,
            gas: 300_000,
            deadline: deadline,
            data: data,
            signature: abi.encodePacked(r, s, v)
        });
    }

    function testGameTrustsOnlyItsDeployedForwarder() public {
        assertTrue(game.isTrustedForwarder(address(forwarder)));
        assertFalse(game.isTrustedForwarder(carol));
    }

    function testDrawCardViaForwarderResolvesRealPlayerNotRelayer() public {
        // alice is turn 0; she signs off-chain, carol (an unrelated relayer) submits and pays gas.
        bytes memory data = abi.encodeCall(ZunnoInco.drawCard, (gameId));
        ERC2771Forwarder.ForwardRequestData memory req = _signRequest(alicePrivKey, alice, data);

        vm.prank(carol);
        vm.expectEmit(true, true, false, false, address(game));
        emit ZunnoInco.CardDrawn(gameId, alice);
        forwarder.execute(req);

        uint256[] memory sizes = game.getHandSizes(gameId);
        assertEq(sizes[0], 1, "card landed in alice's hand, not carol's");
        (,, uint8 turn,,,,,,,) = game.getGameState(gameId);
        assertEq(turn, 1, "turn advanced past alice");
    }

    function testForwarderRejectsRequestWhoseSignerDoesNotMatchFrom() public {
        bytes memory data = abi.encodeCall(ZunnoInco.drawCard, (gameId));
        // signed by bob's key but claims to be from alice
        ERC2771Forwarder.ForwardRequestData memory req = _signRequest(bobPrivKey, alice, data);

        vm.expectRevert();
        forwarder.execute(req);
    }

    function testDirectCallWithoutForwarderStillEnforcesTurnByRealSender() public {
        // carol is not the current player and did not go through the forwarder.
        vm.prank(carol);
        vm.expectRevert("not your turn");
        game.drawCard(gameId);

        // alice can still call directly herself, unaffected by meta-tx support.
        vm.prank(alice);
        game.drawCard(gameId);
        assertEq(game.getHandSizes(gameId)[0], 1);
    }
}
