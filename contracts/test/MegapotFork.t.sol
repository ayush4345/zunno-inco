// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IMegapotJackpot} from "../src/MegapotJackpot.sol";

/// Live sanity check for the Base Sepolia addresses baked into `MegapotJackpot`:
/// confirms they are deployed contracts that respond as expected, so a stale or
/// wrong default fails CI instead of silently no-op'ing `enterJackpot` on-chain.
/// Requires BASE_SEPOLIA_RPC; skips (no-op pass) when it isn't set.
contract MegapotForkTest is Test {
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant JACKPOT = 0x465dA3c859f193A3807386387bEE941B2A4c3279;
    address constant TICKET_BUYER = 0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746;

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
    }

    function test_DefaultAddressesAreLiveContracts() public {
        if (!forked) return;
        assertGt(USDC.code.length, 0, "usdc: no code at default address");
        assertGt(JACKPOT.code.length, 0, "jackpot: no code at default address");
        assertGt(TICKET_BUYER.code.length, 0, "ticketBuyer: no code at default address");
    }

    function test_JackpotRespondsWithTicketPrice() public {
        if (!forked) return;
        uint256 price = IMegapotJackpot(JACKPOT).ticketPrice();
        assertGt(price, 0, "ticketPrice should be > 0");
    }

    function test_UsdcLooksLikeUsdc() public {
        if (!forked) return;
        assertEq(IERC20Metadata(USDC).decimals(), 6, "expected 6-decimal USDC");
    }
}
