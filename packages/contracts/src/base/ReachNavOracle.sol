// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReachDestinationGateway} from "./ReachDestinationGateway.sol";

/// @notice Morpho Blue oracle interface: price of 1 collateral base unit in loan base units,
///         scaled by 1e36.
interface IMorphoOracle {
    function price() external view returns (uint256);
}

/// @title ReachNavOracle — RESEARCH / COMPATIBILITY HARNESS, NOT A PRODUCTION RISK ORACLE
/// @notice Prices rwSMUSD from the freshest guardian-attested wrapper NAV snapshot held by
///         the ReachDestinationGateway, minus a fixed haircut.
/// @dev    Known, disclosed limitations that make this unsuitable for a live market without
///         independent risk review:
///           - Values MUSD at par with the loan token (no MUSD/USD feed).
///           - The haircut is static; it does not model redemption latency, bridge risk,
///             receipt illiquidity or native vault impairment dynamically.
///           - Reverts when NAV is missing or stale, which in Morpho Blue blocks new borrows
///             AND liquidations until a fresh NAV is delivered.
contract ReachNavOracle is IMorphoOracle {
    ReachDestinationGateway public immutable gateway;
    uint256 public immutable maxAge;
    uint256 public immutable haircutBps;
    uint256 public immutable scaleFactor;

    uint256 internal constant BPS = 10_000;

    error NavUnavailable();
    error NavStale(uint256 age, uint256 maxAge);
    error InvalidConfig();

    constructor(
        ReachDestinationGateway gateway_,
        uint256 maxAge_,
        uint256 haircutBps_,
        uint8 loanTokenDecimals,
        uint8 collateralDecimals
    ) {
        if (address(gateway_) == address(0) || maxAge_ == 0 || haircutBps_ >= BPS) {
            revert InvalidConfig();
        }
        if (36 + uint256(loanTokenDecimals) < uint256(collateralDecimals)) revert InvalidConfig();
        gateway = gateway_;
        maxAge = maxAge_;
        haircutBps = haircutBps_;
        scaleFactor = 10 ** (36 + uint256(loanTokenDecimals) - uint256(collateralDecimals));
    }

    /// @notice Unhaircut NAV per wSMUSD base unit, scaled like `price()`.
    function navPrice() public view returns (uint256) {
        if (!gateway.hasNav()) revert NavUnavailable();
        (uint256 assets, uint256 supply, uint64 timestamp,,) = gateway.latestNav();
        // Mezo and destination clocks are independent; a snapshot slightly in the future is
        // treated as age zero.
        uint256 age = block.timestamp > timestamp ? block.timestamp - timestamp : 0;
        if (age > maxAge) revert NavStale(age, maxAge);
        // Same virtual offset as the wrapper's ERC-4626 conversion.
        return Math.mulDiv(assets + 1, scaleFactor, supply + 1);
    }

    function price() external view override returns (uint256) {
        return Math.mulDiv(navPrice(), BPS - haircutBps, BPS);
    }
}
