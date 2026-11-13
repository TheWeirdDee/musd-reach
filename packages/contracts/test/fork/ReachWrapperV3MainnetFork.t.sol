// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMUSDSavingsRate} from "../../src/interfaces/IMUSDSavingsRate.sol";
import {IVaultGauge} from "../../src/interfaces/IVaultGauge.sol";
import {ReachSavingsWrapperV3} from "../../src/mezo/ReachSavingsWrapperV3.sol";

/// @notice LOCAL FORK of Mezo MAINNET: ReachSavingsWrapperV3 against Mezo's live MUSD, live sMUSD
///         vault and live sMUSD VaultGauge. Proves gauge mode end to end on production state:
///         principal staked in the real gauge, real MEZO emissions earned and claimed to the
///         rewards recipient, exits unstaking exactly what they need, the MUSD-yield trade-off
///         (staked sMUSD's savings yield goes to veBTC voters), and switching back.
///         Enable with RUN_FORK_MEZO_MAINNET=true (optional MEZO_MAINNET_RPC).
/// Stand-in for MEZO: on Mezo the token is a chain precompile, which a local fork cannot execute.
contract ForkMezo is ERC20("Mezo", "MEZO") {}

contract ReachWrapperV3MainnetForkTest is Test {
    address constant MUSD = 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186;
    address constant VAULT = 0xb4D498029af77680cD1eF828b967f010d06C51CC;
    address constant GAUGE = 0x677817bF3e44b90E8F95222F75e2950b7904a401;
    address constant MEZO = 0x7B7c000000000000000000000000000000000001;

    bool enabled;
    IMUSDSavingsRate vault = IMUSDSavingsRate(VAULT);
    IVaultGauge gauge = IVaultGauge(GAUGE);
    ReachSavingsWrapperV3 wrapper;

    address alice = makeAddr("alice");
    address guardian = makeAddr("guardian");
    address distributor = makeAddr("distributor");

    function setUp() public {
        enabled = vm.envOr("RUN_FORK_MEZO_MAINNET", false);
        if (!enabled) return;
        vm.createSelectFork(vm.envOr("MEZO_MAINNET_RPC", string("https://mezo-mainnet.boar.network")));
        wrapper = new ReachSavingsWrapperV3(vault, gauge, guardian);
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

    function _injectYield(uint256 amount) internal {
        address funder = makeAddr("funder");
        deal(MUSD, funder, amount);
        vm.startPrank(funder);
        IERC20(MUSD).approve(VAULT, amount);
        vault.receiveProtocolYield(amount);
        vm.stopPrank();
    }

    function test_v3Fork_targetsTheLiveGauge() public forkOnly {
        assertEq(address(wrapper.gauge()), GAUGE);
        assertEq(gauge.stakingToken(), VAULT, "gauge stakes sMUSD");
        assertEq(gauge.rewardToken(), MEZO, "gauge pays MEZO");
        assertGt(gauge.rewardRate(), 0, "gauge is emitting");
    }

    function test_v3Fork_gaugeModeEarnsRealMezo() public forkOnly {
        _deposit(alice, 10_000e18);
        vm.prank(guardian);
        wrapper.setGaugeMode(true);
        assertTrue(wrapper.staked());
        assertEq(wrapper.stakedPrincipal(), 10_000e18, "all principal staked in the live gauge");
        assertEq(vault.balanceOf(address(wrapper)), 0, "no sMUSD left idle in the wrapper");
        assertEq(wrapper.principal(), 10_000e18, "accounting unchanged");

        vm.warp(block.timestamp + 1 days);
        uint256 earned = wrapper.pendingRewards();
        assertGt(earned, 0, "real MEZO emissions accrued");

        // MEZO is a Mezo precompile; a local fork has none, so a plain ERC-20 stands in at the same
        // address, funded to the gauge. The gauge's reward accounting is untouched mainnet state.
        vm.etch(MEZO, address(new ForkMezo()).code);
        deal(MEZO, GAUGE, 1_000_000_000e18);

        vm.prank(guardian);
        wrapper.setRewardsRecipient(distributor);
        uint256 got = wrapper.claimRewards(); // anyone may call
        assertEq(got, earned);
        assertEq(IERC20(MEZO).balanceOf(distributor), earned, "MEZO reached the rewards recipient");
        assertEq(IERC20(MEZO).balanceOf(address(wrapper)), 0, "wrapper keeps no MEZO");
    }

    function test_v3Fork_exitsUnstakeExactlyWhatTheyNeed() public forkOnly {
        uint256 shares = _deposit(alice, 5_000e18);
        vm.prank(guardian);
        wrapper.setGaugeMode(true);
        vm.warp(block.timestamp + 1 hours);

        vm.prank(alice);
        uint256 out = wrapper.redeem(shares / 2, alice, alice);
        assertApproxEqAbs(out, 2_500e18, 1, "half the MUSD back while staked");
        assertApproxEqAbs(wrapper.stakedPrincipal(), 2_500e18, 1, "only the needed amount left the gauge");

        vm.prank(alice);
        (uint256 smusdOut,) = wrapper.redeemInKind(shares / 2, alice, alice);
        assertApproxEqAbs(smusdOut, 2_500e18, 1, "in-kind exit also unstakes");
        assertEq(vault.balanceOf(alice), smusdOut);
        assertLe(wrapper.stakedPrincipal(), 1);
    }

    function test_v3Fork_stakedSavingsYieldGoesToVoters_thenSavingsModeEarnsAgain() public forkOnly {
        _deposit(alice, 10_000e18);
        vm.prank(guardian);
        wrapper.setGaugeMode(true);

        // While staked, MUSD protocol yield accrues to the gauge (and from there to veBTC voters).
        _injectYield(50_000e18);
        wrapper.harvest();
        assertEq(wrapper.idle(), 0, "staked principal earns no MUSD savings yield");
        assertEq(wrapper.totalAssets(), 10_000e18);

        // Savings mode again: the principal comes back and earns the MUSD yield.
        vm.prank(guardian);
        wrapper.setGaugeMode(false);
        assertEq(wrapper.stakedPrincipal(), 0);
        assertEq(vault.balanceOf(address(wrapper)), 10_000e18);
        _injectYield(50_000e18);
        wrapper.harvest();
        assertGt(wrapper.idle(), 0, "MUSD savings yield earned again");
        assertGt(wrapper.totalAssets(), 10_000e18);
    }

    function test_v3Fork_depositsWhileStakedAreStaked_andOnlyGuardianSwitches() public forkOnly {
        vm.prank(alice);
        vm.expectRevert(ReachSavingsWrapperV3.NotGuardian.selector);
        wrapper.setGaugeMode(true);

        vm.prank(guardian);
        wrapper.setGaugeMode(true);
        _deposit(alice, 1_000e18);
        _deposit(alice, 2_000e18);
        assertEq(wrapper.stakedPrincipal(), 3_000e18, "new deposits go straight into the gauge");

        vm.expectRevert(ReachSavingsWrapperV3.NoRewardsRecipient.selector);
        wrapper.claimRewards();
    }
}
