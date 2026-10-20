// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ReachMessages
/// @notice Wire format for Reach application messages carried as Wormhole VAA payloads.
/// @dev    Fixed-width ABI encoding of a single struct. Every domain field is bound into
///         the guardian-signed payload so a message cannot be replayed onto another chain,
///         gateway, wrapper, receipt, direction or protocol version.
library ReachMessages {
    /// @dev keccak256("MUSD_REACH")
    bytes32 internal constant PROTOCOL_ID = keccak256("MUSD_REACH");
    uint8 internal constant VERSION = 1;

    uint8 internal constant DIRECTION_ISSUE = 1; // Mezo custody lock -> Base receipt mint
    uint8 internal constant DIRECTION_REDEEM = 2; // Base receipt burn -> Mezo share release
    uint8 internal constant DIRECTION_NAV = 3; // Mezo wrapper NAV snapshot -> Base (no value moves)

    uint8 internal constant MODE_NONE = 0; // ISSUE messages
    uint8 internal constant MODE_SHARES = 1; // release wSMUSD shares to recipient
    uint8 internal constant MODE_MUSD = 2; // redeem shares to MUSD, fall back to shares

    struct Message {
        bytes32 protocolId;
        uint8 version;
        uint8 direction;
        uint256 originEvmChainId;
        uint256 targetEvmChainId;
        uint16 originWormholeChainId;
        uint16 targetWormholeChainId;
        address originGateway;
        address targetGateway;
        address wrapper; // Mezo ReachSavingsWrapper
        address receipt; // Base RemoteWrapperReceipt
        uint64 nonce; // per-origin-gateway monotonic counter
        uint256 shares; // exact wSMUSD / rwSMUSD base units (both 18 decimals)
        address sender;
        address recipient;
        uint8 redeemMode;
        uint256 minAssets; // MODE_MUSD only: minimum MUSD, else shares are released
        // Wrapper NAV snapshot taken on Mezo when the message was published. Filled for
        // ISSUE and NAV messages (origin = Mezo); zero for REDEEM messages.
        uint256 navAssets; // ReachSavingsWrapper.totalAssets(), MUSD base units
        uint256 navSupply; // ReachSavingsWrapper.totalSupply(), wSMUSD base units
        uint64 navTimestamp; // Mezo block.timestamp of the snapshot
        uint64 navBlock; // Mezo block.number of the snapshot
    }

    error BadProtocol();
    error BadVersion();

    function encode(Message memory m) internal pure returns (bytes memory) {
        return abi.encode(m);
    }

    function decode(bytes memory payload) internal pure returns (Message memory m) {
        m = abi.decode(payload, (Message));
        if (m.protocolId != PROTOCOL_ID) revert BadProtocol();
        if (m.version != VERSION) revert BadVersion();
    }

    /// @notice Globally unique id of a transfer: one per (origin chain, gateway, nonce, direction).
    function transferId(Message memory m) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PROTOCOL_ID,
                m.version,
                m.direction,
                m.originEvmChainId,
                m.originWormholeChainId,
                m.originGateway,
                m.nonce
            )
        );
    }

    function toBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
