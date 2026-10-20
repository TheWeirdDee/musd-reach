// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReachSavingsWrapper} from "../src/mezo/ReachSavingsWrapper.sol";
import {ReachTestBase, IOwnableVault} from "./utils/ReachTestBase.sol";

/// @notice Strategy that can be switched into failure mode to model an impaired native vault.
contract BreakableStrategy {
    address public immutable token;
    address public immutable vault;
    bool public broken;

    constructor(address token_, address vault_) {
        token = token_;
        vault = vault_;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function allocate(uint256 amount) external {
        require(!broken, "strategy broken");
        (bool ok,) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", vault, address(this), amount)
        );
        require(ok, "allocate failed");
    }

    function deallocate(uint256 amount) external {
        require(!broken, "strategy broken");
        (bool ok,) = token.call(abi.encodeWithSignature("transfer(address,uint256)", vault, amount));
        require(ok, "deallocate failed");
    }

    function claimYield() external pure returns (uint256) {
        return 0;
    }

    function migrate(address) external pure returns (uint256) {
        return 0;
    }

    function onMigrated(uint256) external {}
}

contract ReachSavingsWrapperTest is ReachTestBase {
    // ------------------------------------------------------------------
    // Native semantics reproduced (R-001 / negative test 2)
    // ------------------------------------------------------------------

    function test_native_depositIsOneToOne_andYieldIsPerAccount() public {
        nativeDeposit(alice, 100e18);
        assertEq(vault.balanceOf(alice), 100e18, "sMUSD minted 1:1");
        addNativeYield(10e18);
        // index-based accrual, not a rising exchange rate
        assertEq(vault.balanceOf(alice), 100e18, "principal does not appreciate");
        vm.prank(alice);
        uint256 claimed = vault.claimYield();
        assertApproxEqAbs(claimed, 10e18, 1, "yield claimed separately");
    }

    function test_native_transferLeavesPriorYieldWithSender() public {
        nativeDeposit(alice, 100e18);
        addNativeYield(5e18);
        vm.prank(alice);
        vault.transfer(bob, 100e18);
        assertApproxEqAbs(vault.claimableYield(alice), 5e18, 1, "sender keeps accrued yield");
        assertEq(vault.claimableYield(bob), 0, "receiver gets none of it");
    }

    // ------------------------------------------------------------------
    // Basic wrapper behaviour
    // ------------------------------------------------------------------

    function test_firstDepositMintsAtOneToOne() public {
        uint256 shares = wrapMusd(alice, 1000e18);
        assertEq(shares, 1000e18);
        assertEq(wrapper.principal(), 1000e18);
        assertEq(vault.balanceOf(address(wrapper)), 1000e18, "wrapper holds real sMUSD");
        assertEq(wrapper.totalAssets(), 1000e18);
    }

    function test_zeroYield_priceStaysExactlyOne_noDivisionIssues() public {
        // negative test 3: zero testnet yield
        assertEq(wrapper.totalAssets(), 0);
        assertEq(wrapper.convertToShares(1e18), 1e18);
        assertEq(wrapper.convertToAssets(1e18), 1e18);
        wrapMusd(alice, 500e18);
        wrapMusd(bob, 250e18);
        vm.warp(block.timestamp + 365 days);
        assertEq(wrapper.pendingYield(), 0);
        assertEq(wrapper.convertToAssets(1e18), 1e18, "no fictitious growth");
        vm.prank(alice);
        uint256 out = wrapper.redeem(500e18, alice, alice);
        assertEq(out, 500e18);
        assertEq(musd.balanceOf(alice), 500e18);
    }

    function test_yieldAccruesToExistingHoldersOnly() public {
        wrapMusd(alice, 100e18);
        nativeDeposit(carol, 100e18); // a native holder outside the wrapper
        addNativeYield(20e18); // 10 to wrapper, 10 to carol
        assertApproxEqAbs(wrapper.totalAssets(), 110e18, 2);

        uint256 bobShares = wrapMusd(bob, 110e18);
        // bob pays the current NAV, so receives ~100 shares, not 110
        assertApproxEqAbs(bobShares, 100e18, 1e6);

        uint256 aliceValue = wrapper.convertToAssets(wrapper.balanceOf(alice));
        assertApproxEqAbs(aliceValue, 110e18, 1e6, "alice keeps her yield");
        uint256 bobValue = wrapper.convertToAssets(bobShares);
        assertApproxEqAbs(bobValue, 110e18, 1e6, "bob is not diluted either");
    }

    /// negative test 1: deposit after unclaimed wrapper yield, withdraw before harvest
    function test_depositAfterUnclaimedYield_cannotCaptureIt() public {
        wrapMusd(alice, 100e18);
        addNativeYield(50e18); // all of it accrues to the wrapper (only sMUSD holder)
        assertGt(wrapper.pendingYield(), 0);

        uint256 bobShares = wrapMusd(bob, 150e18);
        vm.prank(bob);
        uint256 bobOut = wrapper.redeem(bobShares, bob, bob);
        assertLe(bobOut, 150e18, "bob cannot extract alice's yield");

        uint256 aliceShares = wrapper.balanceOf(alice);
        vm.prank(alice);
        uint256 aliceOut = wrapper.redeem(aliceShares, alice, alice);
        assertApproxEqAbs(aliceOut, 150e18, 2, "alice receives principal + yield");
    }

    function test_redeemToMusd_paysIdleFirstThenPrincipal() public {
        wrapMusd(alice, 100e18);
        addNativeYield(10e18);
        wrapper.harvest();
        assertApproxEqAbs(wrapper.idle(), 10e18, 1);
        vm.prank(alice);
        uint256 out = wrapper.redeem(50e18, alice, alice);
        assertApproxEqAbs(out, 55e18, 1);
        assertEq(wrapper.idle(), 0);
        assertApproxEqAbs(wrapper.principal(), 55e18, 1);
        assertApproxEqAbs(wrapper.totalAssets(), 55e18, 2);
    }

    function test_partialRedemptions_conserveValue() public {
        wrapMusd(alice, 300e18);
        wrapMusd(bob, 100e18);
        addNativeYield(40e18);
        vm.startPrank(alice);
        uint256 a1 = wrapper.redeem(100e18, alice, alice);
        uint256 a2 = wrapper.redeem(100e18, alice, alice);
        vm.stopPrank();
        assertApproxEqAbs(a1, a2, 1, "consecutive partial exits price equally");
        assertApproxEqAbs(a1, 110e18, 2);
        vm.prank(bob);
        uint256 b = wrapper.redeem(100e18, bob, bob);
        assertApproxEqAbs(b, 110e18, 2);
        vm.prank(alice);
        uint256 a3 = wrapper.redeem(100e18, alice, alice);
        assertApproxEqAbs(a3, 110e18, 2);
        assertLe(a1 + a2 + a3 + b, 440e18, "no rounding-created assets");
    }

    // ------------------------------------------------------------------
    // Native sMUSD entry (flow B)
    // ------------------------------------------------------------------

    function test_depositSavings_priorYieldStaysWithUser() public {
        nativeDeposit(alice, 100e18);
        addNativeYield(10e18);
        uint256 priorYield = 10e18;

        vm.startPrank(alice);
        vault.approve(address(wrapper), 100e18);
        uint256 shares = wrapper.depositSavings(100e18, alice, 100e18);
        vm.stopPrank();

        assertEq(shares, 100e18, "shares priced on principal only");
        assertApproxEqAbs(vault.claimableYield(alice), priorYield, 1, "prior yield left in user account");
        assertEq(wrapper.totalAssets(), 100e18, "wrapper did not absorb prior yield");

        addNativeYield(5e18);
        assertApproxEqAbs(wrapper.totalAssets(), 105e18, 1, "future yield accrues to wrapper");
    }

    function test_depositSavings_slippageBound() public {
        wrapMusd(bob, 100e18);
        addNativeYield(100e18);
        nativeDeposit(alice, 100e18);
        vm.startPrank(alice);
        vault.approve(address(wrapper), 100e18);
        vm.expectRevert();
        wrapper.depositSavings(100e18, alice, 100e18);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Donation / inflation (negative test 4)
    // ------------------------------------------------------------------

    function test_directDonations_doNotMoveSharePrice() public {
        wrapMusd(alice, 100e18);
        uint256 priceBefore = wrapper.convertToAssets(1e18);
        fund(carol, 1000e18);
        vm.prank(carol);
        musd.transfer(address(wrapper), 1000e18);
        nativeDeposit(bob, 50e18);
        vm.prank(bob);
        vault.transfer(address(wrapper), 50e18);
        assertEq(wrapper.convertToAssets(1e18), priceBefore, "untracked tokens ignored");
        assertEq(wrapper.principal(), 100e18);
        assertEq(wrapper.idle(), 0);
    }

    /// First-depositor attack through the vault's permissionless yield donation on a
    /// fresh vault where the wrapper is the only sMUSD holder (worst case).
    function test_inflationAttack_isUnprofitable() public {
        address attacker = makeAddr("attacker");
        wrapMusd(attacker, 1);
        uint256 donation = 1000e18;
        musd.mint(attacker, donation);
        vm.startPrank(attacker);
        musd.approve(address(vault), donation);
        vault.receiveProtocolYield(donation);
        vm.stopPrank();

        uint256 victimDeposit = 1500e18;
        uint256 victimShares = wrapMusd(alice, victimDeposit);
        assertGt(victimShares, 0, "victim receives shares");

        uint256 attackerShares = wrapper.balanceOf(attacker);
        vm.prank(attacker);
        uint256 attackerOut = wrapper.redeem(attackerShares, attacker, attacker);
        assertLe(attackerOut, donation + 1, "attacker cannot profit from donation");

        vm.prank(alice);
        uint256 victimOut = wrapper.redeem(victimShares, alice, alice);
        // Victim loses at most what the attacker burned to set it up.
        assertGe(victimOut + (donation + 1 - attackerOut), victimDeposit);
    }

    function test_tinyDeposit_roundingToZeroReverts() public {
        wrapMusd(alice, 1e18);
        addNativeYield(1000e18);
        fund(bob, 1);
        vm.startPrank(bob);
        musd.approve(address(wrapper), 1);
        vm.expectRevert(ReachSavingsWrapper.ZeroShares.selector);
        wrapper.deposit(1, bob);
        vm.stopPrank();
    }

    function test_zeroRedemption_reverts() public {
        wrapMusd(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(ReachSavingsWrapper.ZeroAssets.selector);
        wrapper.redeem(0, alice, alice);
        vm.prank(alice);
        vm.expectRevert(ReachSavingsWrapper.ZeroShares.selector);
        wrapper.redeemInKind(0, alice, alice);
    }

    // ------------------------------------------------------------------
    // Pause and failure behaviour
    // ------------------------------------------------------------------

    function test_guardianPause_blocksEntryNotExit() public {
        wrapMusd(alice, 100e18);
        vm.prank(guardian);
        wrapper.setDepositsPaused(true);

        fund(bob, 10e18);
        vm.startPrank(bob);
        musd.approve(address(wrapper), 10e18);
        vm.expectRevert(abi.encodeWithSelector(
            bytes4(keccak256("ERC4626ExceededMaxDeposit(address,uint256,uint256)")), bob, 10e18, 0
        ));
        wrapper.deposit(10e18, bob);
        vm.stopPrank();

        vm.prank(alice);
        assertEq(wrapper.redeem(100e18, alice, alice), 100e18, "exit still open");
    }

    function test_onlyGuardianCanPause() public {
        vm.expectRevert(ReachSavingsWrapper.NotGuardian.selector);
        wrapper.setDepositsPaused(true);
    }

    function test_guardianHandoverIsTwoStep() public {
        vm.prank(guardian);
        wrapper.proposeGuardian(bob);
        assertEq(wrapper.guardian(), guardian);
        vm.expectRevert(ReachSavingsWrapper.NotPendingGuardian.selector);
        vm.prank(carol);
        wrapper.acceptGuardian();
        vm.prank(bob);
        wrapper.acceptGuardian();
        assertEq(wrapper.guardian(), bob);
    }

    function test_impairedVault_musdExitFails_inKindExitWorks() public {
        wrapMusd(alice, 100e18);
        addNativeYield(10e18);
        wrapper.harvest();

        // Native vault owner (initializer of the proxy = this test) swaps in a strategy
        // that then fails, modelling a native withdrawal outage.
        BreakableStrategy bad = new BreakableStrategy(address(musd), address(vault));
        IOwnableVault(address(vault)).setStrategy(address(bad));
        bad.setBroken(true);

        vm.prank(alice);
        vm.expectRevert();
        wrapper.redeem(100e18, alice, alice);

        vm.prank(alice);
        (uint256 smusdOut, uint256 musdOut) = wrapper.redeemInKind(100e18, alice, alice);
        assertEq(smusdOut, 100e18, "pro-rata native principal delivered");
        assertApproxEqAbs(musdOut, 10e18, 1, "pro-rata claimed yield delivered");
        assertEq(vault.balanceOf(alice), 100e18);
    }

    function test_redeemInKind_isProRata() public {
        wrapMusd(alice, 300e18);
        wrapMusd(bob, 100e18);
        addNativeYield(40e18);
        vm.prank(bob);
        (uint256 s, uint256 m) = wrapper.redeemInKind(100e18, bob, bob);
        assertEq(s, 100e18);
        assertApproxEqAbs(m, 10e18, 1);
        assertApproxEqAbs(wrapper.convertToAssets(wrapper.balanceOf(alice)), 330e18, 2);
    }

    function test_redeemInKind_requiresAllowanceForThirdParty() public {
        wrapMusd(alice, 100e18);
        vm.prank(bob);
        vm.expectRevert();
        wrapper.redeemInKind(100e18, bob, alice);
    }

    function test_withdrawByThirdParty_requiresAllowance() public {
        wrapMusd(alice, 100e18);
        vm.prank(bob);
        vm.expectRevert();
        wrapper.redeem(100e18, bob, alice);
    }

    function test_previewsMatchExecution_whenPcvUnset() public {
        wrapMusd(alice, 100e18);
        addNativeYield(7e18);
        uint256 preview = wrapper.previewDeposit(50e18);
        uint256 actual = wrapMusd(bob, 50e18);
        assertEq(actual, preview);
        uint256 previewOut = wrapper.previewRedeem(actual);
        vm.prank(bob);
        assertEq(wrapper.redeem(actual, bob, bob), previewOut);
    }

    function test_interfaceAssetIsMusd() public view {
        assertEq(IERC4626(address(wrapper)).asset(), address(musd));
        assertEq(wrapper.decimals(), 18);
    }

    // ------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------

    function testFuzz_depositYieldRedeem_noValueCreated(
        uint96 a,
        uint96 b,
        uint96 y1,
        uint96 y2
    ) public {
        uint256 depA = bound(uint256(a), 1e6, 1e27);
        uint256 depB = bound(uint256(b), 1e6, 1e27);
        uint256 yield1 = bound(uint256(y1), 0, 1e26);
        uint256 yield2 = bound(uint256(y2), 0, 1e26);

        wrapMusd(alice, depA);
        yield1 = _maybeYield(yield1);

        // Entry price bob pays, rounded up: his worst-case rounding loss per share unit.
        uint256 pricePerUnit = (wrapper.totalAssets() + 1 + wrapper.totalSupply()) / (wrapper.totalSupply() + 1);
        vm.assume(wrapper.previewDeposit(depB) > 0);
        wrapMusd(bob, depB);
        yield2 = _maybeYield(yield2);

        uint256 aShares = wrapper.balanceOf(alice);
        uint256 bShares = wrapper.balanceOf(bob);
        vm.prank(alice);
        uint256 aOut = wrapper.redeem(aShares, alice, alice);
        vm.prank(bob);
        uint256 bOut = wrapper.redeem(bShares, bob, bob);

        assertLe(aOut + bOut, depA + depB + yield1 + yield2, "outputs never exceed inputs");
        assertGe(aOut + 2, depA, "early depositor never loses principal");
        assertGe(bOut + pricePerUnit + 2, depB, "late depositor loses at most rounding");
        assertGe(wrapper.totalAssets() + 0, 0);
    }

    /// @dev Adds native yield when the vault accepts it (its index must move by >= 1 unit).
    function _maybeYield(uint256 amount) internal returns (uint256 added) {
        if (amount == 0) return 0;
        if ((amount * 1e18) / vault.totalSupply() == 0) return 0;
        addNativeYield(amount);
        return amount;
    }
}
