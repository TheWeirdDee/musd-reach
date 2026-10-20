// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";
import {ReachMessages} from "./ReachMessages.sol";

/// @title ReachGatewayBase
/// @notice Shared authenticated-messaging logic for both Reach gateways.
/// @dev    A message is accepted only if all of the following hold:
///           1. Wormhole Core verifies the VAA's guardian signatures (`valid`).
///           2. The VAA was emitted on the peer chain by the enrolled peer gateway.
///           3. The payload decodes as Reach protocol version 1 in the expected direction.
///           4. Origin/target EVM chain ids, Wormhole chain ids, gateways, wrapper and
///              receipt all equal this deployment's immutable configuration.
///           5. Neither the transfer id nor the VAA digest has been consumed before.
///         Relayers are untrusted: anyone may submit a VAA, but only a guardian-signed
///         message from the peer gateway can change balances, and only once.
abstract contract ReachGatewayBase is ReentrancyGuard {
    IWormhole public immutable wormhole;
    uint16 public immutable localWormholeChainId;
    uint16 public immutable peerWormholeChainId;
    uint256 public immutable peerEvmChainId;
    /// @notice Mezo-side ReachSavingsWrapper bound into every message.
    address public immutable wrapper;
    uint8 public immutable consistencyLevel;

    /// @notice Next outbound nonce of this gateway.
    uint64 public nextNonce;

    mapping(bytes32 transferId => bool) public transferConsumed;
    mapping(bytes32 vaaDigest => bool) public vaaConsumed;

    event MessagePublished(
        bytes32 indexed transferId, uint64 indexed sequence, uint64 nonce, uint8 direction
    );
    event MessageConsumed(bytes32 indexed transferId, bytes32 indexed vaaDigest, uint8 direction);

    error ZeroAddress();
    error ZeroAmount();
    error WrongChain();
    error InvalidVaa(string reason);
    error UnknownEmitterChain(uint16 chainId);
    error UnknownEmitter(bytes32 emitter);
    error WrongDirection();
    error DomainMismatch();
    error AlreadyConsumed(bytes32 id);
    error IncorrectMessageFee(uint256 expected, uint256 provided);
    error PeerNotSet();

    constructor(
        IWormhole wormhole_,
        uint16 peerWormholeChainId_,
        uint256 peerEvmChainId_,
        address wrapper_,
        uint8 consistencyLevel_
    ) {
        if (address(wormhole_) == address(0) || wrapper_ == address(0)) revert ZeroAddress();
        if (wormhole_.evmChainId() != block.chainid) revert WrongChain();
        wormhole = wormhole_;
        localWormholeChainId = wormhole_.chainId();
        peerWormholeChainId = peerWormholeChainId_;
        peerEvmChainId = peerEvmChainId_;
        wrapper = wrapper_;
        consistencyLevel = consistencyLevel_;
    }

    /// @dev Address of the enrolled peer gateway on the other chain.
    function _peerGateway() internal view virtual returns (address);

    /// @dev Address of the Base-side RemoteWrapperReceipt.
    function _receipt() internal view virtual returns (address);

    /// @dev NAV snapshot attached to outbound messages; only the Mezo gateway reports one.
    function _navSnapshot()
        internal
        view
        virtual
        returns (uint256 assets, uint256 supply, uint64 timestamp, uint64 blockNumber)
    {
        return (0, 0, 0, 0);
    }

    /// @notice Fee Wormhole Core currently charges per published message.
    function messageFee() public view returns (uint256) {
        return wormhole.messageFee();
    }

    function _baseMessage(uint8 direction, uint256 shares, address recipient)
        internal
        returns (ReachMessages.Message memory m)
    {
        address peer = _peerGateway();
        if (peer == address(0)) revert PeerNotSet();
        (uint256 navAssets, uint256 navSupply, uint64 navTimestamp, uint64 navBlock) = _navSnapshot();
        m = ReachMessages.Message({
            protocolId: ReachMessages.PROTOCOL_ID,
            version: ReachMessages.VERSION,
            direction: direction,
            originEvmChainId: block.chainid,
            targetEvmChainId: peerEvmChainId,
            originWormholeChainId: localWormholeChainId,
            targetWormholeChainId: peerWormholeChainId,
            originGateway: address(this),
            targetGateway: peer,
            wrapper: wrapper,
            receipt: _receipt(),
            nonce: nextNonce++,
            shares: shares,
            sender: msg.sender,
            recipient: recipient,
            redeemMode: ReachMessages.MODE_NONE,
            minAssets: 0,
            navAssets: navAssets,
            navSupply: navSupply,
            navTimestamp: navTimestamp,
            navBlock: navBlock
        });
    }

    function _publish(ReachMessages.Message memory m)
        internal
        returns (bytes32 id, uint64 sequence)
    {
        uint256 fee = wormhole.messageFee();
        if (msg.value != fee) revert IncorrectMessageFee(fee, msg.value);
        id = ReachMessages.transferId(m);
        // Wormhole's 32-bit nonce is only a batching hint; uniqueness comes from `m.nonce`.
        sequence = wormhole.publishMessage{value: fee}(0, ReachMessages.encode(m), consistencyLevel);
        emit MessagePublished(id, sequence, m.nonce, m.direction);
    }

    /// @dev Verifies and consumes an inbound VAA. Reverts on any mismatch, so a rejected
    ///      VAA never changes state.
    function _consume(bytes calldata encodedVaa, uint8 expectedDirection)
        internal
        returns (ReachMessages.Message memory m, bytes32 id)
    {
        (IWormhole.VM memory vm, bool valid, string memory reason) =
            wormhole.parseAndVerifyVM(encodedVaa);
        if (!valid) revert InvalidVaa(reason);
        if (vm.emitterChainId != peerWormholeChainId) revert UnknownEmitterChain(vm.emitterChainId);
        address peer = _peerGateway();
        if (peer == address(0)) revert PeerNotSet();
        if (vm.emitterAddress != ReachMessages.toBytes32(peer)) {
            revert UnknownEmitter(vm.emitterAddress);
        }

        m = ReachMessages.decode(vm.payload);
        if (m.direction != expectedDirection) revert WrongDirection();
        if (
            m.originEvmChainId != peerEvmChainId || m.targetEvmChainId != block.chainid
                || m.originWormholeChainId != peerWormholeChainId
                || m.targetWormholeChainId != localWormholeChainId || m.originGateway != peer
                || m.targetGateway != address(this) || m.wrapper != wrapper || m.receipt != _receipt()
        ) revert DomainMismatch();
        if (expectedDirection != ReachMessages.DIRECTION_NAV) {
            if (m.shares == 0) revert ZeroAmount();
            if (m.recipient == address(0)) revert ZeroAddress();
        }

        id = ReachMessages.transferId(m);
        if (transferConsumed[id]) revert AlreadyConsumed(id);
        if (vaaConsumed[vm.hash]) revert AlreadyConsumed(vm.hash);
        transferConsumed[id] = true;
        vaaConsumed[vm.hash] = true;
        emit MessageConsumed(id, vm.hash, m.direction);
    }
}
