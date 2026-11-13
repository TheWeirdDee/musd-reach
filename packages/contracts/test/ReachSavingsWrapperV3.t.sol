// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVaultGauge} from "../src/interfaces/IVaultGauge.sol";
import {IMUSDSavingsRate} from "../src/interfaces/IMUSDSavingsRate.sol";
import {ReachSavingsWrapperV3} from "../src/mezo/ReachSavingsWrapperV3.sol";
import {ReachTestBase} from "./utils/ReachTestBase.sol";

contract MockMezo is ERC20("Mezo", "MEZO") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Behaves like Mezo's VaultGauge where it matters to the wrapper: stakes sMUSD, takes
///         the MUSD savings yield of everything staked for veBTC voters, pays a separate reward
///         token per second per staked unit, and can be retired (deposits refused, exits open).
contract MockVaultGauge is IVaultGauge {
    IERC20 public immutable smusd;
    MockMezo public immutable mezo;
    address public constant VOTERS = address(0xBEEF);
    uint256 public constant PER_SECOND = 1e12; // reward per staked unit (1e18) per second
    bool public alive = true;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public lastUpdate;
    mapping(address => uint256) public accrued;
    uint256 public totalSupply;

    constructor(IERC20 smusd_) {
        smusd = smusd_;
        mezo = new MockMezo();
    }

    function stakingToken() external view returns (address) {
        return address(smusd);
    }

    function rewardToken() external view returns (address) {
        return address(mezo);
    }

    function rewardRate() external pure returns (uint256) {
        return PER_SECOND;
    }

    function periodFinish() external view returns (uint256) {
        return block.timestamp + 7 days;
    }

    function setAlive(bool a) external {
        alive = a;
    }

    function earned(address a) public view returns (uint256) {
        return accrued[a] + (balanceOf[a] * PER_SECOND * (block.timestamp - lastUpdate[a])) / 1e18;
    }

    function _checkpoint(address a) internal {
        accrued[a] = earned(a);
        lastUpdate[a] = block.timestamp;
        // VaultGauge._claimFees: the savings yield of staked sMUSD goes to voters.
        IMUSDSavingsRate(address(smusd)).claimYield();
        IERC20 musd = IERC20(IMUSDSavingsRate(address(smusd)).musdToken());
        musd.transfer(VOTERS, musd.balanceOf(address(this)));
    }

    function deposit(uint256 amount) external {
        require(alive, "NotAlive");
        _checkpoint(msg.sender);
        smusd.transferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount;
        totalSupply += amount;
    }

    function withdraw(uint256 amount) external {
        _checkpoint(msg.sender);
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        smusd.transfer(msg.sender, amount);
    }

    function getReward(address account) external {
        require(msg.sender == account, "NotAuthorized");
        _checkpoint(account);
        uint256 r = accrued[account];
        accrued[account] = 0;
        mezo.mint(account, r);
    }
}

/// Covers ReachSavingsWrapperV3: v2 behaviour with no gauge; gauge mode staking all principal and
/// new deposits; exits (MUSD and in kind) unstaking exactly what they need, also from a retired
/// gauge; the savings-yield trade-off; MEZO claims to the recipient only; guardian-only controls;
/// and principal == held + staked at every step (fuzzed).
contract ReachSavingsWrapperV3Test is ReachTestBase {
    ReachSavingsWrapperV3 v3;
    MockVaultGauge gauge;
    address distributor = makeAddr("distributor");

    function setUp() public override {
        super.setUp();
        gauge = new MockVaultGauge(IERC20(address(vault)));
        v3 = new ReachSavingsWrapperV3(vault, gauge, guardian);
    }

    function _in(address who, uint256 amount) internal returns (uint256 shares) {
        fund(who, amount);
        vm.startPrank(who);
        musd.approve(address(v3), amount);
        shares = v3.deposit(amount, who);
        vm.stopPrank();
    }

    function _conserved() internal view {
        assertEq(v3.principal(), vault.balanceOf(address(v3)) + gauge.balanceOf(address(v3)), "principal = held + staked");
    }

    function test_rejectsAGaugeForAnotherToken() public {
        MockVaultGauge other = new MockVaultGauge(IERC20(address(musd)));
        vm.expectRevert(ReachSavingsWrapperV3.GaugeMismatch.selector);
        new ReachSavingsWrapperV3(vault, other, guardian);
    }

    function test_withoutAGaugeItIsTheV2Wrapper() public {
        ReachSavingsWrapperV3 plain = new ReachSavingsWrapperV3(vault, IVaultGauge(address(0)), guardian);
        vm.prank(guardian);
        vm.expectRevert(ReachSavingsWrapperV3.NoGauge.selector);
        plain.setGaugeMode(true);
        vm.expectRevert(ReachSavingsWrapperV3.NoGauge.selector);
        plain.claimRewards();
        assertEq(plain.stakedPrincipal(), 0);
        assertEq(plain.pendingRewards(), 0);
    }

    function test_gaugeModeStakesPrincipalAndNewDeposits() public {
        _in(alice, 100e18);
        vm.prank(guardian);
        v3.setGaugeMode(true);
        assertEq(gauge.balanceOf(address(v3)), 100e18);
        assertEq(vault.balanceOf(address(v3)), 0);
        _in(bob, 50e18);
        assertEq(v3.stakedPrincipal(), 150e18);
        _conserved();
    }

    function test_exitsUnstakeWhatTheyNeed_inMusdAndInKind() public {
        uint256 a = _in(alice, 100e18);
        vm.prank(guardian);
        v3.setGaugeMode(true);
        vm.prank(alice);
        uint256 out = v3.redeem(a / 4, alice, alice);
        assertEq(out, 25e18);
        assertEq(musd.balanceOf(alice), 25e18);
        assertEq(v3.stakedPrincipal(), 75e18);
        vm.prank(alice);
        (uint256 smusdOut,) = v3.redeemInKind(a / 4, alice, alice);
        assertEq(smusdOut, 25e18);
        assertEq(vault.balanceOf(alice), 25e18);
        assertEq(v3.stakedPrincipal(), 50e18);
        _conserved();
    }

    function test_retiredGaugeRefusesDepositsButNeverBlocksExits() public {
        uint256 a = _in(alice, 100e18);
        vm.prank(guardian);
        v3.setGaugeMode(true);
        gauge.setAlive(false);

        fund(bob, 10e18);
        vm.startPrank(bob);
        musd.approve(address(v3), 10e18);
        vm.expectRevert(bytes("NotAlive"));
        v3.deposit(10e18, bob);
        vm.stopPrank();

        vm.prank(alice);
        assertEq(v3.redeem(a, alice, alice), 100e18, "full exit from a retired gauge");
        // The guardian can also bring everything back to savings mode.
        _conserved();
    }

    function test_stakedSavingsYieldGoesToVoters_savingsModeEarnsIt() public {
        _in(alice, 100e18);
        vm.prank(guardian);
        v3.setGaugeMode(true);
        addNativeYield(10e18);
        v3.harvest();
        assertEq(v3.idle(), 0, "no MUSD yield while staked");
        vm.prank(address(gauge));
        IMUSDSavingsRate(address(vault)).claimYield();

        vm.prank(guardian);
        v3.setGaugeMode(false);
        assertEq(vault.balanceOf(address(v3)), 100e18);
        addNativeYield(10e18);
        v3.harvest();
        assertGt(v3.idle(), 0, "MUSD yield earned again in savings mode");
        _conserved();
    }

    function test_rewardsGoOnlyToTheRecipient() public {
        _in(alice, 100e18);
        vm.prank(guardian);
        v3.setGaugeMode(true);
        vm.warp(block.timestamp + 1 days);
        assertGt(v3.pendingRewards(), 0);

        vm.expectRevert(ReachSavingsWrapperV3.NoRewardsRecipient.selector);
        v3.claimRewards();

        vm.prank(alice);
        vm.expectRevert(ReachSavingsWrapperV3.NotGuardian.selector);
        v3.setRewardsRecipient(alice);

        vm.prank(guardian);
        v3.setRewardsRecipient(distributor);
        uint256 expected = v3.pendingRewards();
        vm.prank(carol); // anyone can trigger the claim
        uint256 got = v3.claimRewards();
        assertEq(got, expected);
        assertEq(IERC20(gauge.rewardToken()).balanceOf(distributor), expected);
        assertEq(IERC20(gauge.rewardToken()).balanceOf(address(v3)), 0);
        assertEq(v3.totalAssets(), 100e18, "MEZO never moves the MUSD share price");
    }

    function test_onlyGuardianSwitchesModes_andSwitchingTwiceIsANoop() public {
        vm.prank(alice);
        vm.expectRevert(ReachSavingsWrapperV3.NotGuardian.selector);
        v3.setGaugeMode(true);
        _in(alice, 10e18);
        vm.startPrank(guardian);
        v3.setGaugeMode(true);
        v3.setGaugeMode(true);
        assertEq(v3.stakedPrincipal(), 10e18);
        v3.setGaugeMode(false);
        v3.setGaugeMode(false);
        vm.stopPrank();
        assertEq(v3.stakedPrincipal(), 0);
        _conserved();
    }

    function testFuzz_principalIsAlwaysHeldPlusStaked(uint96 a, uint96 b, uint8 flips, uint96 exitPart) public {
        uint256 x = bound(a, 1e18, 1_000_000e18);
        uint256 y = bound(b, 1e18, 1_000_000e18);
        uint256 sa = _in(alice, x);
        for (uint256 i; i < bound(flips, 0, 4); ++i) {
            bool next = !v3.staked(); // read first: vm.prank applies to the next call only
            vm.prank(guardian);
            v3.setGaugeMode(next);
            _conserved();
        }
        _in(bob, y);
        _conserved();
        uint256 part = bound(exitPart, 1, sa);
        vm.prank(alice);
        v3.redeem(part, alice, alice);
        _conserved();
        bool flip = !v3.staked();
        vm.prank(guardian);
        v3.setGaugeMode(flip);
        _conserved();
        uint256 rest = v3.balanceOf(alice);
        if (rest > 0) {
            vm.prank(alice);
            v3.redeem(rest, alice, alice);
        }
        uint256 sb = v3.balanceOf(bob);
        vm.prank(bob);
        assertApproxEqAbs(v3.redeem(sb, bob, bob), y, 2, "bob gets his principal back");
        _conserved();
    }
}
