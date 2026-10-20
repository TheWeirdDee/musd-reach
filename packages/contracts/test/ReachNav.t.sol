// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReachGatewayBase} from "../src/shared/ReachGatewayBase.sol";
import {ReachNavOracle} from "../src/base/ReachNavOracle.sol";
import {ReachTestBase} from "./utils/ReachTestBase.sol";

contract ReachNavTest is ReachTestBase {
    function _publishNav() internal returns (bytes memory vaa, bytes32 id) {
        onMezo();
        vm.recordLogs();
        (id,) = source.publishNav();
        vaa = makeVaa(MEZO_WH, lastPublished(vm.getRecordedLogs(), address(mezoCore)));
    }

    function _nav() internal view returns (uint256 a, uint256 s, uint64 t, uint64 b, uint64 n) {
        return dest.latestNav();
    }

    function test_issueCarriesNavSnapshot() public {
        wrapMusd(alice, 100e18);
        addNativeYield(10e18);
        (bytes memory vaa,) = lockShares(alice, 50e18, alice);
        onBase();
        assertFalse(dest.hasNav());
        dest.receiveIssue(vaa);
        (uint256 a, uint256 s,,,) = _nav();
        assertTrue(dest.hasNav());
        assertApproxEqAbs(a, 110e18, 1, "NAV assets include wrapper yield");
        assertEq(s, 100e18);
    }

    function test_navOnlyMessage_movesNoValue_andUpdates() public {
        wrapMusd(alice, 100e18);
        (bytes memory v1,) = _publishNav();
        addNativeYield(20e18);
        vm.warp(block.timestamp + 60);
        (bytes memory v2,) = _publishNav();

        onBase();
        dest.receiveNav(v2);
        (uint256 a2,,,,) = _nav();
        assertApproxEqAbs(a2, 120e18, 1);
        // older snapshot delivered late is consumed but cannot overwrite
        dest.receiveNav(v1);
        (uint256 a1,,,,) = _nav();
        assertEq(a1, a2, "stale snapshot ignored");
        assertEq(receipt.totalSupply(), 0, "no receipt minted by NAV messages");
    }

    function test_navReplay_rejected() public {
        wrapMusd(alice, 1e18);
        (bytes memory vaa, bytes32 id) = _publishNav();
        onBase();
        dest.receiveNav(vaa);
        vm.expectRevert(abi.encodeWithSelector(ReachGatewayBase.AlreadyConsumed.selector, id));
        dest.receiveNav(vaa);
    }

    function test_navVaaCannotMint() public {
        wrapMusd(alice, 1e18);
        (bytes memory vaa,) = _publishNav();
        onBase();
        vm.expectRevert(ReachGatewayBase.WrongDirection.selector);
        dest.receiveIssue(vaa);
    }

    function test_oracle_scalingForSixDecimalLoanToken() public {
        wrapMusd(alice, 1000e18);
        addNativeYield(100e18); // NAV/share = 1.1
        (bytes memory vaa,) = _publishNav();
        onBase();
        dest.receiveNav(vaa);
        ReachNavOracle oracle = new ReachNavOracle(dest, 1 hours, 2000, 6, 18);
        // 1.1 * 1e36 * 1e6 / 1e18 = 1.1e24 ; minus 20% haircut = 0.88e24
        assertApproxEqRel(oracle.navPrice(), 1.1e24, 1e12);
        assertApproxEqRel(oracle.price(), 0.88e24, 1e12);
        // Morpho valuation of 1 rwSMUSD (1e18 units): 1e18 * price / 1e36 = 0.88e6 USDC units
        assertApproxEqAbs((1e18 * oracle.price()) / 1e36, 880_000, 1);
    }

    function test_oracle_revertsWhenStaleOrMissing() public {
        onBase();
        ReachNavOracle oracle = new ReachNavOracle(dest, 1 hours, 1000, 6, 18);
        vm.expectRevert(ReachNavOracle.NavUnavailable.selector);
        oracle.price();

        wrapMusd(alice, 1e18);
        (bytes memory vaa,) = _publishNav();
        onBase();
        dest.receiveNav(vaa);
        oracle.price();
        vm.warp(block.timestamp + 1 hours + 1);
        vm.expectRevert(abi.encodeWithSelector(ReachNavOracle.NavStale.selector, 1 hours + 1, 1 hours));
        oracle.price();
    }

    function test_oracle_rejectsInvalidConfig() public {
        onBase();
        vm.expectRevert(ReachNavOracle.InvalidConfig.selector);
        new ReachNavOracle(dest, 0, 1000, 6, 18);
        vm.expectRevert(ReachNavOracle.InvalidConfig.selector);
        new ReachNavOracle(dest, 1, 10_000, 6, 18);
    }
}
