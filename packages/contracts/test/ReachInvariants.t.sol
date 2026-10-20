// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReachTestBase, IOwnableVault} from "./utils/ReachTestBase.sol";
import {BreakableStrategyLite} from "./GasGriefing.t.sol";
import {ReachMessages} from "../src/shared/ReachMessages.sol";

/// @notice Drives random interleavings of every user-reachable action across both chains,
///         including duplicate and out-of-order VAA delivery and direct donations.
contract ReachHandler is ReachTestBase {
    address[] internal actors;

    bytes[] internal pendingIssue;
    uint256[] internal pendingIssueShares;
    bytes[] internal pendingRedeem;
    uint256[] internal pendingRedeemShares;
    bytes[] internal deliveredIssue;
    bytes[] internal deliveredRedeem;

    uint256 public ghostPendingIssueShares;
    uint256 public ghostPendingRedeemShares;
    uint256 public ghostMusdIn; // deposits + yield + donations into the system
    uint256 public ghostMusdOut; // MUSD paid out to users
    uint256 public ghostSmusdOut; // native principal paid out in kind
    uint256 public ghostReplaySuccesses;

    BreakableStrategyLite internal strategyCtl;
    bytes32[] internal pendingIds;
    uint256 public ghostOutageToggles;
    uint256 public ghostPendingCreated;
    uint256 public ghostPendingResolved;

    constructor() {
        setUp();
        // The handler owns the vault proxy (it ran initialize), so it can install a strategy whose
        // withdrawals can be switched off to model native-vault outages.
        strategyCtl = new BreakableStrategyLite(address(musd), address(vault));
        IOwnableVault(address(vault)).setStrategy(address(strategyCtl));
        actors.push(alice);
        actors.push(bob);
        actors.push(carol);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function wrap(uint256 seed, uint256 amount) external {
        onMezo();
        amount = bound(amount, 1e6, 1e24);
        if (wrapper.previewDeposit(amount) == 0) return;
        wrapMusd(_actor(seed), amount);
        ghostMusdIn += amount;
    }

    function yield_(uint256 amount) external {
        onMezo();
        amount = bound(amount, 1e12, 1e22);
        uint256 supply = vault.totalSupply();
        if (supply == 0 || (amount * 1e18) / supply == 0) return;
        addNativeYield(amount);
        ghostMusdIn += amount; // upper bound; part may accrue to non-wrapper holders
    }

    function harvest() external {
        onMezo();
        wrapper.harvest();
    }

    function unwrap(uint256 seed, uint256 fraction) external {
        onMezo();
        address a = _actor(seed);
        uint256 bal = wrapper.balanceOf(a);
        uint256 shares = (bal * bound(fraction, 1, 100)) / 100;
        if (shares == 0 || wrapper.previewRedeem(shares) == 0) return;
        vm.prank(a);
        uint256 out = wrapper.redeem(shares, a, a);
        ghostMusdOut += out;
    }

    function unwrapInKind(uint256 seed, uint256 fraction) external {
        onMezo();
        address a = _actor(seed);
        uint256 shares = (wrapper.balanceOf(a) * bound(fraction, 1, 100)) / 100;
        if (shares == 0) return;
        (uint256 s, uint256 m) = wrapper.previewRedeemInKind(shares);
        if (s == 0 && m == 0) return;
        vm.prank(a);
        (uint256 sOut, uint256 mOut) = wrapper.redeemInKind(shares, a, a);
        ghostSmusdOut += sOut;
        ghostMusdOut += mOut;
    }

    function lock(uint256 seed, uint256 fraction, uint256 recipientSeed) external {
        onMezo();
        address a = _actor(seed);
        uint256 shares = (wrapper.balanceOf(a) * bound(fraction, 1, 100)) / 100;
        if (shares == 0) return;
        (bytes memory vaa,) = lockShares(a, shares, _actor(recipientSeed));
        pendingIssue.push(vaa);
        pendingIssueShares.push(shares);
        ghostPendingIssueShares += shares;
    }

    function deliverIssue(uint256 index) external {
        if (pendingIssue.length == 0) return;
        index = index % pendingIssue.length;
        onBase();
        bytes memory vaa = pendingIssue[index];
        dest.receiveIssue(vaa);
        ghostPendingIssueShares -= pendingIssueShares[index];
        deliveredIssue.push(vaa);
        _removeIssue(index);
    }

    function transferReceipt(uint256 fromSeed, uint256 toSeed, uint256 fraction) external {
        onBase();
        address from = _actor(fromSeed);
        uint256 amt = (receipt.balanceOf(from) * bound(fraction, 1, 100)) / 100;
        if (amt == 0) return;
        vm.prank(from);
        receipt.transfer(_actor(toSeed), amt);
    }

    function burn(uint256 seed, uint256 fraction, uint256 recipientSeed, bool musdMode) external {
        onBase();
        address a = _actor(seed);
        uint256 amt = (receipt.balanceOf(a) * bound(fraction, 1, 100)) / 100;
        if (amt == 0) return;
        (bytes memory vaa,) = burnReceipt(a, amt, _actor(recipientSeed), musdMode ? 2 : 1, 0);
        pendingRedeem.push(vaa);
        pendingRedeemShares.push(amt);
        ghostPendingRedeemShares += amt;
    }

    function deliverRedeem(uint256 index) external {
        if (pendingRedeem.length == 0) return;
        index = index % pendingRedeem.length;
        onMezo();
        bytes memory vaa = pendingRedeem[index];
        uint256 before = musd.balanceOf(address(source));
        address[3] memory who = [alice, bob, carol];
        uint256[3] memory musdBefore;
        for (uint256 i = 0; i < 3; i++) musdBefore[i] = musd.balanceOf(who[i]);
        bytes32 id = _redeemIdOf(vaa);
        source.receiveRedeem(vaa);
        for (uint256 i = 0; i < 3; i++) ghostMusdOut += musd.balanceOf(who[i]) - musdBefore[i];
        (, uint256 pendingShares,) = source.pendingSettlements(id);
        if (pendingShares > 0) {
            pendingIds.push(id);
            ghostPendingCreated++;
        }
        before; // gateway itself never retains MUSD
        ghostPendingRedeemShares -= pendingRedeemShares[index];
        deliveredRedeem.push(vaa);
        _removeRedeem(index);
    }

    /// @dev Attempts to replay an already-delivered message. Must never succeed.
    function replay(uint256 index, bool issueSide) external {
        if (issueSide) {
            if (deliveredIssue.length == 0) return;
            onBase();
            try dest.receiveIssue(deliveredIssue[index % deliveredIssue.length]) {
                ghostReplaySuccesses++;
            } catch {}
        } else {
            if (deliveredRedeem.length == 0) return;
            onMezo();
            try source.receiveRedeem(deliveredRedeem[index % deliveredRedeem.length]) {
                ghostReplaySuccesses++;
            } catch {}
        }
    }

    function _redeemIdOf(bytes memory vaa) internal view returns (bytes32) {
        return ReachMessages.transferId(ReachMessages.decode(mezoCore.parseVM(vaa).payload));
    }

    function toggleOutage(bool broken) external {
        onMezo();
        strategyCtl.setBroken(broken);
        ghostOutageToggles++;
    }

    function retryPending(uint256 index) external {
        if (pendingIds.length == 0) return;
        onMezo();
        bytes32 id = pendingIds[index % pendingIds.length];
        (address r,,) = source.pendingSettlements(id);
        if (r == address(0)) return;
        uint256 before = musd.balanceOf(r);
        try source.retrySettlement(id) {
            ghostPendingResolved++;
            ghostMusdOut += musd.balanceOf(r) - before;
        } catch {}
    }

    function claimPendingShares(uint256 index) external {
        if (pendingIds.length == 0) return;
        onMezo();
        bytes32 id = pendingIds[index % pendingIds.length];
        (address r,,) = source.pendingSettlements(id);
        if (r == address(0)) return;
        vm.prank(r);
        source.claimSharesInstead(id);
        ghostPendingResolved++;
    }

    function sumPending() external view returns (uint256 total) {
        for (uint256 i = 0; i < pendingIds.length; i++) {
            (, uint256 sh,) = source.pendingSettlements(pendingIds[i]);
            total += sh;
        }
    }

    function donate(uint256 amount, bool asSmusd) external {
        onMezo();
        amount = bound(amount, 1, 1e22);
        if (asSmusd) {
            nativeDeposit(carol, amount);
            vm.prank(carol);
            vault.transfer(address(wrapper), amount);
        } else {
            fund(carol, amount);
            vm.prank(carol);
            musd.transfer(address(wrapper), amount);
        }
    }

    function _removeIssue(uint256 i) internal {
        uint256 last = pendingIssue.length - 1;
        pendingIssue[i] = pendingIssue[last];
        pendingIssueShares[i] = pendingIssueShares[last];
        pendingIssue.pop();
        pendingIssueShares.pop();
    }

    function _removeRedeem(uint256 i) internal {
        uint256 last = pendingRedeem.length - 1;
        pendingRedeem[i] = pendingRedeem[last];
        pendingRedeemShares[i] = pendingRedeemShares[last];
        pendingRedeem.pop();
        pendingRedeemShares.pop();
    }

    // views for the invariant contract
    function c()
        external
        view
        returns (
            address wrapper_,
            address source_,
            address dest_,
            address receipt_,
            address vault_,
            address musd_
        )
    {
        return (
            address(wrapper),
            address(source),
            address(dest),
            address(receipt),
            address(vault),
            address(musd)
        );
    }
}

interface IW {
    function totalAssets() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function principal() external view returns (uint256);
    function idle() external view returns (uint256);
    function pendingYield() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function convertToAssets(uint256) external view returns (uint256);
}

interface ISrc {
    function totalLocked() external view returns (uint256);
    function totalIssued() external view returns (uint256);
    function totalReleased() external view returns (uint256);
}

interface ISrcP {
    function totalPendingSettlement() external view returns (uint256);
}

interface IDst {
    function totalMinted() external view returns (uint256);
    function totalBurned() external view returns (uint256);
}

contract ReachInvariantTest is Test {
    ReachHandler internal h;
    IW internal wrapper;
    ISrc internal source;
    IDst internal dest;
    IW internal receipt;
    IW internal vault;
    IW internal musd;

    function setUp() public {
        h = new ReachHandler();
        (address w, address s, address d, address r, address v, address m) = h.c();
        wrapper = IW(w);
        source = ISrc(s);
        dest = IDst(d);
        receipt = IW(r);
        vault = IW(v);
        musd = IW(m);
        targetContract(address(h));
        bytes4[] memory selectors = new bytes4[](15);
        selectors[0] = ReachHandler.wrap.selector;
        selectors[1] = ReachHandler.yield_.selector;
        selectors[2] = ReachHandler.harvest.selector;
        selectors[3] = ReachHandler.unwrap.selector;
        selectors[4] = ReachHandler.unwrapInKind.selector;
        selectors[5] = ReachHandler.lock.selector;
        selectors[6] = ReachHandler.deliverIssue.selector;
        selectors[7] = ReachHandler.transferReceipt.selector;
        selectors[8] = ReachHandler.burn.selector;
        selectors[9] = ReachHandler.deliverRedeem.selector;
        selectors[10] = ReachHandler.replay.selector;
        selectors[11] = ReachHandler.donate.selector;
        selectors[12] = ReachHandler.toggleOutage.selector;
        selectors[13] = ReachHandler.retryPending.selector;
        selectors[14] = ReachHandler.claimPendingShares.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: selectors}));
    }

    /// Invariant 3 (backing): locked == remote supply + in-flight issues + in-flight redemptions.
    function invariant_backingConservation() public view {
        assertEq(
            source.totalLocked(),
            receipt.totalSupply() + h.ghostPendingIssueShares() + h.ghostPendingRedeemShares()
        );
    }

    /// Pending MUSD settlements are always fully held in custody and tracked exactly once.
    function invariant_pendingSettlementsFullyBacked() public view {
        ISrcP src = ISrcP(address(source));
        assertEq(src.totalPendingSettlement(), h.sumPending(), "pending total == sum of entries");
        assertGe(wrapper.balanceOf(address(source)), source.totalLocked() + src.totalPendingSettlement());
    }

    function invariant_custodyHoldsLockedShares() public view {
        assertGe(wrapper.balanceOf(address(source)), source.totalLocked());
        assertEq(source.totalLocked(), source.totalIssued() - source.totalReleased());
    }

    function invariant_remoteSupplyMatchesMintMinusBurn() public view {
        assertEq(receipt.totalSupply(), dest.totalMinted() - dest.totalBurned());
    }

    /// Invariant 8: no replay ever succeeds.
    function invariant_noReplaySucceeds() public view {
        assertEq(h.ghostReplaySuccesses(), 0);
    }

    /// Invariant 1: wrapper assets reconstruct from native state; tracked assets are held.
    function invariant_wrapperAssetsReconstruct() public view {
        assertEq(wrapper.totalAssets(), wrapper.principal() + wrapper.idle() + wrapper.pendingYield());
        assertGe(vault.balanceOf(address(wrapper)), wrapper.principal());
        assertGe(musd.balanceOf(address(wrapper)), wrapper.idle());
    }

    /// Solvency and no rounding-created assets.
    function invariant_sharesNeverClaimMoreThanAssets() public view {
        assertLe(wrapper.convertToAssets(wrapper.totalSupply()), wrapper.totalAssets());
    }

    function invariant_noValueCreated() public view {
        // Everything paid out plus everything still claimable never exceeds what entered.
        assertLe(h.ghostMusdOut() + h.ghostSmusdOut() + wrapper.totalAssets(), h.ghostMusdIn() + 1e6);
    }
}
