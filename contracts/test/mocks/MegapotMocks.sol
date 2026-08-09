// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {MegapotJackpot} from "../../src/MegapotJackpot.sol";

/// Minimal USDC-like ERC20 (6 decimals) for tests.
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt, "balance");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        require(balanceOf[from] >= amt, "balance");
        uint256 a = allowance[from][msg.sender];
        require(a >= amt, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

/// Mock Megapot core: fixed ticket price; claimWinnings pays a settable prize.
contract MockJackpot {
    MockUSDC public usdc;
    uint256 public price;
    uint256 public prize; // USDC paid out on next claimWinnings call

    constructor(MockUSDC _usdc, uint256 _price) {
        usdc = _usdc;
        price = _price;
    }

    function setPrize(uint256 p) external {
        prize = p;
    }

    function ticketPrice() external view returns (uint256) {
        return price;
    }

    function getTicketTierIds(uint256[] calldata ids) external pure returns (uint256[] memory tiers) {
        tiers = new uint256[](ids.length);
    }

    function claimWinnings(uint256[] calldata) external {
        require(prize > 0, "no winnings"); // mirrors Megapot reverting for losers
        uint256 p = prize;
        prize = 0;
        require(usdc.transfer(msg.sender, p), "prize out");
    }
}

/// Mock random-ticket buyer: pulls price*count USDC from caller, records the
/// referral split it was handed, and mints sequential ticket ids.
contract MockRandomTicketBuyer {
    MockUSDC public usdc;
    MockJackpot public jackpot;
    uint256 public nextId = 1;

    address[] public lastReferrers;
    uint256[] public lastSplit;
    bytes32 public lastSource;

    constructor(MockUSDC _usdc, MockJackpot _jackpot) {
        usdc = _usdc;
        jackpot = _jackpot;
    }

    function buyTickets(
        uint256 count,
        address, /* recipient */
        address[] calldata referrers,
        uint256[] calldata referralSplit,
        bytes32 source
    ) external returns (uint256[] memory ids) {
        uint256 cost = jackpot.ticketPrice() * count;
        require(usdc.transferFrom(msg.sender, address(this), cost), "pull usdc");
        lastReferrers = referrers;
        lastSplit = referralSplit;
        lastSource = source;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = nextId++;
        }
    }

    function splitSum() external view returns (uint256 s) {
        for (uint256 i = 0; i < lastSplit.length; i++) {
            s += lastSplit[i];
        }
    }
}

/// Test-only harness exposing the internal jackpot entry.
contract MegapotHarness is MegapotJackpot {
    function enter(uint256 gameId, address[] calldata players) external {
        _enterJackpot(gameId, players);
    }
}
