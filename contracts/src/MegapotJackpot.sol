// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Immediate random-ticket buyer (USDC). Approve USDC to this contract, then call.
interface IJackpotRandomTicketBuyer {
    function buyTickets(
        uint256 count,
        address recipient,
        address[] calldata referrers,
        uint256[] calldata referralSplit,
        bytes32 source
    ) external returns (uint256[] memory ticketIds);
}

/// Core Megapot lottery reads/claims used here.
interface IMegapotJackpot {
    function ticketPrice() external view returns (uint256);
    function claimWinnings(uint256[] calldata ticketIds) external;
    function getTicketTierIds(uint256[] calldata ticketIds) external view returns (uint256[] memory);
}

/// @title MegapotJackpot — every Zunno table buys a Megapot lottery ticket (USDC).
/// @notice Confidential UNO settles its ETH pot as usual; SEPARATELY, each game
///         buys one random Megapot ticket in USDC, owned by this contract. If the
///         ticket wins the daily draw, `claimGameJackpot` splits the USDC across
///         that game's players. The operator (Khel.fun) is set as the Megapot
///         `referrer`, earning purchase fees + win share.
/// @dev Defaults are Base Sepolia (chain 84532). The admin can repoint to mainnet
///      and set the real referrer wallet. Ticket buys are best-effort: if the
///      contract is not funded with USDC, entry is skipped silently so the game
///      is never blocked. Fund via `fundJackpot`.
abstract contract MegapotJackpot {
    // ── Megapot config (Base Sepolia defaults) ────────────────────────────────
    IERC20 public usdc = IERC20(0x036CbD53842c5426634e7929541eC2318f3dCF7e);
    IMegapotJackpot public jackpot = IMegapotJackpot(0x465dA3c859f193A3807386387bEE941B2A4c3279);
    IJackpotRandomTicketBuyer public ticketBuyer =
        IJackpotRandomTicketBuyer(0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746);
    bytes32 public constant JACKPOT_SOURCE = keccak256("zunno-inco");

    address[] public jackpotReferrers; // operator revenue wallet(s)
    address public megapotAdmin;

    struct GameJackpot {
        uint256[] ticketIds;
        address[] players;
        bool entered;
        bool claimed;
    }

    mapping(uint256 => GameJackpot) internal gameJackpots;

    event JackpotEntered(uint256 indexed gameId, uint256 ticketCount);
    event JackpotSkipped(uint256 indexed gameId, string reason);
    event JackpotClaimed(uint256 indexed gameId, uint256 amount);

    constructor() {
        megapotAdmin = msg.sender;
        jackpotReferrers.push(msg.sender); // default referrer = deployer; repoint to Khel.fun wallet
    }

    modifier onlyMegapotAdmin() {
        require(msg.sender == megapotAdmin, "not megapot admin");
        _;
    }

    // ── Admin config ──────────────────────────────────────────────────────────
    function setMegapotConfig(address _usdc, address _jackpot, address _buyer) external onlyMegapotAdmin {
        usdc = IERC20(_usdc);
        jackpot = IMegapotJackpot(_jackpot);
        ticketBuyer = IJackpotRandomTicketBuyer(_buyer);
    }

    function setJackpotReferrers(address[] calldata refs) external onlyMegapotAdmin {
        require(refs.length >= 1 && refs.length <= 5, "1..5 referrers");
        delete jackpotReferrers;
        for (uint256 i = 0; i < refs.length; i++) {
            jackpotReferrers.push(refs[i]);
        }
    }

    function transferMegapotAdmin(address next) external onlyMegapotAdmin {
        require(next != address(0), "zero admin");
        megapotAdmin = next;
    }

    /// @notice Fund the contract with USDC to sponsor jackpot tickets.
    function fundJackpot(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc in");
    }

    // ── Entry ─────────────────────────────────────────────────────────────────
    /// @dev Buy ONE random Megapot ticket in USDC for `players`, owned by this
    ///      contract. Idempotent per game; skips silently if under-funded.
    function _enterJackpot(uint256 gameId, address[] memory players) internal {
        GameJackpot storage j = gameJackpots[gameId];
        if (j.entered) return;

        uint256 price = jackpot.ticketPrice();
        if (usdc.balanceOf(address(this)) < price) {
            emit JackpotSkipped(gameId, "unfunded");
            return;
        }

        require(usdc.approve(address(ticketBuyer), price), "approve");
        uint256[] memory ids =
            ticketBuyer.buyTickets(1, address(this), jackpotReferrers, _fullSplit(jackpotReferrers.length), JACKPOT_SOURCE);

        j.ticketIds = ids;
        j.players = players;
        j.entered = true;
        emit JackpotEntered(gameId, ids.length);
    }

    /// @notice Claim the table's Megapot winnings after the daily draw settles and
    ///         split the USDC equally across the game's players. Reverts if the
    ///         ticket did not win / the drawing has not settled — check the tier
    ///         off-chain (Megapot Data API) before calling.
    function claimGameJackpot(uint256 gameId) external {
        GameJackpot storage j = gameJackpots[gameId];
        require(j.entered && !j.claimed, "nothing to claim");
        j.claimed = true; // checks-effects; reverts roll this back so retry stays possible

        uint256 before = usdc.balanceOf(address(this));
        jackpot.claimWinnings(j.ticketIds);
        uint256 won = usdc.balanceOf(address(this)) - before;

        if (won == 0) {
            emit JackpotClaimed(gameId, 0);
            return;
        }

        uint256 n = j.players.length;
        uint256 share = won / n;
        for (uint256 i = 0; i < n; i++) {
            uint256 amt = i == n - 1 ? won - share * (n - 1) : share; // remainder to last
            require(usdc.transfer(j.players[i], amt), "usdc out");
        }
        emit JackpotClaimed(gameId, won);
    }

    // ── Views ───────────────────────────────────────────────────────────────────
    function getGameJackpot(uint256 gameId)
        external
        view
        returns (uint256[] memory ticketIds, address[] memory players, bool entered, bool claimed)
    {
        GameJackpot storage j = gameJackpots[gameId];
        return (j.ticketIds, j.players, j.entered, j.claimed);
    }

    // ── Internal ────────────────────────────────────────────────────────────────
    /// @dev Equal-weight referral split summing to exactly 1e18 (PRECISE_UNIT).
    function _fullSplit(uint256 n) private pure returns (uint256[] memory split) {
        split = new uint256[](n);
        if (n == 0) return split;
        uint256 unit = uint256(1e18) / n;
        uint256 acc;
        for (uint256 i = 0; i < n - 1; i++) {
            split[i] = unit;
            acc += unit;
        }
        split[n - 1] = uint256(1e18) - acc; // remainder to last -> sum == 1e18
    }
}
