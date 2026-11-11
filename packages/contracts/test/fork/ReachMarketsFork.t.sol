// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReachMessages} from "../../src/shared/ReachMessages.sol";
import {ReachDestinationGateway} from "../../src/base/ReachDestinationGateway.sol";
import {ReachNavOracle} from "../../src/base/ReachNavOracle.sol";
import {DeployReachMarkets, MarketParams} from "../../script/DeployReachMarkets.s.sol";

interface IMorphoMarkets {
    function supplyCollateral(MarketParams memory, uint256 assets, address onBehalf, bytes memory data) external;
    function borrow(MarketParams memory, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256, uint256);
    function repay(MarketParams memory, uint256 assets, uint256 shares, address onBehalf, bytes memory data)
        external
        returns (uint256, uint256);
    function withdrawCollateral(MarketParams memory, uint256 assets, address onBehalf, address receiver) external;
    function market(bytes32 id)
        external
        view
        returns (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            uint128 lastUpdate,
            uint128 fee
        );
    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
}

interface IVaultV2Fees {
    function accrueInterest() external;
    function performanceFee() external view returns (uint96);
    function performanceFeeRecipient() external view returns (address);
    function liquidityAdapter() external view returns (address);
}

/// @notice FORK OF BASE SEPOLIA. Runs the real DeployReachMarkets script against Morpho Blue,
///         the Morpho Vault V2 factories, Circle USDC and the live v2 Reach destination gateway.
///         The only fork-local change is a test key written into the Wormhole Core guardian set
///         so this test can author ISSUE / NAV messages. Enable with RUN_FORK_BASE_SEPOLIA=true.
contract ReachMarketsForkTest is Test {
    address constant CORE = 0x79A1027a6A159502049F10906D333EC57E95F083;
    IMorphoMarkets constant MORPHO = IMorphoMarkets(0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb);
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    uint256 guardianKey = 0xC0FFEE;
    bool enabled;

    ReachDestinationGateway dest;
    IERC20 receipt;
    address sourceGateway;
    address wrapper;
    ReachNavOracle oracle;
    IERC4626 vault;
    address treasury;
    MarketParams params;
    bytes32 marketId;
    uint64 nonce = 1_000_000;

    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");

    function setUp() public {
        enabled = vm.envOr("RUN_FORK_BASE_SEPOLIA", false);
        if (!enabled) return;
        vm.createSelectFork(vm.envOr("BASE_SEPOLIA_RPC", string("https://sepolia.base.org")));

        // Fork-local guardian override (same technique as MorphoCompatibilityFork).
        uint32 idx = uint32(uint256(vm.load(CORE, bytes32(uint256(3)))));
        bytes32 setSlot = keccak256(abi.encode(uint256(idx), uint256(2)));
        vm.store(CORE, setSlot, bytes32(uint256(1)));
        vm.store(CORE, keccak256(abi.encode(setSlot)), bytes32(uint256(uint160(vm.addr(guardianKey)))));

        string memory registry = vm.readFile("../../deployments/testnet.json");
        dest = ReachDestinationGateway(vm.parseJsonAddress(registry, ".destinationGateway"));
        receipt = IERC20(vm.parseJsonAddress(registry, ".receipt"));
        sourceGateway = vm.parseJsonAddress(registry, ".sourceGateway");
        wrapper = vm.parseJsonAddress(registry, ".wrapper");

        string memory out = "./cache-markets/fork-markets.json";
        vm.setEnv("REACH_MARKETS_OUT", out);
        new DeployReachMarkets().run();
        string memory m = vm.readFile(out);
        oracle = ReachNavOracle(vm.parseJsonAddress(m, ".oracle"));
        vault = IERC4626(vm.parseJsonAddress(m, ".vault"));
        treasury = vm.parseJsonAddress(m, ".treasury");
        marketId = vm.parseJsonBytes32(m, ".marketId");
        params = MarketParams(USDC, address(receipt), address(oracle), vm.parseJsonAddress(m, ".irm"), vm.parseJsonUint(m, ".lltv"));
        assertEq(keccak256(abi.encode(params)), marketId, "market id");
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
        ReachMessages.Message memory msg_ = ReachMessages.Message({
            protocolId: keccak256("MUSD_REACH"),
            version: 1,
            direction: direction,
            originEvmChainId: 31611,
            targetEvmChainId: 84532,
            originWormholeChainId: 50,
            targetWormholeChainId: 10004,
            originGateway: sourceGateway,
            targetGateway: address(dest),
            wrapper: wrapper,
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
            uint32(block.timestamp),
            uint32(0),
            uint16(50),
            bytes32(uint256(uint160(sourceGateway))),
            uint64(nonce),
            uint8(202),
            abi.encode(msg_)
        );
        bytes32 digest = keccak256(abi.encodePacked(keccak256(body)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianKey, digest);
        uint32 idx = uint32(uint256(vm.load(CORE, bytes32(uint256(3)))));
        return abi.encodePacked(uint8(1), idx, uint8(1), uint8(0), r, s, uint8(v - 27), body);
    }

    function test_marketsFork_configuration() public forkOnly {
        IVaultV2Fees v = IVaultV2Fees(address(vault));
        assertEq(vault.asset(), USDC);
        assertEq(v.performanceFee(), 0.1e18);
        assertEq(v.performanceFeeRecipient(), treasury);
        assertTrue(v.liquidityAdapter() != address(0));
        assertEq(oracle.haircutBps(), 1_000);
        assertEq(oracle.maxAge(), 3 days);
    }

    /// Lend → borrow against Mezo savings → interest → Reach fee → repay → exit.
    /// Isolated so every call is its own transaction: Vault V2 caches total assets in transient
    /// storage, which would otherwise persist across the whole test as if it were one tx.
    /// forge-config: default.isolate = true
    /// forge-config: markets.isolate = true
    function test_marketsFork_fullVenueLifecycle() public forkOnly {
        // 1,000 rwSMUSD issued through an authenticated ISSUE carrying NAV 1.05 MUSD / share.
        dest.receiveIssue(_vaa(1, 1_000e18, borrower, 1_050e18, 1_000e18));
        assertEq(receipt.balanceOf(borrower), 1_000e18);
        // 1,000 * 1.05 * (1 - 10%) = 945 USDC of collateral value.
        assertApproxEqAbs((1_000e18 * oracle.price()) / 1e36, 945e6, 1e3);

        // Lender deposits into the Reach vault; the liquidity adapter supplies it to the market.
        deal(USDC, lender, 10_000e6);
        vm.startPrank(lender);
        IERC20(USDC).approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, lender);
        vm.stopPrank();
        (uint128 supplied,,,,,) = MORPHO.market(marketId);
        assertGe(supplied, 10_000e6 - 1, "deposit reached the rwSMUSD market");

        // Borrow: max = 945 * 0.77 = 727.65 USDC.
        vm.startPrank(borrower);
        receipt.approve(address(MORPHO), 1_000e18);
        MORPHO.supplyCollateral(params, 1_000e18, borrower, "");
        vm.expectRevert();
        MORPHO.borrow(params, 730e6, 0, borrower, borrower);
        MORPHO.borrow(params, 700e6, 0, borrower, borrower);
        vm.stopPrank();
        assertEq(IERC20(USDC).balanceOf(borrower), 700e6);

        // Time passes; interest accrues to lenders and Reach's 10% cut is minted to treasury.
        vm.warp(block.timestamp + 30 days);
        IVaultV2Fees(address(vault)).accrueInterest();
        uint256 feeShares = vault.balanceOf(treasury);
        assertGt(feeShares, 0, "treasury earned performance fee shares");
        assertGt(vault.convertToAssets(vault.balanceOf(lender)), 10_000e6, "lender earned interest");

        // Fresh NAV keeps the market live after the 3-day window.
        dest.receiveNav(_vaa(3, 0, address(0), 1_051e18, 1_000e18));

        // Borrower repays in full and takes the rwSMUSD back.
        (, uint128 borrowShares,) = MORPHO.position(marketId, borrower);
        deal(USDC, borrower, 1_000e6);
        vm.startPrank(borrower);
        IERC20(USDC).approve(address(MORPHO), type(uint256).max);
        MORPHO.repay(params, 0, borrowShares, borrower, "");
        MORPHO.withdrawCollateral(params, 1_000e18, borrower, borrower);
        vm.stopPrank();
        assertEq(receipt.balanceOf(borrower), 1_000e18);

        // Lender exits through the vault (deallocated from the market on demand).
        uint256 lenderShares = vault.balanceOf(lender);
        vm.prank(lender);
        uint256 out = vault.redeem(lenderShares, lender, lender);
        assertGt(out, 10_000e6, "lender exits with principal plus interest");
    }

    function test_marketsFork_staleNavBlocksNewBorrows() public forkOnly {
        dest.receiveIssue(_vaa(1, 100e18, borrower, 100e18, 100e18));
        deal(USDC, lender, 1_000e6);
        vm.startPrank(lender);
        IERC20(USDC).approve(address(vault), 1_000e6);
        vault.deposit(1_000e6, lender);
        vm.stopPrank();
        vm.warp(block.timestamp + 3 days + 1);
        vm.startPrank(borrower);
        receipt.approve(address(MORPHO), 100e18);
        MORPHO.supplyCollateral(params, 100e18, borrower, "");
        vm.expectRevert();
        MORPHO.borrow(params, 10e6, 0, borrower, borrower);
        vm.stopPrank();
    }
}
