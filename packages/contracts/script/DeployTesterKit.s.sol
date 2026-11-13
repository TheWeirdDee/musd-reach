// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReachTesterKit} from "../src/shared/ReachTesterKit.sol";

/// @title DeployTesterKit
/// @notice Deploys the relayer-sent tester kit on one chain and funds it, so a tester can start
///         with an empty wallet:
///           Mezo testnet:  25 test MUSD + 0.00002 BTC for gas per wallet, 20 kits a day
///           Base Sepolia:  0.0001 ETH for gas per wallet, 40 kits a day
///         Also tops up the relayer's own gas. Writes deployments/testnet-tester-kit-<chain>.json.
/// @dev    set -a; . ../../.env; set +a
///         forge script script/DeployTesterKit.s.sol --rpc-url mezo_testnet --broadcast --private-key "$REACH_PRIVATE_KEY"
///         forge script script/DeployTesterKit.s.sol --rpc-url base_sepolia --broadcast --private-key "$REACH_PRIVATE_KEY"
///         Needs REACH_RELAYER_ADDRESS. Optional: REACH_KIT_TOKEN_FUND (MUSD, whole units, Mezo only,
///         default: the operator's whole MUSD balance), REACH_KIT_NATIVE_FUND (wei).
contract DeployTesterKit is Script {
    address constant MEZO_MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;

    struct Plan {
        string name;
        IERC20 token;
        uint256 tokenPerKit;
        uint256 nativePerKit;
        uint256 dailyLimit;
        uint256 nativeFund;
        uint256 relayerGas;
    }

    function _plan() internal view returns (Plan memory p) {
        if (block.chainid == 31611) {
            p = Plan("mezo", IERC20(MEZO_MUSD), 25e18, 0.00002 ether, 20, 0.0008 ether, 0.0005 ether);
        } else if (block.chainid == 84532) {
            p = Plan("base", IERC20(address(0)), 0, 0.0001 ether, 40, 0.004 ether, 0.001 ether);
        } else {
            revert("Mezo testnet or Base Sepolia only");
        }
        p.nativeFund = vm.envOr("REACH_KIT_NATIVE_FUND", p.nativeFund);
    }

    function run() external {
        Plan memory p = _plan();
        address relayer = vm.envAddress("REACH_RELAYER_ADDRESS");

        vm.startBroadcast();
        (, address operator,) = vm.readCallers();
        ReachTesterKit kit = new ReachTesterKit(p.token, p.tokenPerKit, p.nativePerKit, p.dailyLimit, relayer, operator);
        uint256 tokenFund;
        if (address(p.token) != address(0)) {
            tokenFund = vm.envOr("REACH_KIT_TOKEN_FUND", p.token.balanceOf(operator) / 1e18) * 1e18;
            if (tokenFund > 0) p.token.transfer(address(kit), tokenFund);
        }
        (bool ok,) = address(kit).call{value: p.nativeFund}("");
        require(ok, "fund kit");
        if (relayer.balance < p.relayerGas) {
            (ok,) = relayer.call{value: p.relayerGas - relayer.balance}("");
            require(ok, "fund relayer");
        }
        vm.stopBroadcast();

        console2.log("tester kit", address(kit));
        string memory k = "kit";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "testerKit", address(kit));
        vm.serializeAddress(k, "token", address(p.token));
        vm.serializeUint(k, "tokenPerKit", p.tokenPerKit);
        vm.serializeUint(k, "nativePerKit", p.nativePerKit);
        vm.serializeUint(k, "dailyLimit", p.dailyLimit);
        vm.serializeUint(k, "tokenFunded", tokenFund);
        vm.serializeUint(k, "nativeFunded", p.nativeFund);
        vm.serializeAddress(k, "relayer", relayer);
        vm.serializeAddress(k, "owner", operator);
        string memory out = vm.serializeUint(k, "deployBlock", block.number);
        vm.writeJson(out, string.concat("../../deployments/testnet-tester-kit-", p.name, ".json"));
    }
}
