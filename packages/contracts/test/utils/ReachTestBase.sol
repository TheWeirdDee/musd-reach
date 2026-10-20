// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IMUSDSavingsRate} from "../../src/interfaces/IMUSDSavingsRate.sol";
import {IWormhole} from "../../src/interfaces/IWormhole.sol";
import {ReachSavingsWrapper} from "../../src/mezo/ReachSavingsWrapper.sol";
import {ReachSourceGateway} from "../../src/mezo/ReachSourceGateway.sol";
import {ReachDestinationGateway} from "../../src/base/ReachDestinationGateway.sol";
import {RemoteWrapperReceipt} from "../../src/base/RemoteWrapperReceipt.sol";
import {TestWormhole} from "./TestWormhole.sol";

/// @notice Test-only stand-in for the MUSD token (a plain 18-decimal ERC-20).
contract TestMUSD is ERC20 {
    constructor() ERC20("Mezo USD", "MUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

interface IOwnableVault {
    function initialize(address musd) external;
    function setStrategy(address strategy) external;
    function owner() external view returns (address);
}

/// @notice Shared fixture: the explorer-verified MUSDSavingsRate source (vendored, compiled
///         with its original solc 0.8.33) behind an ERC1967 proxy, two Wormhole cores with
///         real VAA verification, and a full Reach deployment. Mezo and Base are modelled
///         in one EVM by switching `block.chainid`.
abstract contract ReachTestBase is Test {
    uint256 internal constant MEZO_EVM = 31611;
    uint256 internal constant BASE_EVM = 84532;
    uint16 internal constant MEZO_WH = 50;
    uint16 internal constant BASE_WH = 10004;
    uint8 internal constant CONSISTENCY = 202;

    uint256 internal guardianKey = 0xA11CE;
    address internal guardianSigner;

    TestMUSD internal musd;
    IMUSDSavingsRate internal vault;
    TestWormhole internal mezoCore;
    TestWormhole internal baseCore;
    ReachSavingsWrapper internal wrapper;
    ReachSourceGateway internal source;
    ReachDestinationGateway internal dest;
    RemoteWrapperReceipt internal receipt;

    address internal deployer = makeAddr("deployer");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal yieldFunder = makeAddr("yieldFunder");

    bytes32 internal constant LOG_MESSAGE_PUBLISHED =
        keccak256("LogMessagePublished(address,uint64,uint32,bytes,uint8)");

    struct Published {
        address emitter;
        uint64 sequence;
        uint32 nonce;
        bytes payload;
        uint8 consistencyLevel;
    }

    function setUp() public virtual {
        guardianSigner = vm.addr(guardianKey);
        address[] memory guardians = new address[](1);
        guardians[0] = guardianSigner;

        vm.chainId(MEZO_EVM);
        musd = new TestMUSD();
        vault = _deployNativeVault(address(musd));
        mezoCore = new TestWormhole(MEZO_WH, MEZO_EVM, guardians);
        vm.prank(deployer);
        wrapper = new ReachSavingsWrapper(vault, guardian);

        vm.chainId(BASE_EVM);
        baseCore = new TestWormhole(BASE_WH, BASE_EVM, guardians);
        vm.prank(deployer);
        dest = new ReachDestinationGateway(
            IWormhole(address(baseCore)), MEZO_WH, MEZO_EVM, address(wrapper), CONSISTENCY
        );
        receipt = dest.receipt();

        vm.chainId(MEZO_EVM);
        vm.prank(deployer);
        source = new ReachSourceGateway(
            IWormhole(address(mezoCore)),
            wrapper,
            BASE_WH,
            BASE_EVM,
            address(dest),
            address(receipt),
            CONSISTENCY,
            guardian
        );

        vm.chainId(BASE_EVM);
        vm.prank(deployer);
        dest.bindSourceGateway(address(source));
        vm.chainId(MEZO_EVM);
    }

    function _deployNativeVault(address musd_) internal returns (IMUSDSavingsRate v) {
        address forwarder = makeAddr("trustedForwarder");
        address impl = deployCode(
            "test/vendor/mezo-savings/contracts/vaults/MUSDSavingsRate.sol:MUSDSavingsRate",
            abi.encode(forwarder)
        );
        ERC1967Proxy proxy =
            new ERC1967Proxy(impl, abi.encodeCall(IOwnableVault.initialize, (musd_)));
        v = IMUSDSavingsRate(address(proxy));
    }

    // ------------------------------------------------------------------
    // Chain helpers
    // ------------------------------------------------------------------

    function onMezo() internal {
        vm.chainId(MEZO_EVM);
    }

    function onBase() internal {
        vm.chainId(BASE_EVM);
    }

    function fund(address who, uint256 amount) internal {
        musd.mint(who, amount);
    }

    /// @dev Real yield delivered through the vault's permissionless receiveProtocolYield.
    function addNativeYield(uint256 amount) internal {
        musd.mint(yieldFunder, amount);
        vm.startPrank(yieldFunder);
        musd.approve(address(vault), amount);
        vault.receiveProtocolYield(amount);
        vm.stopPrank();
    }

    function wrapMusd(address who, uint256 amount) internal returns (uint256 shares) {
        fund(who, amount);
        vm.startPrank(who);
        musd.approve(address(wrapper), amount);
        shares = wrapper.deposit(amount, who);
        vm.stopPrank();
    }

    function nativeDeposit(address who, uint256 amount) internal {
        fund(who, amount);
        vm.startPrank(who);
        musd.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // VAA helpers
    // ------------------------------------------------------------------

    function lastPublished(Vm.Log[] memory logs, address core)
        internal
        pure
        returns (Published memory p)
    {
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == core && logs[i].topics[0] == LOG_MESSAGE_PUBLISHED) {
                p.emitter = address(uint160(uint256(logs[i].topics[1])));
                (p.sequence, p.nonce, p.payload, p.consistencyLevel) =
                    abi.decode(logs[i].data, (uint64, uint32, bytes, uint8));
                found = true;
            }
        }
        require(found, "no LogMessagePublished");
    }

    function vaaBody(uint16 emitterChain, Published memory p) internal view returns (bytes memory) {
        return abi.encodePacked(
            uint32(block.timestamp),
            p.nonce,
            emitterChain,
            bytes32(uint256(uint160(p.emitter))),
            p.sequence,
            p.consistencyLevel,
            p.payload
        );
    }

    function signVaa(bytes memory body, uint256 key, uint32 gsIndex)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encodePacked(keccak256(body)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(uint8(1), gsIndex, uint8(1), uint8(0), r, s, uint8(v - 27), body);
    }

    function makeVaa(uint16 emitterChain, Published memory p) internal view returns (bytes memory) {
        return signVaa(vaaBody(emitterChain, p), guardianKey, 0);
    }

    // ------------------------------------------------------------------
    // Lifecycle helpers
    // ------------------------------------------------------------------

    /// @dev Lock `shares` of `who`'s wSMUSD and return the signed ISSUE VAA.
    function lockShares(address who, uint256 shares, address recipient)
        internal
        returns (bytes memory vaa, bytes32 transferId)
    {
        onMezo();
        vm.recordLogs();
        vm.startPrank(who);
        wrapper.approve(address(source), shares);
        (transferId,) = source.lockAndIssue(shares, recipient);
        vm.stopPrank();
        vaa = makeVaa(MEZO_WH, lastPublished(vm.getRecordedLogs(), address(mezoCore)));
    }

    function burnReceipt(address who, uint256 shares, address mezoRecipient, uint8 mode, uint256 minAssets)
        internal
        returns (bytes memory vaa, bytes32 transferId)
    {
        onBase();
        vm.recordLogs();
        vm.prank(who);
        (transferId,) = dest.burnAndRedeem(shares, mezoRecipient, mode, minAssets);
        vaa = makeVaa(BASE_WH, lastPublished(vm.getRecordedLogs(), address(baseCore)));
    }
}
