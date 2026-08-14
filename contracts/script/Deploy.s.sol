// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {ZunnoInco} from "../src/ZunnoInco.sol";

/// @notice Deploy ZunnoInco (+ its ERC-2771 forwarder) to Base Sepolia.
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url base_sepolia --broadcast
/// Requires PRIVATE_KEY in the environment (see .env.example).
contract Deploy is Script {
    function run() external returns (ZunnoInco game, ERC2771Forwarder forwarder) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        forwarder = new ERC2771Forwarder("ZunnoInco");
        game = new ZunnoInco(address(forwarder));
        uint256 funding = game.deckFee(108) * 10;
        game.fundFees{value: funding}();
        console2.log("ERC2771Forwarder deployed:", address(forwarder));
        console2.log("ZunnoInco deployed:", address(game));
        console2.log("Funded ten shuffle fees:", funding);
        vm.stopBroadcast();
    }
}
