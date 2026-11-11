// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ReachDestinationGateway} from "../src/base/ReachDestinationGateway.sol";
import {ReachNavOracle} from "../src/base/ReachNavOracle.sol";

/// Morpho Blue market parameters (identical layout to Morpho's `MarketParams`).
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IMorphoBlue {
    function createMarket(MarketParams memory marketParams) external;
    function isIrmEnabled(address irm) external view returns (bool);
    function isLltvEnabled(uint256 lltv) external view returns (bool);
    function market(bytes32 id)
        external
        view
        returns (uint128, uint128, uint128, uint128, uint128 lastUpdate, uint128);
}

interface IVaultV2Factory {
    function createVaultV2(address owner, address asset, bytes32 salt) external returns (address);
    function vaultV2(address owner, address asset, bytes32 salt) external view returns (address);
}

interface IMorphoMarketV1AdapterV2Factory {
    function createMorphoMarketV1AdapterV2(address parentVault) external returns (address);
    function morphoMarketV1AdapterV2(address parentVault) external view returns (address);
}

interface IVaultV2 {
    function setCurator(address newCurator) external;
    function setName(string memory newName) external;
    function setSymbol(string memory newSymbol) external;
    function submit(bytes memory data) external;
    function setIsAllocator(address account, bool newIsAllocator) external;
    function addAdapter(address account) external;
    function setPerformanceFeeRecipient(address newPerformanceFeeRecipient) external;
    function setPerformanceFee(uint256 newPerformanceFee) external;
    function increaseAbsoluteCap(bytes memory idData, uint256 newAbsoluteCap) external;
    function increaseRelativeCap(bytes memory idData, uint256 newRelativeCap) external;
    function setLiquidityAdapterAndData(address newLiquidityAdapter, bytes memory newLiquidityData) external;
    function setMaxRate(uint256 newMaxRate) external;
    function isAdapter(address) external view returns (bool);
}

/// @title DeployReachMarkets
/// @notice Stands up the Base Sepolia destination venue for rwSMUSD on existing, permissionless
///         Morpho infrastructure:
///           1. ReachNavOracle reading the guardian-attested wrapper NAV held by the v2
///              destination gateway.
///           2. A Morpho Blue market: borrow USDC against rwSMUSD collateral.
///           3. "Reach USDC Vault": a Morpho Vault V2 curated by Reach that lends deposits
///              into that market and charges a performance fee to the Reach treasury.
/// @dev    Run with:
///         forge script script/DeployReachMarkets.s.sol --rpc-url base_sepolia --broadcast \
///           --private-key "$REACH_PRIVATE_KEY"   (after: set -a; . ../../.env; set +a)
contract DeployReachMarkets is Script {
    // Base Sepolia, Morpho's published deployment.
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant ADAPTIVE_CURVE_IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    address constant VAULT_V2_FACTORY = 0xE3a2CEbca662d99D0F279aF13a6bb8c9825D2ea0;
    address constant ADAPTER_FACTORY = 0xa24674Cc2c603FBA8AE6b442E3dB05f3dDaAa3D5;
    // Circle's Base Sepolia USDC (faucet.circle.com).
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // Risk parameters. Effective max LTV = (1 - haircut) * LLTV = 0.90 * 0.77 = 69.3% of NAV.
    uint256 constant NAV_MAX_AGE = 3 days;
    uint256 constant HAIRCUT_BPS = 1_000;
    uint256 constant LLTV = 0.77e18;

    // Revenue: Reach earns 10% of the interest the vault's lenders earn.
    uint256 constant PERFORMANCE_FEE = 0.1e18;
    // Vault V2 MAX_MAX_RATE (200% APR / year in WAD per second); lets real interest show in NAV.
    uint256 constant MAX_RATE = 200e16 / uint256(365 days);
    uint256 constant ABSOLUTE_CAP = 1_000_000e6; // 1M USDC
    uint256 constant RELATIVE_CAP = 1e18; // 100%

    bytes32 constant VAULT_SALT = keccak256("musd-reach/reach-usdc-vault/v1");

    function run() external {
        string memory registryPath =
            vm.envOr("REACH_DEPLOYMENTS", string("../../deployments/testnet.json"));
        string memory registry = vm.readFile(registryPath);
        ReachDestinationGateway gateway =
            ReachDestinationGateway(vm.parseJsonAddress(registry, ".destinationGateway"));
        address receipt = vm.parseJsonAddress(registry, ".receipt");
        require(address(gateway.receipt()) == receipt, "registry receipt mismatch");

        IMorphoBlue morpho = IMorphoBlue(MORPHO);
        require(morpho.isIrmEnabled(ADAPTIVE_CURVE_IRM), "IRM not enabled");
        require(morpho.isLltvEnabled(LLTV), "LLTV not enabled");

        vm.startBroadcast();
        (, address operator,) = vm.readCallers();
        address treasury = vm.envOr("REACH_TREASURY", operator);

        // 1. Oracle
        ReachNavOracle oracle = new ReachNavOracle(gateway, NAV_MAX_AGE, HAIRCUT_BPS, 6, 18);

        // 2. Market
        MarketParams memory params =
            MarketParams(USDC, receipt, address(oracle), ADAPTIVE_CURVE_IRM, LLTV);
        bytes32 marketId = keccak256(abi.encode(params));
        (,,,, uint128 lastUpdate,) = morpho.market(marketId);
        if (lastUpdate == 0) morpho.createMarket(params);

        // 3. Curated vault
        IVaultV2 vault = IVaultV2(IVaultV2Factory(VAULT_V2_FACTORY).createVaultV2(operator, USDC, VAULT_SALT));
        vault.setCurator(operator);
        vault.setName("Reach USDC Vault");
        vault.setSymbol("reachUSDC");
        address adapter =
            IMorphoMarketV1AdapterV2Factory(ADAPTER_FACTORY).createMorphoMarketV1AdapterV2(address(vault));

        // Timelocks start at zero, so each curator change is submitted and executed at once.
        _curate(vault, abi.encodeCall(IVaultV2.addAdapter, (adapter)));
        _curate(vault, abi.encodeCall(IVaultV2.setIsAllocator, (operator, true)));
        _curate(vault, abi.encodeCall(IVaultV2.setPerformanceFeeRecipient, (treasury)));
        _curate(vault, abi.encodeCall(IVaultV2.setPerformanceFee, (PERFORMANCE_FEE)));
        bytes[3] memory ids = [
            abi.encode("this", adapter),
            abi.encode("collateralToken", receipt),
            abi.encode("this/marketParams", adapter, params)
        ];
        for (uint256 i; i < ids.length; ++i) {
            _curate(vault, abi.encodeCall(IVaultV2.increaseAbsoluteCap, (ids[i], ABSOLUTE_CAP)));
            _curate(vault, abi.encodeCall(IVaultV2.increaseRelativeCap, (ids[i], RELATIVE_CAP)));
        }
        // Allocator: route every deposit straight into the rwSMUSD market.
        vault.setLiquidityAdapterAndData(adapter, abi.encode(params));
        vault.setMaxRate(MAX_RATE);
        vm.stopBroadcast();

        require(vault.isAdapter(adapter), "adapter not added");
        console2.log("oracle  ", address(oracle));
        console2.log("vault   ", address(vault));
        console2.log("adapter ", adapter);
        console2.log("treasury", treasury);
        console2.logBytes32(marketId);

        string memory k = "markets";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "morpho", MORPHO);
        vm.serializeAddress(k, "irm", ADAPTIVE_CURVE_IRM);
        vm.serializeAddress(k, "loanToken", USDC);
        vm.serializeAddress(k, "collateralToken", receipt);
        vm.serializeAddress(k, "oracle", address(oracle));
        vm.serializeUint(k, "lltv", LLTV);
        vm.serializeUint(k, "navMaxAge", NAV_MAX_AGE);
        vm.serializeUint(k, "haircutBps", HAIRCUT_BPS);
        vm.serializeBytes32(k, "marketId", marketId);
        vm.serializeAddress(k, "vault", address(vault));
        vm.serializeAddress(k, "vaultAdapter", adapter);
        vm.serializeAddress(k, "curator", operator);
        vm.serializeAddress(k, "treasury", treasury);
        vm.serializeUint(k, "performanceFee", PERFORMANCE_FEE);
        string memory out = vm.serializeUint(k, "deployBlock", block.number);
        vm.writeJson(out, vm.envOr("REACH_MARKETS_OUT", string("../../deployments/testnet-markets.json")));
    }

    function _curate(IVaultV2 vault, bytes memory call) internal {
        vault.submit(call);
        (bool ok, bytes memory ret) = address(vault).call(call);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
