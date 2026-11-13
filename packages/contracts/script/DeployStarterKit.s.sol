// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReachStarterKit} from "../src/mezo/ReachStarterKit.sol";

/// @title DeployStarterKit
/// @notice Deploys the Mezo-testnet MUSD starter kit (50 MUSD per wallet, once; 20 kits a day)
///         and funds it from the operator's test MUSD.
/// @dev    forge script script/DeployStarterKit.s.sol --rpc-url mezo_testnet --broadcast \
///           --private-key "$REACH_PRIVATE_KEY"   (after: set -a; . ../../.env; set +a)
///         Optional: REACH_KIT_FUND (MUSD to load, whole units, default 800).
contract DeployStarterKit is Script {
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    uint256 constant KIT = 50e18;
    uint256 constant DAILY_LIMIT = 20;

    function run() external {
        require(block.chainid == 31611, "Mezo testnet only");
        uint256 fund = vm.envOr("REACH_KIT_FUND", uint256(800)) * 1e18;

        vm.startBroadcast();
        (, address operator,) = vm.readCallers();
        ReachStarterKit kit = new ReachStarterKit(IERC20(MUSD), KIT, DAILY_LIMIT, operator);
        IERC20(MUSD).transfer(address(kit), fund);
        vm.stopBroadcast();

        console2.log("starter kit", address(kit));
        string memory k = "kit";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "starterKit", address(kit));
        vm.serializeAddress(k, "musd", MUSD);
        vm.serializeUint(k, "kitAmount", KIT);
        vm.serializeUint(k, "dailyLimit", DAILY_LIMIT);
        vm.serializeUint(k, "funded", fund);
        vm.serializeAddress(k, "owner", operator);
        string memory out = vm.serializeUint(k, "deployBlock", block.number);
        vm.writeJson(out, "../../deployments/testnet-starter-kit.json");
    }
}
