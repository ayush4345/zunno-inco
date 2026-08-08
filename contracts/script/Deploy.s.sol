// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ZunnoInco} from "../src/ZunnoInco.sol";

/// @notice Deploy ZunnoInco to Base Sepolia.
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url base_sepolia --broadcast
/// Requires PRIVATE_KEY in the environment (see .env.example).
contract Deploy is Script {
    function run() external returns (ZunnoInco game) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        game = new ZunnoInco();
        uint256 funding = game.deckFee(108) * 10;
        game.fundFees{value: funding}();
        console2.log("ZunnoInco deployed:", address(game));
        console2.log("Funded ten shuffle fees:", funding);
        vm.stopBroadcast();
    }
}
