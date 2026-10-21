// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReachTestBase} from "./utils/ReachTestBase.sol";

/// @notice Adversarial: a relayer chooses the gas for `receiveRedeem`. It must never be able to
///         change the payout asset the burner selected (MUSD) into something else.
contract GasGriefingTest is ReachTestBase {
    uint8 constant MUSD_MODE = 2;

    function _pendingMusdRedemption() internal returns (bytes memory vaa) {
        wrapMusd(alice, 100e18);
        addNativeYield(10e18); // yield makes the redeem path non-trivial (harvest + withdraw)
        (bytes memory issueVaa,) = lockShares(alice, 100e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (vaa,) = burnReceipt(alice, 100e18, bob, MUSD_MODE, 0);
        onMezo();
    }

    /// Sweeps relayer gas from high to low. For every gas value the delivery either reverts
    /// (message stays deliverable) or completes. A completed delivery must never have paid the
    /// recipient in wSMUSD shares instead of the MUSD they asked for.
    function test_relayerGas_cannotChangePayoutAsset() public {
        bytes memory vaa = _pendingMusdRedemption();
        uint256 snap = vm.snapshotState();
        for (uint256 g = 1_200_000; g >= 120_000; g -= 5_000) {
            vm.revertToState(snap);
            (bool ok,) = address(source).call{gas: g}(abi.encodeCall(source.receiveRedeem, (vaa)));
            if (!ok) continue;
            assertEq(wrapper.balanceOf(bob), 0, string.concat("payout asset changed at gas ", vm.toString(g)));
        }
    }
}

/// @notice Strategy whose withdrawals are expensive (e.g. unwinding a real yield position).
///         The vault owner can install such a strategy at any time.
contract HeavyStrategy {
    address public immutable token;
    address public immutable vault;
    uint256 public burnGas;
    mapping(uint256 => uint256) internal sink;

    constructor(address token_, address vault_, uint256 burnGas_) {
        token = token_;
        vault = vault_;
        burnGas = burnGas_;
    }

    function _burn() internal {
        uint256 start = gasleft();
        uint256 i;
        while (start - gasleft() < burnGas) sink[i++] = i;
    }

    function allocate(uint256 amount) external {
        (bool ok,) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", vault, address(this), amount));
        require(ok);
    }

    function deallocate(uint256 amount) external {
        _burn();
        (bool ok,) = token.call(abi.encodeWithSignature("transfer(address,uint256)", vault, amount));
        require(ok);
    }

    function claimYield() external pure returns (uint256) {
        return 0;
    }

    function migrate(address) external pure returns (uint256) {
        return 0;
    }

    function onMigrated(uint256) external {}
}

interface IVaultOwner {
    function setStrategy(address) external;
}

contract GasGriefingHeavyStrategyTest is ReachTestBase {
    function test_relayerGas_heavyStrategy_cannotChangePayoutAsset() public {
        wrapMusd(alice, 100e18);
        // Move principal to an expensive-withdrawal strategy (owner action on the native vault).
        HeavyStrategy heavy = new HeavyStrategy(address(musd), address(vault), 3_000_000);
        // IdleStrategy.migrate transfers funds to the new strategy.
        IVaultOwner(address(vault)).setStrategy(address(heavy));
        (bytes memory issueVaa,) = lockShares(alice, 100e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (bytes memory vaa,) = burnReceipt(alice, 100e18, bob, 2, 0);
        onMezo();

        uint256 snap = vm.snapshotState();
        uint256 griefedAt;
        for (uint256 g = 6_000_000; g >= 200_000; g -= 20_000) {
            vm.revertToState(snap);
            (bool ok,) = address(source).call{gas: g}(abi.encodeCall(source.receiveRedeem, (vaa)));
            if (ok && wrapper.balanceOf(bob) > 0) {
                griefedAt = g;
                break;
            }
        }
        assertEq(griefedAt, 0, string.concat("relayer forced shares payout with gas ", vm.toString(griefedAt)));
    }
}

/// @notice PCV whose distribution is expensive and pays real yield into the vault.
contract HeavyPcv {
    address public immutable musdToken;
    address public immutable vault;
    uint256 public burnGas;
    uint256 public fee;
    mapping(uint256 => uint256) internal sink;

    constructor(address musd_, address vault_, uint256 burnGas_) {
        musdToken = musd_;
        vault = vault_;
        burnGas = burnGas_;
    }

    function setFee(uint256 f) external {
        fee = f;
    }

    function distributeMUSD() external {
        uint256 start = gasleft();
        uint256 i;
        while (start - gasleft() < burnGas) sink[i++] = i;
        if (fee > 0) {
            uint256 f = fee;
            fee = 0;
            (bool ok,) = musdToken.call(abi.encodeWithSignature("approve(address,uint256)", vault, f));
            require(ok);
            (ok,) = vault.call(abi.encodeWithSignature("receiveProtocolYield(uint256)", f));
            require(ok, "yield");
        }
    }
}

interface IPcvOwner {
    function setPCV(address) external;
    function setStrategy(address) external;
}

contract SettlementAdversarialTest is ReachTestBase {
    HeavyStrategy heavy;

    function _setupHeavyRedemption(uint256 shares, uint256 minAssets) internal returns (bytes memory vaa, bytes32 id) {
        wrapMusd(alice, shares);
        heavy = new HeavyStrategy(address(musd), address(vault), 3_000_000);
        IPcvOwner(address(vault)).setStrategy(address(heavy));
        (bytes memory issueVaa,) = lockShares(alice, shares, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (vaa, id) = burnReceipt(alice, shares, bob, 2, minAssets);
        onMezo();
    }

    /// Fuzzed relayer gas: outcome is always revert (still deliverable), MUSD paid, or pending.
    function testFuzz_relayerGas_neverSwitchesAsset(uint256 g) public {
        (bytes memory vaa, bytes32 id) = _setupHeavyRedemption(100e18, 0);
        g = bound(g, 100_000, 8_000_000);
        (bool ok,) = address(source).call{gas: g}(abi.encodeCall(source.receiveRedeem, (vaa)));
        assertEq(wrapper.balanceOf(bob), 0, "shares never substituted");
        if (!ok) {
            assertFalse(source.transferConsumed(id), "reverted delivery leaves message deliverable");
            source.receiveRedeem(vaa); // deliverable later with ample gas
        }
        (, uint256 pendingShares,) = source.pendingSettlements(id);
        assertTrue(musd.balanceOf(bob) == 100e18 || pendingShares == 100e18, "paid in MUSD or pending");
        assertEq(source.totalPendingSettlement(), pendingShares);
    }

    /// A starved retry cannot convert or lose a pending settlement.
    function testFuzz_starvedRetry_leavesPendingIntact(uint256 g) public {
        (bytes memory vaa, bytes32 id) = _setupHeavyRedemption(100e18, 101e18); // min too high -> pending
        source.receiveRedeem(vaa);
        (, uint256 before,) = source.pendingSettlements(id);
        assertEq(before, 100e18);
        g = bound(g, 50_000, 8_000_000);
        (bool ok,) = address(source).call{gas: g}(abi.encodeCall(source.retrySettlement, (id)));
        assertFalse(ok, "retry with the original minimum cannot succeed");
        (, uint256 after_,) = source.pendingSettlements(id);
        assertEq(after_, 100e18);
        assertEq(wrapper.balanceOf(bob), 0);
    }

    /// Partial redemptions settle independently and never cross-contaminate.
    function test_multiplePendingSettlements_independent() public {
        wrapMusd(alice, 300e18);
        BreakableStrategyLite bad = new BreakableStrategyLite(address(musd), address(vault));
        (bytes memory issueVaa,) = lockShares(alice, 300e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (bytes memory v1, bytes32 id1) = burnReceipt(alice, 100e18, bob, 2, 0);
        (bytes memory v2, bytes32 id2) = burnReceipt(alice, 50e18, carol, 2, 0);
        (bytes memory v3,) = burnReceipt(alice, 150e18, alice, 1, 0); // shares mode
        onMezo();
        IPcvOwner(address(vault)).setStrategy(address(bad));
        bad.setBroken(true);
        source.receiveRedeem(v1);
        source.receiveRedeem(v2);
        source.receiveRedeem(v3);
        assertEq(wrapper.balanceOf(alice), 150e18, "shares-mode unaffected by vault outage");
        assertEq(source.totalPendingSettlement(), 150e18);
        assertEq(source.totalLocked(), 0);
        bad.setBroken(false);
        source.retrySettlement(id2);
        assertEq(musd.balanceOf(carol), 50e18);
        assertEq(source.totalPendingSettlement(), 100e18);
        vm.prank(bob);
        source.claimSharesInstead(id1);
        assertEq(wrapper.balanceOf(bob), 100e18);
        assertEq(source.totalPendingSettlement(), 0);
        assertEq(wrapper.balanceOf(address(source)), 0);
    }

    /// Wrapper: a depositor must not be able to skip a PCV fee distribution by starving it of gas.
    /// The PCV here consumes all gas it is given (models a distribution far costlier than the
    /// forwarded 63/64). With a near-block-sized transaction the wrapper keeps ~1/64 (~450k gas),
    /// enough to finish a deposit, so an unguarded wrapper would price bob in before the fees are
    /// distributed. The guarded wrapper must refuse instead.
    function test_pcvDistribution_cannotBeSkippedByLowGas() public {
        wrapMusd(alice, 100e18);
        HeavyPcv pcv = new HeavyPcv(address(musd), address(vault), type(uint256).max);
        IPcvOwner(address(vault)).setPCV(address(pcv));
        fund(bob, 100e18);
        vm.prank(bob);
        musd.approve(address(wrapper), 100e18);
        vm.prank(bob);
        (bool ok,) = address(wrapper).call{gas: 29_000_000}(abi.encodeCall(wrapper.deposit, (100e18, bob)));
        assertFalse(ok, "deposit must not proceed when the PCV distribution ran out of gas");
        assertEq(wrapper.balanceOf(bob), 0);
    }

    /// Same attack through the native sMUSD entry, which never calls vault.deposit (and so has
    /// no second, vault-internal distribution attempt to fall over).
    function test_pcvDistribution_cannotBeSkipped_viaDepositSavings() public {
        wrapMusd(alice, 100e18);
        nativeDeposit(bob, 100e18); // bob holds native sMUSD before the PCV is configured
        HeavyPcv pcv = new HeavyPcv(address(musd), address(vault), type(uint256).max);
        IPcvOwner(address(vault)).setPCV(address(pcv));
        vm.prank(bob);
        vault.approve(address(wrapper), 100e18);
        vm.prank(bob);
        (bool ok,) = address(wrapper).call{gas: 29_000_000}(abi.encodeCall(wrapper.depositSavings, (100e18, bob, 0)));
        assertFalse(ok, "sMUSD entry must not proceed when the PCV distribution ran out of gas");
        assertEq(wrapper.balanceOf(bob), 0);
    }
}

/// Minimal breakable strategy (local copy to keep this file self-contained).
contract BreakableStrategyLite {
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
        (bool ok,) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", vault, address(this), amount));
        require(ok);
    }

    function deallocate(uint256 amount) external {
        require(!broken, "broken");
        (bool ok,) = token.call(abi.encodeWithSignature("transfer(address,uint256)", vault, amount));
        require(ok);
    }

    function claimYield() external pure returns (uint256) {
        return 0;
    }

    function migrate(address) external pure returns (uint256) {
        return 0;
    }

    function onMigrated(uint256) external {}
}

/// @notice Liveness of pending settlements: indefinite delay, repeated failed retries, and a
///         relayer that disappears. Recovery must stay permissionless and must not depend on the
///         original relayer.
contract PendingSettlementLivenessTest is ReachTestBase {
    function _pendingDuringOutage(address relayer) internal returns (bytes32 id, BreakableStrategyLite bad) {
        wrapMusd(alice, 100e18);
        bad = new BreakableStrategyLite(address(musd), address(vault));
        IPcvOwner(address(vault)).setStrategy(address(bad));
        (bytes memory issueVaa,) = lockShares(alice, 100e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        bytes memory vaa;
        (vaa, id) = burnReceipt(alice, 100e18, bob, 2, 0);
        onMezo();
        bad.setBroken(true);
        vm.prank(relayer); // any EOA can deliver; there is no privileged relayer
        source.receiveRedeem(vaa);
    }

    function test_indefiniteDelay_manyFailedRetries_thenAnyoneSettles() public {
        (bytes32 id, BreakableStrategyLite bad) = _pendingDuringOutage(makeAddr("relayerThatDisappears"));
        for (uint256 i = 0; i < 50; i++) {
            vm.warp(block.timestamp + 73 days); // ~10 years in total
            vm.prank(address(uint160(0xBEEF00 + i)));
            vm.expectRevert();
            source.retrySettlement(id);
        }
        (address r, uint256 sh, uint256 min) = source.pendingSettlements(id);
        assertEq(r, bob);
        assertEq(sh, 100e18, "entry intact after 10 years and 50 failed retries");
        assertEq(min, 0);
        assertEq(source.totalPendingSettlement(), 100e18);
        assertEq(wrapper.balanceOf(address(source)), 100e18, "shares still in custody");

        // Yield accrues to the wrapper during the delay; the pending entry keeps NAV exposure.
        addNativeYield(10e18);
        bad.setBroken(false);
        vm.prank(makeAddr("strangerYearsLater")); // not the original relayer, not the recipient
        uint256 out = source.retrySettlement(id);
        assertGe(out, 100e18, "settles at NAV at settlement time");
        assertEq(musd.balanceOf(bob), out, "paid to the recipient, never the caller");
        assertEq(source.totalPendingSettlement(), 0);
    }

    function test_recipientCanExitInKindDuringIndefiniteOutage() public {
        (bytes32 id,) = _pendingDuringOutage(makeAddr("relayer"));
        vm.warp(block.timestamp + 3650 days);
        // The vault never recovers: the recipient takes shares and exits in kind (no vault withdrawal needed).
        vm.prank(bob);
        source.claimSharesInstead(id);
        vm.prank(bob);
        (uint256 smusdOut,) = wrapper.redeemInKind(100e18, bob, bob);
        assertEq(smusdOut, 100e18, "native principal recovered without the vault paying out");
    }

    function testFuzz_retriesNeverMutatePendingUntilSuccess(uint8 attempts, uint32 delay) public {
        (bytes32 id, BreakableStrategyLite bad) = _pendingDuringOutage(makeAddr("relayer"));
        uint256 n = bound(attempts, 1, 40);
        for (uint256 i = 0; i < n; i++) {
            vm.warp(block.timestamp + bound(delay, 1, 365 days));
            (bool ok,) = address(source).call(abi.encodeCall(source.retrySettlement, (id)));
            assertFalse(ok);
            (, uint256 sh,) = source.pendingSettlements(id);
            assertEq(sh, 100e18);
        }
        bad.setBroken(false);
        source.retrySettlement(id);
        (, uint256 after_,) = source.pendingSettlements(id);
        assertEq(after_, 0);
    }
}
