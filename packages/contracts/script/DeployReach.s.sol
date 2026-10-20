// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IMUSDSavingsRate} from "../src/interfaces/IMUSDSavingsRate.sol";
import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {ReachSavingsWrapper} from "../src/mezo/ReachSavingsWrapper.sol";
import {ReachSourceGateway} from "../src/mezo/ReachSourceGateway.sol";
import {ReachDestinationGateway} from "../src/base/ReachDestinationGateway.sol";

/// @notice Four-step, two-chain deployment. Each step is a separate broadcast on the chain it
///         targets and fails closed if live state differs from the pinned registry values.
///
///   1. Mezo testnet : forge script script/DeployReach.s.sol --sig "deployWrapper()"     --rpc-url mezo_testnet --account <ks> --broadcast
///   2. Base Sepolia : forge script script/DeployReach.s.sol --sig "deployDestination()" --rpc-url base_sepolia --account <ks> --broadcast
///   3. Mezo testnet : forge script script/DeployReach.s.sol --sig "deploySource()"      --rpc-url mezo_testnet --account <ks> --broadcast
///   4. Base Sepolia : forge script script/DeployReach.s.sol --sig "bindDestination()"   --rpc-url base_sepolia --account <ks> --broadcast
///
///   Addresses are recorded in deployments/testnet.json (repository root).
contract DeployReach is Script {
    using stdJson for string;

    uint256 constant MEZO_EVM = 31611;
    uint256 constant BASE_EVM = 84532;
    uint16 constant MEZO_WH = 50;
    uint16 constant BASE_WH = 10004;
    uint8 constant CONSISTENCY = 202; // matches the canonical MUSD NTT transceivers on both chains

    address constant VAULT = 0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16;
    address constant VAULT_IMPL = 0x92D12f0a60906b39d81acD9bf8977b6c824cD98C;
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant MEZO_CORE = 0x268557122Ffd64c85750d630b716471118F323c8;
    address constant BASE_CORE = 0x79A1027a6A159502049F10906D333EC57E95F083;
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /// @dev Override with REACH_DEPLOYMENTS for local fork rehearsals so they never touch the
    ///      public-testnet record.
    function _path() internal view returns (string memory) {
        return vm.envOr("REACH_DEPLOYMENTS", string("../../deployments/testnet.json"));
    }

    function _read() internal view returns (string memory) {
        return vm.readFile(_path());
    }

    /// @dev The broadcasting account (from --account / --private-key / --ledger).
    function _deployer() internal returns (address sender) {
        vm.startBroadcast();
        (, sender,) = vm.readCallers();
        vm.stopBroadcast();
    }

    function _guardian(address deployer) internal view returns (address) {
        return vm.envOr("REACH_GUARDIAN", deployer);
    }

    function deployWrapper() external {
        require(block.chainid == MEZO_EVM, "run on Mezo testnet");
        address impl = address(uint160(uint256(vm.load(VAULT, IMPL_SLOT))));
        require(impl == VAULT_IMPL, "native vault implementation changed: re-verify before deploying");
        require(IMUSDSavingsRate(VAULT).musdToken() == MUSD, "unexpected vault underlying");
        address deployer = _deployer();
        address guardian = _guardian(deployer);

        vm.startBroadcast();
        ReachSavingsWrapper wrapper = new ReachSavingsWrapper(IMUSDSavingsRate(VAULT), guardian);
        vm.stopBroadcast();

        string memory o = "root";
        vm.serializeUint(o, "mezoChainId", MEZO_EVM);
        vm.serializeUint(o, "baseChainId", BASE_EVM);
        vm.serializeAddress(o, "nativeVault", VAULT);
        vm.serializeAddress(o, "nativeVaultImplementation", VAULT_IMPL);
        vm.serializeAddress(o, "musd", MUSD);
        vm.serializeAddress(o, "guardian", guardian);
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeUint(o, "wrapperDeployBlock", block.number);
        // Settlement semantics of this contract version (read by the frontend and verifier).
        vm.serializeString(o, "settlementModel", "pending-v2");
        string memory json = vm.serializeAddress(o, "wrapper", address(wrapper));
        vm.writeJson(json, _path());
        console2.log("ReachSavingsWrapper", address(wrapper));
    }

    function deployDestination() external {
        require(block.chainid == BASE_EVM, "run on Base Sepolia");
        string memory j = _read();
        address wrapper = j.readAddress(".wrapper");
        require(IWormhole(BASE_CORE).chainId() == BASE_WH, "unexpected Base core");

        vm.startBroadcast();
        ReachDestinationGateway dest =
            new ReachDestinationGateway(IWormhole(BASE_CORE), MEZO_WH, MEZO_EVM, wrapper, CONSISTENCY);
        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(dest)), _path(), ".destinationGateway");
        vm.writeJson(vm.toString(address(dest.receipt())), _path(), ".receipt");
        vm.writeJson(vm.toString(block.number), _path(), ".destinationDeployBlock");
        console2.log("ReachDestinationGateway", address(dest));
        console2.log("RemoteWrapperReceipt", address(dest.receipt()));
    }

    function deploySource() external {
        require(block.chainid == MEZO_EVM, "run on Mezo testnet");
        string memory j = _read();
        ReachSavingsWrapper wrapper = ReachSavingsWrapper(j.readAddress(".wrapper"));
        address dest = j.readAddress(".destinationGateway");
        address receipt = j.readAddress(".receipt");
        require(IWormhole(MEZO_CORE).chainId() == MEZO_WH, "unexpected Mezo core");
        require(address(wrapper.savingsVault()) == VAULT, "wrapper bound to wrong vault");
        address guardian = _guardian(_deployer());

        vm.startBroadcast();
        ReachSourceGateway source = new ReachSourceGateway(
            IWormhole(MEZO_CORE), wrapper, BASE_WH, BASE_EVM, dest, receipt, CONSISTENCY, guardian
        );
        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(source)), _path(), ".sourceGateway");
        vm.writeJson(vm.toString(block.number), _path(), ".sourceDeployBlock");
        console2.log("ReachSourceGateway", address(source));
    }

    function bindDestination() external {
        require(block.chainid == BASE_EVM, "run on Base Sepolia");
        string memory j = _read();
        ReachDestinationGateway dest = ReachDestinationGateway(j.readAddress(".destinationGateway"));
        address source = j.readAddress(".sourceGateway");
        require(dest.sourceGateway() == address(0), "already bound");
        require(dest.wrapper() == j.readAddress(".wrapper"), "destination bound to wrong wrapper");

        vm.startBroadcast();
        dest.bindSourceGateway(source);
        vm.stopBroadcast();
        require(dest.sourceGateway() == source, "bind failed");
        console2.log("bound destination to source", source);
    }
}
