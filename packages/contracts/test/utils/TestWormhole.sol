// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IWormhole} from "../../src/interfaces/IWormhole.sol";

/// @notice Test-only Wormhole Core stand-in. Unlike a boolean mock, it performs the same
///         VAA parsing, guardian-set index check, quorum check, ascending-index check and
///         ECDSA verification over keccak256(keccak256(body)) as
///         wormhole-foundation/wormhole ethereum/contracts/Messages.sol, so Reach is tested
///         against real VAA bytes signed by test guardian keys.
contract TestWormhole is IWormhole {
    event LogMessagePublished(
        address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel
    );

    uint16 public immutable override chainId;
    uint256 public immutable override evmChainId;
    uint256 public override messageFee;
    uint32 public guardianSetIndex;
    mapping(uint32 => address[]) internal guardianSets;
    mapping(address => uint64) public nextSequence;

    constructor(uint16 chainId_, uint256 evmChainId_, address[] memory guardians) {
        chainId = chainId_;
        evmChainId = evmChainId_;
        guardianSets[0] = guardians;
    }

    function setMessageFee(uint256 fee) external {
        messageFee = fee;
    }

    function rotateGuardians(address[] memory guardians) external {
        guardianSetIndex += 1;
        guardianSets[guardianSetIndex] = guardians;
    }

    function publishMessage(uint32 nonce, bytes memory payload, uint8 consistencyLevel)
        external
        payable
        override
        returns (uint64 sequence)
    {
        require(msg.value == messageFee, "invalid fee");
        sequence = nextSequence[msg.sender]++;
        emit LogMessagePublished(msg.sender, sequence, nonce, payload, consistencyLevel);
    }

    function parseVM(bytes memory encoded) public pure returns (VM memory vm) {
        uint256 i = 0;
        vm.version = uint8(encoded[i]);
        i += 1;
        require(vm.version == 1, "VM version incompatible");
        vm.guardianSetIndex = uint32(_readUint(encoded, i, 4));
        i += 4;
        uint256 signersLen = uint8(encoded[i]);
        i += 1;
        vm.signatures = new Signature[](signersLen);
        for (uint256 s = 0; s < signersLen; s++) {
            vm.signatures[s].guardianIndex = uint8(encoded[i]);
            i += 1;
            vm.signatures[s].r = bytes32(_readUint(encoded, i, 32));
            i += 32;
            vm.signatures[s].s = bytes32(_readUint(encoded, i, 32));
            i += 32;
            vm.signatures[s].v = uint8(encoded[i]) + 27;
            i += 1;
        }
        bytes memory body = _slice(encoded, i, encoded.length - i);
        vm.hash = keccak256(abi.encodePacked(keccak256(body)));

        vm.timestamp = uint32(_readUint(encoded, i, 4));
        i += 4;
        vm.nonce = uint32(_readUint(encoded, i, 4));
        i += 4;
        vm.emitterChainId = uint16(_readUint(encoded, i, 2));
        i += 2;
        vm.emitterAddress = bytes32(_readUint(encoded, i, 32));
        i += 32;
        vm.sequence = uint64(_readUint(encoded, i, 8));
        i += 8;
        vm.consistencyLevel = uint8(encoded[i]);
        i += 1;
        vm.payload = _slice(encoded, i, encoded.length - i);
    }

    function parseAndVerifyVM(bytes calldata encodedVM)
        external
        view
        override
        returns (VM memory vm, bool valid, string memory reason)
    {
        vm = parseVM(encodedVM);
        (valid, reason) = _verify(vm);
    }

    function _verify(VM memory vm) internal view returns (bool, string memory) {
        address[] storage set = guardianSets[vm.guardianSetIndex];
        if (set.length == 0) return (false, "invalid guardian set");
        if (vm.guardianSetIndex != guardianSetIndex) return (false, "not current guardian set");
        if (vm.signatures.length < (set.length * 2) / 3 + 1) return (false, "no quorum");
        int256 last = -1;
        for (uint256 s = 0; s < vm.signatures.length; s++) {
            Signature memory sig = vm.signatures[s];
            if (int256(uint256(sig.guardianIndex)) <= last) return (false, "signature indices must be ascending");
            last = int256(uint256(sig.guardianIndex));
            if (sig.guardianIndex >= set.length) return (false, "guardian index out of bounds");
            address signer = ecrecover(vm.hash, sig.v, sig.r, sig.s);
            if (signer == address(0) || signer != set[sig.guardianIndex]) {
                return (false, "VM signature invalid");
            }
        }
        return (true, "");
    }

    function _readUint(bytes memory b, uint256 start, uint256 len) internal pure returns (uint256 v) {
        require(b.length >= start + len, "out of bounds");
        for (uint256 k = 0; k < len; k++) {
            v = (v << 8) | uint8(b[start + k]);
        }
    }

    function _slice(bytes memory b, uint256 start, uint256 len) internal pure returns (bytes memory out) {
        require(b.length >= start + len, "out of bounds");
        out = new bytes(len);
        for (uint256 k = 0; k < len; k++) {
            out[k] = b[start + k];
        }
    }
}
