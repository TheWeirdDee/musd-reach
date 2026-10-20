// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMUSDSavingsRate} from "../../src/interfaces/IMUSDSavingsRate.sol";
import {IWormhole} from "../../src/interfaces/IWormhole.sol";
import {ReachSavingsWrapper} from "../../src/mezo/ReachSavingsWrapper.sol";
import {ReachSourceGateway} from "../../src/mezo/ReachSourceGateway.sol";
import {ReachDestinationGateway} from "../../src/base/ReachDestinationGateway.sol";
import {RemoteWrapperReceipt} from "../../src/base/RemoteWrapperReceipt.sol";

/// @notice LOCAL FORK tests (not public-testnet evidence): run Reach against the live
///         deployed Mezo testnet MUSDSavingsRate proxy and the real Wormhole Core
///         contracts on Mezo testnet and Base Sepolia. Guardian signatures are produced
///         by a test key written into each forked Core's guardian-set storage, which is
///         the technique used by wormhole-solidity-sdk's WormholeOverride.
///         Enable with RUN_FORK=true.
contract ReachLiveForkTest is Test {
    address constant VAULT = 0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16;
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant VAULT_IMPL = 0x92D12f0a60906b39d81acD9bf8977b6c824cD98C;
    address constant MEZO_CORE = 0x268557122Ffd64c85750d630b716471118F323c8;
    address constant BASE_CORE = 0x79A1027a6A159502049F10906D333EC57E95F083;
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 constant LOG_MESSAGE_PUBLISHED =
        keccak256("LogMessagePublished(address,uint64,uint32,bytes,uint8)");

    uint256 guardianKey = 0xC0FFEE;
    uint256 mezoFork;
    uint256 baseFork;
    bool enabled;

    ReachSavingsWrapper wrapper;
    ReachSourceGateway source;
    ReachDestinationGateway dest;
    RemoteWrapperReceipt receipt;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address guardian = makeAddr("guardian");

    function setUp() public {
        enabled = vm.envOr("RUN_FORK", false);
        if (!enabled) return;
        mezoFork = vm.createFork(vm.envOr("MEZO_TESTNET_RPC", string("https://rpc.test.mezo.org")));
        baseFork = vm.createFork(vm.envOr("BASE_SEPOLIA_RPC", string("https://sepolia.base.org")));

        vm.selectFork(mezoFork);
        _overrideGuardian(MEZO_CORE);
        wrapper = new ReachSavingsWrapper(IMUSDSavingsRate(VAULT), guardian);

        vm.selectFork(baseFork);
        _overrideGuardian(BASE_CORE);
        dest = new ReachDestinationGateway(IWormhole(BASE_CORE), 50, 31611, address(wrapper), 202);
        receipt = dest.receipt();

        vm.selectFork(mezoFork);
        source = new ReachSourceGateway(
            IWormhole(MEZO_CORE), wrapper, 10004, 84532, address(dest), address(receipt), 202, guardian
        );

        vm.selectFork(baseFork);
        dest.bindSourceGateway(address(source));
        vm.selectFork(mezoFork);
    }

    modifier forkOnly() {
        if (!enabled) {
            vm.skip(true);
            return;
        }
        _;
    }

    /// @dev Wormhole Core State: guardianSets mapping at slot 2, guardianSetIndex at slot 3.
    function _overrideGuardian(address core) internal {
        uint32 index = uint32(uint256(vm.load(core, bytes32(uint256(3)))));
        bytes32 setSlot = keccak256(abi.encode(uint256(index), uint256(2)));
        vm.store(core, setSlot, bytes32(uint256(1))); // keys.length = 1
        vm.store(core, keccak256(abi.encode(setSlot)), bytes32(uint256(uint160(vm.addr(guardianKey)))));
    }

    function _vaa(Vm.Log[] memory logs, address core, uint16 emitterChain)
        internal
        view
        returns (bytes memory)
    {
        for (uint256 i = logs.length; i > 0; i--) {
            Vm.Log memory l = logs[i - 1];
            if (l.emitter != core || l.topics[0] != LOG_MESSAGE_PUBLISHED) continue;
            return _sign(_body(l, emitterChain), _gsIndex(core));
        }
        revert("no message");
    }

    function _body(Vm.Log memory l, uint16 emitterChain) internal view returns (bytes memory) {
        (uint64 seq, uint32 nonce, bytes memory payload, uint8 cl) =
            abi.decode(l.data, (uint64, uint32, bytes, uint8));
        return abi.encodePacked(
            uint32(block.timestamp), nonce, emitterChain, l.topics[1], seq, cl, payload
        );
    }

    function _sign(bytes memory body, uint32 gsIndex) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(keccak256(body)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianKey, digest);
        return abi.encodePacked(uint8(1), gsIndex, uint8(1), uint8(0), r, s, uint8(v - 27), body);
    }

    function _gsIndex(address core) internal view returns (uint32) {
        return uint32(uint256(vm.load(core, bytes32(uint256(3)))));
    }

    function test_fork_liveVaultIsTheVerifiedImplementation() public forkOnly {
        vm.selectFork(mezoFork);
        assertEq(block.chainid, 31611);
        address impl = address(uint160(uint256(vm.load(VAULT, IMPL_SLOT))));
        assertEq(impl, VAULT_IMPL, "proxy implementation unchanged");
        assertEq(IMUSDSavingsRate(VAULT).musdToken(), MUSD);
        assertEq(IWormhole(MEZO_CORE).chainId(), 50);
    }

    function test_fork_nativeSemanticsOnLiveVault() public forkOnly {
        vm.selectFork(mezoFork);
        IMUSDSavingsRate v = IMUSDSavingsRate(VAULT);
        deal(MUSD, alice, 1000e18);
        vm.startPrank(alice);
        IERC20(MUSD).approve(VAULT, 1000e18);
        v.deposit(1000e18);
        vm.stopPrank();
        assertEq(v.balanceOf(alice), 1000e18, "live vault mints 1:1");

        // Real yield through the permissionless entry point on the live contract.
        address funder = makeAddr("funder");
        deal(MUSD, funder, 1_000_000e18);
        vm.startPrank(funder);
        IERC20(MUSD).approve(VAULT, 1_000_000e18);
        v.receiveProtocolYield(1_000_000e18);
        vm.stopPrank();
        assertEq(v.balanceOf(alice), 1000e18, "principal does not appreciate");

        vm.prank(alice);
        v.transfer(bob, 1000e18);
        assertGt(v.claimableYield(alice), 0, "accrued yield stays with sender on transfer");
        assertEq(v.claimableYield(bob), 0);
    }

    function test_fork_fullLifecycle_liveVault_realWormholeCores() public forkOnly {
        vm.selectFork(mezoFork);
        deal(MUSD, alice, 500e18);
        vm.startPrank(alice);
        IERC20(MUSD).approve(address(source), 500e18);
        vm.recordLogs();
        (bytes32 issueId,, uint256 shares) = source.depositAndIssue(500e18, alice, 500e18);
        vm.stopPrank();
        assertEq(shares, 500e18);
        assertEq(IMUSDSavingsRate(VAULT).balanceOf(address(wrapper)), 500e18, "real sMUSD in wrapper");
        bytes memory issueVaa = _vaa(vm.getRecordedLogs(), MEZO_CORE, 50);

        vm.selectFork(baseFork);
        (,bool valid,) = IWormhole(BASE_CORE).parseAndVerifyVM(issueVaa);
        assertTrue(valid, "real Base Sepolia Core verifies the Reach VAA");
        assertEq(dest.receiveIssue(issueVaa), issueId);
        assertEq(receipt.balanceOf(alice), 500e18);
        vm.expectRevert();
        dest.receiveIssue(issueVaa);

        vm.prank(alice);
        receipt.transfer(bob, 200e18);
        vm.recordLogs();
        vm.prank(bob);
        dest.burnAndRedeem(200e18, bob, 2, 200e18);
        bytes memory redeemVaa = _vaa(vm.getRecordedLogs(), BASE_CORE, 10004);

        vm.selectFork(mezoFork);
        source.receiveRedeem(redeemVaa);
        assertEq(IERC20(MUSD).balanceOf(bob), 200e18, "MUSD withdrawn from the live vault");
        assertEq(source.totalLocked(), 300e18);
        vm.expectRevert();
        source.receiveRedeem(redeemVaa);

        vm.selectFork(baseFork);
        assertEq(receipt.totalSupply(), 300e18, "remote supply equals remaining lock");
    }

    function test_fork_forgedVaa_rejectedByRealCore() public forkOnly {
        vm.selectFork(mezoFork);
        deal(MUSD, alice, 1e18);
        vm.startPrank(alice);
        IERC20(MUSD).approve(address(source), 1e18);
        vm.recordLogs();
        source.depositAndIssue(1e18, alice, 1e18);
        vm.stopPrank();
        bytes memory vaa = _vaa(vm.getRecordedLogs(), MEZO_CORE, 50);
        vaa[vaa.length - 1] = bytes1(uint8(vaa[vaa.length - 1]) ^ 0xff);
        vm.selectFork(baseFork);
        vm.expectRevert();
        dest.receiveIssue(vaa);
        assertEq(receipt.totalSupply(), 0);
    }
}
