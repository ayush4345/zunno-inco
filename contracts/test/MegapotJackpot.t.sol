// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {MockUSDC, MockJackpot, MockRandomTicketBuyer, MegapotHarness} from "./mocks/MegapotMocks.sol";

/// Unit tests for the Megapot jackpot module (no Inco deck needed — the harness
/// exposes `_enterJackpot`). Verifies USDC buy, referral split, and win/lose claim.
contract MegapotJackpotTest is Test {
    uint256 constant PRICE = 1_000_000; // 1 USDC (6 decimals)

    MockUSDC usdc;
    MockJackpot jackpot;
    MockRandomTicketBuyer buyer;
    MegapotHarness h;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address operator = address(0x0FE); // operator referrer wallet

    function setUp() public {
        usdc = new MockUSDC();
        jackpot = new MockJackpot(usdc, PRICE);
        buyer = new MockRandomTicketBuyer(usdc, jackpot);

        h = new MegapotHarness(); // deployer (this) is megapotAdmin
        h.setMegapotConfig(address(usdc), address(jackpot), address(buyer));

        address[] memory refs = new address[](1);
        refs[0] = operator;
        h.setJackpotReferrers(refs);
    }

    function _players() internal view returns (address[] memory p) {
        p = new address[](2);
        p[0] = alice;
        p[1] = bob;
    }

    function test_SkipsWhenUnfunded() public {
        h.enter(1, _players());
        (uint256[] memory ids,, bool entered,) = h.getGameJackpot(1);
        assertFalse(entered, "should not enter unfunded");
        assertEq(ids.length, 0);
    }

    function test_BuysTicketWithReferralSplit() public {
        usdc.mint(address(h), PRICE);
        h.enter(1, _players());

        (uint256[] memory ids, address[] memory players, bool entered, bool claimed) = h.getGameJackpot(1);
        assertTrue(entered, "entered");
        assertFalse(claimed, "not claimed yet");
        assertEq(ids.length, 1, "one ticket");
        assertEq(players.length, 2, "players stored");
        assertEq(usdc.balanceOf(address(h)), 0, "USDC spent on ticket");
        assertEq(usdc.balanceOf(address(buyer)), PRICE, "buyer received USDC");

        // referral split handed to Megapot sums to exactly 1e18
        assertEq(buyer.splitSum(), 1e18, "split sums to PRECISE_UNIT");
        assertEq(buyer.lastReferrers(0), operator, "operator is referrer");
        assertEq(buyer.lastSource(), keccak256("zunno-inco"), "source tag");
    }

    function test_IdempotentEntry() public {
        usdc.mint(address(h), 2 * PRICE);
        h.enter(1, _players());
        h.enter(1, _players()); // second call is a no-op
        assertEq(usdc.balanceOf(address(buyer)), PRICE, "only one ticket bought");
    }

    function test_ClaimSplitsWinningsEqually() public {
        usdc.mint(address(h), PRICE);
        h.enter(1, _players());

        jackpot.setPrize(100_000_000); // 100 USDC prize
        h.claimGameJackpot(1);

        assertEq(usdc.balanceOf(alice), 50_000_000, "alice half");
        assertEq(usdc.balanceOf(bob), 50_000_000, "bob half");
        (,,, bool claimed) = h.getGameJackpot(1);
        assertTrue(claimed, "claimed");
    }

    function test_ClaimOddAmountRemainderToLast() public {
        usdc.mint(address(h), PRICE);
        h.enter(1, _players());

        jackpot.setPrize(101); // not divisible by 2
        h.claimGameJackpot(1);

        assertEq(usdc.balanceOf(alice), 50, "alice floor");
        assertEq(usdc.balanceOf(bob), 51, "bob gets remainder");
    }

    function test_LosingTicketClaimReverts_KeepsRetryable() public {
        usdc.mint(address(h), PRICE);
        h.enter(1, _players());

        // prize == 0 -> mock reverts like Megapot for a losing/unsettled ticket
        vm.expectRevert(bytes("no winnings"));
        h.claimGameJackpot(1);

        // claimed flag rolled back by the revert -> still retryable later
        (,,, bool claimed) = h.getGameJackpot(1);
        assertFalse(claimed, "claimed rolled back on revert");
    }

    function test_DoubleClaimBlocked() public {
        usdc.mint(address(h), PRICE);
        h.enter(1, _players());
        jackpot.setPrize(10_000_000);
        h.claimGameJackpot(1);

        vm.expectRevert(bytes("nothing to claim"));
        h.claimGameJackpot(1);
    }

    function test_OnlyAdminConfig() public {
        vm.prank(alice);
        vm.expectRevert(bytes("not megapot admin"));
        h.setMegapotConfig(address(usdc), address(jackpot), address(buyer));
    }
}
