// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWormhole} from "../../src/interfaces/IWormhole.sol";
import {ReachMessages} from "../../src/shared/ReachMessages.sol";
import {ReachDestinationGateway} from "../../src/base/ReachDestinationGateway.sol";
import {RemoteWrapperReceipt} from "../../src/base/RemoteWrapperReceipt.sol";
import {ReachNavOracle} from "../../src/base/ReachNavOracle.sol";

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IMorpho {
    function createMarket(MarketParams memory marketParams) external;
    function supply(MarketParams memory, uint256 assets, uint256 shares, address onBehalf, bytes memory data)
        external
        returns (uint256, uint256);
    function supplyCollateral(MarketParams memory, uint256 assets, address onBehalf, bytes memory data) external;
    function borrow(MarketParams memory, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256, uint256);
    function repay(MarketParams memory, uint256 assets, uint256 shares, address onBehalf, bytes memory data)
        external
        returns (uint256, uint256);
    function withdrawCollateral(MarketParams memory, uint256 assets, address onBehalf, address receiver) external;
    function liquidate(MarketParams memory, address borrower, uint256 seizedAssets, uint256 repaidShares, bytes memory data)
        external
        returns (uint256, uint256);
    function isIrmEnabled(address irm) external view returns (bool);
    function isLltvEnabled(uint256 lltv) external view returns (bool);
    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
}

/// @notice LABELLED LOCAL FORK OF BASE MAINNET — technical compatibility evidence only.
///         Uses the real Morpho Blue deployment, real USDC, the real enabled Adaptive Curve
///         IRM and 38.5% LLTV, and the real Base Wormhole Core with a test guardian key
///         written into forked storage. The "Mezo source" is a test emitter address and all
///         liquidity is test-dealt. This is NOT a live market, NOT an adopter, and NOT a
///         recommendation of these risk parameters. Enable with RUN_FORK_BASE_MAINNET=true.
contract MorphoCompatibilityForkTest is Test {
    IMorpho constant MORPHO = IMorpho(0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb);
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    address constant CORE = 0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6;
    uint256 constant LLTV = 0.385e18;
    address constant FAKE_MEZO_WRAPPER = address(0x5EED0001);
    address constant FAKE_MEZO_SOURCE = address(0x5EED0002);

    uint256 guardianKey = 0xC0FFEE;
    bool enabled;
    ReachDestinationGateway dest;
    RemoteWrapperReceipt receipt;
    ReachNavOracle oracle;
    MarketParams params;
    bytes32 marketId;
    uint64 nonce;

    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");
    address liquidator = makeAddr("liquidator");

    function setUp() public {
        enabled = vm.envOr("RUN_FORK_BASE_MAINNET", false);
        if (!enabled) return;
        vm.createSelectFork(vm.envOr("BASE_MAINNET_RPC", string("https://mainnet.base.org")));
        uint32 idx = uint32(uint256(vm.load(CORE, bytes32(uint256(3)))));
        bytes32 setSlot = keccak256(abi.encode(uint256(idx), uint256(2)));
        vm.store(CORE, setSlot, bytes32(uint256(1)));
        vm.store(CORE, keccak256(abi.encode(setSlot)), bytes32(uint256(uint160(vm.addr(guardianKey)))));

        dest = new ReachDestinationGateway(IWormhole(CORE), 50, 31611, FAKE_MEZO_WRAPPER, 202);
        dest.bindSourceGateway(FAKE_MEZO_SOURCE);
        receipt = dest.receipt();
        oracle = new ReachNavOracle(dest, 1 days, 2000, 6, 18);
        params = MarketParams(USDC, address(receipt), address(oracle), IRM, LLTV);
        marketId = keccak256(abi.encode(params));
    }

    modifier forkOnly() {
        if (!enabled) {
            vm.skip(true);
            return;
        }
        _;
    }

    function _vaa(uint8 direction, uint256 shares, address recipient, uint256 navAssets, uint256 navSupply)
        internal
        returns (bytes memory)
    {
        ReachMessages.Message memory m = ReachMessages.Message({
            protocolId: keccak256("MUSD_REACH"),
            version: 1,
            direction: direction,
            originEvmChainId: 31611,
            targetEvmChainId: 8453,
            originWormholeChainId: 50,
            targetWormholeChainId: 30,
            originGateway: FAKE_MEZO_SOURCE,
            targetGateway: address(dest),
            wrapper: FAKE_MEZO_WRAPPER,
            receipt: address(receipt),
            nonce: nonce++,
            shares: shares,
            sender: recipient,
            recipient: recipient,
            redeemMode: 0,
            minAssets: 0,
            navAssets: navAssets,
            navSupply: navSupply,
            navTimestamp: uint64(block.timestamp),
            navBlock: uint64(nonce)
        });
        bytes memory body = abi.encodePacked(
            uint32(block.timestamp), uint32(0), uint16(50), bytes32(uint256(uint160(FAKE_MEZO_SOURCE))), uint64(nonce), uint8(202), abi.encode(m)
        );
        bytes32 digest = keccak256(abi.encodePacked(keccak256(body)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianKey, digest);
        uint32 idx = uint32(uint256(vm.load(CORE, bytes32(uint256(3)))));
        return abi.encodePacked(uint8(1), idx, uint8(1), uint8(0), r, s, uint8(v - 27), body);
    }

    function test_morphoFork_marketParamsAreAcceptedByRealMorpho() public forkOnly {
        assertTrue(MORPHO.isIrmEnabled(IRM));
        assertTrue(MORPHO.isLltvEnabled(LLTV));
        MORPHO.createMarket(params);
    }

    function test_morphoFork_borrowLiquidateAndAsyncExit() public forkOnly {
        // Receipt units issued through an authenticated (fork-guardian) ISSUE VAA at NAV 1.10.
        dest.receiveIssue(_vaa(1, 10_000e18, borrower, 11_000e18, 10_000e18));
        assertEq(receipt.balanceOf(borrower), 10_000e18);
        // value = 10,000 * 1.10 * (1 - 20%) = 8,800 USDC
        assertApproxEqAbs((10_000e18 * oracle.price()) / 1e36, 8_800e6, 1e3);

        MORPHO.createMarket(params);
        deal(USDC, lender, 100_000e6);
        vm.startPrank(lender);
        IERC20(USDC).approve(address(MORPHO), 100_000e6);
        MORPHO.supply(params, 100_000e6, 0, lender, "");
        vm.stopPrank();

        vm.startPrank(borrower);
        receipt.approve(address(MORPHO), 10_000e18);
        MORPHO.supplyCollateral(params, 10_000e18, borrower, "");
        // max borrow = 8,800 * 0.385 = 3,388 USDC
        vm.expectRevert();
        MORPHO.borrow(params, 3_400e6, 0, borrower, borrower);
        MORPHO.borrow(params, 3_300e6, 0, borrower, borrower);
        vm.stopPrank();
        assertEq(IERC20(USDC).balanceOf(borrower), 3_300e6);

        // An authenticated NAV snapshot reports impairment: NAV/share 0.90.
        vm.warp(block.timestamp + 1 hours);
        dest.receiveNav(_vaa(3, 0, address(0), 9_000e18, 10_000e18));
        // value = 10,000 * 0.9 * 0.8 = 7,200 ; liquidation threshold 7,200 * 0.385 = 2,772 < debt

        deal(USDC, liquidator, 10_000e6);
        vm.startPrank(liquidator);
        IERC20(USDC).approve(address(MORPHO), 10_000e6);
        (uint256 seized,) = MORPHO.liquidate(params, borrower, 2_000e18, 0, "");
        vm.stopPrank();
        assertEq(seized, 2_000e18);
        assertEq(receipt.balanceOf(liquidator), 2_000e18, "liquidator holds seized receipts");

        // The liquidator's exit is asynchronous: burn on Base, then an authenticated return
        // message must be delivered on Mezo before any wSMUSD/MUSD is received.
        vm.prank(liquidator);
        (bytes32 redeemId,) = dest.burnAndRedeem(2_000e18, liquidator, 2, 0);
        assertTrue(redeemId != bytes32(0));
        assertEq(receipt.balanceOf(liquidator), 0);
    }

    function test_morphoFork_staleNav_blocksBorrowAndLiquidation() public forkOnly {
        dest.receiveIssue(_vaa(1, 1_000e18, borrower, 1_000e18, 1_000e18));
        MORPHO.createMarket(params);
        deal(USDC, lender, 10_000e6);
        vm.startPrank(lender);
        IERC20(USDC).approve(address(MORPHO), 10_000e6);
        MORPHO.supply(params, 10_000e6, 0, lender, "");
        vm.stopPrank();
        vm.startPrank(borrower);
        receipt.approve(address(MORPHO), 1_000e18);
        MORPHO.supplyCollateral(params, 1_000e18, borrower, "");
        MORPHO.borrow(params, 100e6, 0, borrower, borrower);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        vm.prank(borrower);
        vm.expectRevert();
        MORPHO.borrow(params, 1e6, 0, borrower, borrower);
        vm.prank(liquidator);
        vm.expectRevert();
        MORPHO.liquidate(params, borrower, 1e18, 0, "");
    }
}
