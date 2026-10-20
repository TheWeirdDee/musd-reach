// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Test.sol";
import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {ReachGatewayBase} from "../src/shared/ReachGatewayBase.sol";
import {ReachMessages} from "../src/shared/ReachMessages.sol";
import {ReachSourceGateway} from "../src/mezo/ReachSourceGateway.sol";
import {ReachDestinationGateway} from "../src/base/ReachDestinationGateway.sol";
import {RemoteWrapperReceipt} from "../src/base/RemoteWrapperReceipt.sol";
import {ReachTestBase, IOwnableVault} from "./utils/ReachTestBase.sol";
import {BreakableStrategy} from "./ReachSavingsWrapper.t.sol";

contract ReachGatewaysTest is ReachTestBase {
    uint8 constant SHARES = 1;
    uint8 constant MUSD_MODE = 2;

    // ------------------------------------------------------------------
    // Happy path: full bidirectional lifecycle (R-004..R-007)
    // ------------------------------------------------------------------

    function test_fullRoundTrip_sharesMode() public {
        uint256 shares = wrapMusd(alice, 1000e18);
        (bytes memory issueVaa, bytes32 issueId) = lockShares(alice, 400e18, alice);

        assertEq(wrapper.balanceOf(address(source)), 400e18, "shares in custody");
        assertEq(source.totalLocked(), 400e18);
        assertEq(wrapper.balanceOf(alice), shares - 400e18);
        (,, uint256 recordedShares,,,) = source.issues(issueId);
        assertEq(recordedShares, 400e18);

        onBase();
        assertEq(receipt.balanceOf(alice), 0, "nothing minted before delivery");
        bytes32 consumedId = dest.receiveIssue(issueVaa);
        assertEq(consumedId, issueId, "same transfer id on both chains");
        assertEq(receipt.balanceOf(alice), 400e18, "exact units minted");
        assertEq(receipt.totalSupply(), 400e18);

        // receipt is a standard transferable ERC-20
        vm.prank(alice);
        receipt.transfer(bob, 150e18);

        (bytes memory redeemVaa,) = burnReceipt(bob, 150e18, carol, SHARES, 0);
        assertEq(receipt.totalSupply(), 250e18);
        assertEq(dest.totalBurned(), 150e18);

        onMezo();
        assertEq(wrapper.balanceOf(carol), 0, "nothing released before delivery");
        source.receiveRedeem(redeemVaa);
        assertEq(wrapper.balanceOf(carol), 150e18, "exact shares released to recipient");
        assertEq(source.totalLocked(), 250e18);
        assertEq(source.totalLocked(), receipt.totalSupply(), "backing == remote supply");
    }

    function test_fullRoundTrip_musdMode_redeemsThroughWrapperAndVault() public {
        wrapMusd(alice, 1000e18);
        addNativeYield(100e18);
        (bytes memory issueVaa,) = lockShares(alice, 1000e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);

        (bytes memory redeemVaa,) = burnReceipt(alice, 500e18, bob, MUSD_MODE, 549e18);
        onMezo();
        source.receiveRedeem(redeemVaa);
        assertApproxEqAbs(musd.balanceOf(bob), 550e18, 2, "MUSD incl. wrapper yield share");
        assertEq(wrapper.balanceOf(bob), 0);
        assertEq(source.totalLocked(), 500e18);
    }

    function test_depositAndIssue_singleTransaction() public {
        fund(alice, 300e18);
        vm.startPrank(alice);
        musd.approve(address(source), 300e18);
        vm.recordLogs();
        (bytes32 id,, uint256 shares) = source.depositAndIssue(300e18, bob, 300e18);
        vm.stopPrank();
        assertEq(shares, 300e18);
        assertEq(musd.allowance(alice, address(source)), 0, "bounded allowance fully used");
        bytes memory vaa = makeVaa(MEZO_WH, lastPublished(vm.getRecordedLogs(), address(mezoCore)));
        onBase();
        assertEq(dest.receiveIssue(vaa), id);
        assertEq(receipt.balanceOf(bob), 300e18);
    }

    function test_depositSavingsAndIssue_keepsPriorYieldWithUser() public {
        nativeDeposit(alice, 200e18);
        addNativeYield(20e18);
        vm.startPrank(alice);
        vault.approve(address(source), 200e18);
        vm.recordLogs();
        (,, uint256 shares) = source.depositSavingsAndIssue(200e18, alice, 200e18);
        vm.stopPrank();
        assertEq(shares, 200e18);
        assertApproxEqAbs(vault.claimableYield(alice), 20e18, 1, "prior yield remains claimable");
        assertEq(vault.claimableYield(address(source)), 0, "gateway holds no native yield");
        bytes memory vaa = makeVaa(MEZO_WH, lastPublished(vm.getRecordedLogs(), address(mezoCore)));
        onBase();
        dest.receiveIssue(vaa);
        assertEq(receipt.balanceOf(alice), 200e18);
    }

    function test_relayerIsUntrusted_anyoneCanDeliver() public {
        wrapMusd(alice, 10e18);
        (bytes memory vaa,) = lockShares(alice, 10e18, alice);
        onBase();
        vm.prank(makeAddr("randomRelayer"));
        dest.receiveIssue(vaa);
        assertEq(receipt.balanceOf(alice), 10e18, "minted to the signed recipient, not the relayer");
    }

    // ------------------------------------------------------------------
    // Replay and forgery (R-008)
    // ------------------------------------------------------------------

    function test_issueReplay_rejected_noSupplyChange() public {
        wrapMusd(alice, 10e18);
        (bytes memory vaa, bytes32 id) = lockShares(alice, 10e18, alice);
        onBase();
        dest.receiveIssue(vaa);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.AlreadyConsumed.selector, id));
        dest.receiveIssue(vaa);
        assertEq(receipt.totalSupply(), 10e18);
    }

    function test_redeemReplay_rejected_noDoubleRelease() public {
        wrapMusd(alice, 10e18);
        (bytes memory issueVaa,) = lockShares(alice, 10e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (bytes memory redeemVaa, bytes32 id) = burnReceipt(alice, 4e18, alice, SHARES, 0);
        onMezo();
        source.receiveRedeem(redeemVaa);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.AlreadyConsumed.selector, id));
        source.receiveRedeem(redeemVaa);
        assertEq(wrapper.balanceOf(alice), 4e18);
        assertEq(source.totalLocked(), 6e18);
    }

    function test_resignedSameMessage_newDigest_stillRejectedByTransferId() public {
        // A second guardian observation of the same message (different timestamp => different
        // VAA digest) must not mint twice: transfer ids are consumed, not just digests.
        wrapMusd(alice, 10e18);
        onMezo();
        vm.recordLogs();
        vm.startPrank(alice);
        wrapper.approve(address(source), 10e18);
        (bytes32 id,) = source.lockAndIssue(10e18, alice);
        vm.stopPrank();
        Published memory p = lastPublished(vm.getRecordedLogs(), address(mezoCore));
        bytes memory vaa1 = makeVaa(MEZO_WH, p);
        vm.warp(block.timestamp + 1);
        bytes memory vaa2 = makeVaa(MEZO_WH, p);
        assertTrue(keccak256(vaa1) != keccak256(vaa2));
        onBase();
        dest.receiveIssue(vaa1);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.AlreadyConsumed.selector, id));
        dest.receiveIssue(vaa2);
        assertEq(receipt.totalSupply(), 10e18);
    }

    function test_forgedSignature_rejected() public {
        wrapMusd(alice, 10e18);
        onMezo();
        vm.recordLogs();
        vm.startPrank(alice);
        wrapper.approve(address(source), 10e18);
        source.lockAndIssue(10e18, alice);
        vm.stopPrank();
        Published memory p = lastPublished(vm.getRecordedLogs(), address(mezoCore));
        bytes memory forged = signVaa(vaaBody(MEZO_WH, p), 0xBAD, 0);
        onBase();
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.InvalidVaa.selector, "VM signature invalid"));
        dest.receiveIssue(forged);
        assertEq(receipt.totalSupply(), 0);
    }

    function test_alteredPayload_rejected() public {
        wrapMusd(alice, 10e18);
        (bytes memory vaa,) = lockShares(alice, 10e18, alice);
        // flip a byte inside the shares field near the end of the payload
        vaa[vaa.length - 200] = bytes1(uint8(vaa[vaa.length - 200]) ^ 0x01);
        onBase();
        vm.expectRevert();
        dest.receiveIssue(vaa);
        assertEq(receipt.totalSupply(), 0);
    }

    function test_fakeEmitter_sameChain_rejected() public {
        // An attacker deploys their own gateway on Mezo that emits a well-formed ISSUE
        // message naming the real destination. Guardians will sign it, but its emitter is
        // not the enrolled source gateway.
        onMezo();
        ReachSourceGateway rogue = new ReachSourceGateway(
            IWormhole(address(mezoCore)),
            wrapper,
            BASE_WH,
            BASE_EVM,
            address(dest),
            address(receipt),
            CONSISTENCY,
            address(this)
        );
        wrapMusd(alice, 10e18);
        vm.recordLogs();
        vm.startPrank(alice);
        wrapper.approve(address(rogue), 10e18);
        rogue.lockAndIssue(10e18, alice);
        vm.stopPrank();
        bytes memory vaa = makeVaa(MEZO_WH, lastPublished(vm.getRecordedLogs(), address(mezoCore)));
        onBase();
        vm.expectRevert(
            abi.encodeWithSelector(
                ReachGatewayBase.UnknownEmitter.selector, bytes32(uint256(uint160(address(rogue))))
            )
        );
        dest.receiveIssue(vaa);
    }

    function test_wrongEmitterChain_rejected() public {
        wrapMusd(alice, 10e18);
        onMezo();
        vm.recordLogs();
        vm.startPrank(alice);
        wrapper.approve(address(source), 10e18);
        source.lockAndIssue(10e18, alice);
        vm.stopPrank();
        Published memory p = lastPublished(vm.getRecordedLogs(), address(mezoCore));
        bytes memory vaa = makeVaa(2, p); // claims to come from Ethereum
        onBase();
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.UnknownEmitterChain.selector, uint16(2)));
        dest.receiveIssue(vaa);
    }

    function test_messageForAnotherDestination_rejected() public {
        // Second destination deployment bound to the same source: a message targeted at
        // `dest` must not be accepted by `dest2`.
        onBase();
        ReachDestinationGateway dest2 = new ReachDestinationGateway(
            IWormhole(address(baseCore)), MEZO_WH, MEZO_EVM, address(wrapper), CONSISTENCY
        );
        dest2.bindSourceGateway(address(source));
        wrapMusd(alice, 10e18);
        (bytes memory vaa,) = lockShares(alice, 10e18, alice);
        onBase();
        vm.expectRevert(ReachGatewayBase.DomainMismatch.selector);
        dest2.receiveIssue(vaa);
        dest.receiveIssue(vaa);
        assertEq(receipt.totalSupply(), 10e18);
    }

    function test_wrongLocalChain_rejected() public {
        // Same contracts, but the VAA is delivered on a chain whose id differs from the
        // signed target (e.g. a fork or a redeployment at the same address elsewhere).
        wrapMusd(alice, 10e18);
        (bytes memory vaa,) = lockShares(alice, 10e18, alice);
        vm.chainId(8453); // Base mainnet id
        vm.expectRevert(ReachGatewayBase.DomainMismatch.selector);
        dest.receiveIssue(vaa);
    }

    function test_issueVaaCannotBeUsedAsRedeem() public {
        wrapMusd(alice, 10e18);
        (bytes memory vaa,) = lockShares(alice, 10e18, alice);
        onMezo();
        // emitted by Mezo, so the Mezo gateway rejects it as a foreign-chain message
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.UnknownEmitterChain.selector, MEZO_WH));
        source.receiveRedeem(vaa);
    }

    function test_staleGuardianSet_rejected() public {
        wrapMusd(alice, 10e18);
        (bytes memory vaa,) = lockShares(alice, 10e18, alice);
        onBase();
        address[] memory g = new address[](1);
        g[0] = vm.addr(0xB0B);
        baseCore.rotateGuardians(g);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.InvalidVaa.selector, "not current guardian set"));
        dest.receiveIssue(vaa);
    }

    // ------------------------------------------------------------------
    // Access control and configuration
    // ------------------------------------------------------------------

    function test_receiptMint_onlyGateway() public {
        onBase();
        vm.expectRevert(RemoteWrapperReceipt.OnlyGateway.selector);
        receipt.mint(alice, 1);
        vm.expectRevert(RemoteWrapperReceipt.OnlyGateway.selector);
        receipt.burnFrom(alice, 1);
    }

    function test_bindSourceGateway_isOneTimeAndBinderOnly() public {
        onBase();
        vm.prank(deployer);
        vm.expectRevert(ReachDestinationGateway.AlreadyBound.selector);
        dest.bindSourceGateway(alice);

        ReachDestinationGateway fresh = new ReachDestinationGateway(
            IWormhole(address(baseCore)), MEZO_WH, MEZO_EVM, address(wrapper), CONSISTENCY
        );
        vm.prank(alice);
        vm.expectRevert(ReachDestinationGateway.NotBinder.selector);
        fresh.bindSourceGateway(alice);
    }

    function test_unboundDestination_rejectsAndCannotBurnToNowhere() public {
        onBase();
        ReachDestinationGateway fresh = new ReachDestinationGateway(
            IWormhole(address(baseCore)), MEZO_WH, MEZO_EVM, address(wrapper), CONSISTENCY
        );
        wrapMusd(alice, 1e18);
        (bytes memory vaa,) = lockShares(alice, 1e18, alice);
        onBase();
        vm.expectRevert(ReachGatewayBase.PeerNotSet.selector);
        fresh.receiveIssue(vaa);
    }

    function test_constructorRejectsCoreOnWrongChain() public {
        onBase();
        vm.expectRevert(ReachGatewayBase.WrongChain.selector);
        new ReachDestinationGateway(
            IWormhole(address(mezoCore)), MEZO_WH, MEZO_EVM, address(wrapper), CONSISTENCY
        );
    }

    function test_guardianPause_blocksNewLocks_butRedemptionsStillRelease() public {
        wrapMusd(alice, 20e18);
        (bytes memory issueVaa,) = lockShares(alice, 10e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (bytes memory redeemVaa,) = burnReceipt(alice, 10e18, alice, SHARES, 0);

        onMezo();
        vm.prank(guardian);
        source.setIssuancePaused(true);
        vm.startPrank(alice);
        wrapper.approve(address(source), 10e18);
        vm.expectRevert(ReachSourceGateway.IssuanceIsPaused.selector);
        source.lockAndIssue(10e18, alice);
        vm.stopPrank();

        source.receiveRedeem(redeemVaa);
        assertEq(wrapper.balanceOf(alice), 20e18, "exit honoured while paused");
    }

    function test_nonGuardianCannotPause() public {
        onMezo();
        vm.expectRevert(ReachSourceGateway.NotGuardian.selector);
        source.setIssuancePaused(true);
    }

    function test_incorrectMessageFee_rejected() public {
        onMezo();
        mezoCore.setMessageFee(1 wei);
        wrapMusd(alice, 1e18);
        vm.startPrank(alice);
        wrapper.approve(address(source), 1e18);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.IncorrectMessageFee.selector, 1, 0));
        source.lockAndIssue(1e18, alice);
        vm.deal(alice, 1 wei);
        source.lockAndIssue{value: 1 wei}(1e18, alice);
        vm.stopPrank();
    }

    function test_zeroAmountAndZeroRecipient_rejected() public {
        wrapMusd(alice, 1e18);
        vm.startPrank(alice);
        wrapper.approve(address(source), 1e18);
        vm.expectRevert(ReachGatewayBase.ZeroAmount.selector);
        source.lockAndIssue(0, alice);
        vm.expectRevert(ReachGatewayBase.ZeroAddress.selector);
        source.lockAndIssue(1e18, address(0));
        vm.stopPrank();

        onBase();
        vm.expectRevert(ReachGatewayBase.ZeroAmount.selector);
        dest.burnAndRedeem(0, alice, SHARES, 0);
        vm.expectRevert(ReachGatewayBase.ZeroAddress.selector);
        dest.burnAndRedeem(1, address(0), SHARES, 0);
        vm.expectRevert(ReachDestinationGateway.InvalidMode.selector);
        dest.burnAndRedeem(1, alice, 3, 0);
    }

    function test_cannotBurnMoreThanHeld() public {
        wrapMusd(alice, 5e18);
        (bytes memory vaa,) = lockShares(alice, 5e18, alice);
        onBase();
        dest.receiveIssue(vaa);
        vm.prank(bob);
        vm.expectRevert();
        dest.burnAndRedeem(1, bob, SHARES, 0);
        vm.prank(alice);
        vm.expectRevert();
        dest.burnAndRedeem(5e18 + 1, alice, SHARES, 0);
    }

    // ------------------------------------------------------------------
    // MUSD settlement: the payout asset is never switched without the recipient
    // ------------------------------------------------------------------

    function _breakVault() internal returns (BreakableStrategy bad) {
        bad = new BreakableStrategy(address(musd), address(vault));
        IOwnableVault(address(vault)).setStrategy(address(bad));
        bad.setBroken(true);
    }

    function _musdRedemption(uint256 minAssets) internal returns (bytes memory vaa, bytes32 id) {
        wrapMusd(alice, 100e18);
        (bytes memory issueVaa,) = lockShares(alice, 100e18, alice);
        onBase();
        dest.receiveIssue(issueVaa);
        (vaa, id) = burnReceipt(alice, 100e18, bob, MUSD_MODE, minAssets);
        onMezo();
    }

    function test_musdMode_vaultOutage_becomesPending_notShares() public {
        (bytes memory redeemVaa, bytes32 id) = _musdRedemption(0);
        BreakableStrategy bad = _breakVault();

        vm.expectEmit(true, true, false, false, address(source));
        emit ReachSourceGateway.SettlementPending(id, bob, 100e18, 0, "");
        source.receiveRedeem(redeemVaa);

        assertEq(wrapper.balanceOf(bob), 0, "payout asset not switched");
        assertEq(musd.balanceOf(bob), 0);
        assertEq(source.totalLocked(), 0, "no longer backs a remote receipt");
        assertEq(source.totalPendingSettlement(), 100e18);
        assertEq(wrapper.balanceOf(address(source)), 100e18, "shares held in custody for bob");
        (address r, uint256 sh,) = source.pendingSettlements(id);
        assertEq(r, bob);
        assertEq(sh, 100e18);

        // Retrying while the vault is still broken reverts and changes nothing.
        vm.expectRevert();
        source.retrySettlement(id);

        // Vault recovers; anyone can retry and the recipient receives MUSD as chosen.
        bad.setBroken(false);
        vm.prank(carol);
        uint256 out = source.retrySettlement(id);
        assertEq(out, 100e18);
        assertEq(musd.balanceOf(bob), 100e18);
        assertEq(source.totalPendingSettlement(), 0);
        vm.expectRevert(ReachSourceGateway.NoPendingSettlement.selector);
        source.retrySettlement(id);
    }

    function test_musdMode_belowMinAssets_becomesPending_recipientDecides() public {
        (bytes memory redeemVaa, bytes32 id) = _musdRedemption(101e18);
        source.receiveRedeem(redeemVaa);
        assertEq(wrapper.balanceOf(bob), 0);
        assertEq(musd.balanceOf(bob), 0);

        // Nobody but the recipient can relax the minimum or switch to shares.
        vm.prank(carol);
        vm.expectRevert(ReachSourceGateway.NotRecipient.selector);
        source.settleWithMinAssets(id, 0);
        vm.prank(carol);
        vm.expectRevert(ReachSourceGateway.NotRecipient.selector);
        source.claimSharesInstead(id);
        // A permissionless retry keeps the original minimum and fails.
        vm.expectRevert();
        source.retrySettlement(id);

        vm.prank(bob);
        uint256 out = source.settleWithMinAssets(id, 100e18);
        assertEq(out, 100e18);
        assertEq(musd.balanceOf(bob), 100e18);
    }

    function test_pendingSettlement_recipientMayChooseShares() public {
        (bytes memory redeemVaa, bytes32 id) = _musdRedemption(0);
        _breakVault();
        source.receiveRedeem(redeemVaa);
        vm.prank(bob);
        source.claimSharesInstead(id);
        assertEq(wrapper.balanceOf(bob), 100e18);
        assertEq(source.totalPendingSettlement(), 0);
        vm.prank(bob);
        vm.expectRevert(ReachSourceGateway.NoPendingSettlement.selector);
        source.claimSharesInstead(id);
    }

    function test_pendingSettlement_cannotBeReplayedIntoSecondPayout() public {
        (bytes memory redeemVaa, bytes32 id) = _musdRedemption(0);
        BreakableStrategy bad = _breakVault();
        source.receiveRedeem(redeemVaa);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.AlreadyConsumed.selector, id));
        source.receiveRedeem(redeemVaa);
        bad.setBroken(false);
        source.retrySettlement(id);
        vm.prank(bob);
        vm.expectRevert(ReachSourceGateway.NoPendingSettlement.selector);
        source.claimSharesInstead(id);
        assertEq(musd.balanceOf(bob), 100e18, "paid exactly once");
        assertEq(wrapper.balanceOf(bob), 0);
    }

    function test_redeemForRecipient_onlySelf() public {
        onMezo();
        vm.expectRevert(ReachSourceGateway.OnlySelf.selector);
        source.redeemForRecipient(1, alice, 0);
    }

    // ------------------------------------------------------------------
    // Delay and ordering
    // ------------------------------------------------------------------

    function test_delayedDelivery_outOfOrder_stillExactlyOnce() public {
        wrapMusd(alice, 30e18);
        (bytes memory v1,) = lockShares(alice, 10e18, alice);
        (bytes memory v2,) = lockShares(alice, 20e18, bob);
        vm.warp(block.timestamp + 30 days);
        onBase();
        dest.receiveIssue(v2);
        dest.receiveIssue(v1);
        assertEq(receipt.balanceOf(alice), 10e18);
        assertEq(receipt.balanceOf(bob), 20e18);
        assertEq(receipt.totalSupply(), source.totalLocked());
    }

    function test_noRefundPathExists_lockedUntilAuthenticatedBurn() public {
        wrapMusd(alice, 10e18);
        lockShares(alice, 10e18, alice);
        vm.warp(block.timestamp + 3650 days);
        onMezo();
        // there is no cancel/refund entry point; only receiveRedeem can release
        assertEq(wrapper.balanceOf(address(source)), 10e18);
        assertEq(source.totalLocked(), 10e18);
    }

    function test_messageFieldsAreFullyBound() public {
        wrapMusd(alice, 7e18);
        onMezo();
        vm.recordLogs();
        vm.startPrank(alice);
        wrapper.approve(address(source), 7e18);
        source.lockAndIssue(7e18, bob);
        vm.stopPrank();
        Published memory p = lastPublished(vm.getRecordedLogs(), address(mezoCore));
        ReachMessages.Message memory m = abi.decode(p.payload, (ReachMessages.Message));
        assertEq(m.protocolId, keccak256("MUSD_REACH"));
        assertEq(m.version, 1);
        assertEq(m.direction, 1);
        assertEq(m.originEvmChainId, MEZO_EVM);
        assertEq(m.targetEvmChainId, BASE_EVM);
        assertEq(m.originWormholeChainId, MEZO_WH);
        assertEq(m.targetWormholeChainId, BASE_WH);
        assertEq(m.originGateway, address(source));
        assertEq(m.targetGateway, address(dest));
        assertEq(m.wrapper, address(wrapper));
        assertEq(m.receipt, address(receipt));
        assertEq(m.shares, 7e18);
        assertEq(m.sender, alice);
        assertEq(m.recipient, bob);
        assertEq(p.consistencyLevel, CONSISTENCY);
        assertEq(p.emitter, address(source));
    }
}
