// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMUSDSavingsRate} from "../../src/interfaces/IMUSDSavingsRate.sol";
import {ReachSavingsWrapper} from "../../src/mezo/ReachSavingsWrapper.sol";

/// @notice LOCAL FORK of Mezo MAINNET (chain 31612): the Reach wrapper composed with Mezo's live
///         mainnet MUSD and MUSDSavingsRate (sMUSD) vault, the contracts that hold real savings.
///         Proves the wrapper's accounting against production state: 1:1 principal custody,
///         real protocol yield harvested into the share price, late depositors unable to buy
///         earlier yield, and full exits back to MUSD.
///         Enable with RUN_FORK_MEZO_MAINNET=true (optional MEZO_MAINNET_RPC).
contract ReachMezoMainnetForkTest is Test {
    address constant MUSD = 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186;
    address constant VAULT = 0xb4D498029af77680cD1eF828b967f010d06C51CC;
    /// Mainnet MUSDSavingsRate implementation read on 11 Nov 2026 (adds a vault gauge and a
    /// stored `claimableYield`; the wrapper prices pending yield from the yield index instead).
    address constant VAULT_IMPL = 0xB33C3f97BF3B7df59417D114c694353E42929e87;
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    bool enabled;
    IMUSDSavingsRate vault = IMUSDSavingsRate(VAULT);
    ReachSavingsWrapper wrapper;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address guardian = makeAddr("guardian");

    function setUp() public {
        enabled = vm.envOr("RUN_FORK_MEZO_MAINNET", false);
        if (!enabled) return;
        vm.createSelectFork(vm.envOr("MEZO_MAINNET_RPC", string("https://mezo-mainnet.boar.network")));
        wrapper = new ReachSavingsWrapper(vault, guardian);
    }

    modifier forkOnly() {
        if (!enabled) {
            vm.skip(true);
            return;
        }
        _;
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        deal(MUSD, who, amount);
        vm.startPrank(who);
        IERC20(MUSD).approve(address(wrapper), amount);
        shares = wrapper.deposit(amount, who);
        vm.stopPrank();
    }

    /// Real yield on mainnet arrives through the vault's protocol-yield entry point.
    function _injectYield(uint256 amount) internal {
        address funder = makeAddr("funder");
        deal(MUSD, funder, amount);
        vm.startPrank(funder);
        IERC20(MUSD).approve(VAULT, amount);
        vault.receiveProtocolYield(amount);
        vm.stopPrank();
    }

    function test_mainnet_wrapperTargetsLiveMezoSavings() public forkOnly {
        assertEq(block.chainid, 31612, "Mezo mainnet");
        assertEq(vault.musdToken(), MUSD, "vault pays MUSD");
        assertEq(address(uint160(uint256(vm.load(VAULT, IMPL_SLOT)))), VAULT_IMPL, "pinned implementation");
        assertEq(address(wrapper.savingsVault()), VAULT);
        assertGt(IERC20(VAULT).totalSupply(), 0, "live savings exist");
    }

    function test_mainnet_depositHoldsPrincipalOneToOne() public forkOnly {
        uint256 shares = _deposit(alice, 1_000e18);
        assertEq(shares, 1_000e18, "first deposit mints 1:1");
        assertEq(IERC20(VAULT).balanceOf(address(wrapper)), 1_000e18, "principal sits in Mezo savings");
        assertEq(wrapper.totalAssets(), 1_000e18);
    }

    function test_mainnet_realYieldRaisesSharePriceAndExitsInMusd() public forkOnly {
        _deposit(alice, 1_000e18);
        uint256 priceBefore = wrapper.convertToAssets(1e18);

        _injectYield(5_000_000e18);
        assertGt(wrapper.pendingYield(), 0, "wrapper earns live yield (index-based, before any harvest)");
        assertGt(wrapper.convertToAssets(1e18), priceBefore, "pending yield is priced in");

        // A late depositor cannot buy the yield that belongs to alice.
        uint256 bobShares = _deposit(bob, 1_000e18);
        assertLt(bobShares, 1_000e18, "late depositor pays the higher share price");

        uint256 aliceShares = wrapper.balanceOf(alice);
        vm.prank(alice);
        uint256 out = wrapper.redeem(aliceShares, alice, alice);
        assertGt(out, 1_000e18, "alice exits with principal plus yield");
        assertEq(IERC20(MUSD).balanceOf(alice), out);

        vm.prank(bob);
        uint256 bobOut = wrapper.redeem(bobShares, bob, bob);
        assertApproxEqAbs(bobOut, 1_000e18, 2, "bob gets back what he paid in");
    }
}
