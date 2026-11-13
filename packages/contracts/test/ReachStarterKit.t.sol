// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReachStarterKit} from "../src/mezo/ReachStarterKit.sol";

contract KitToken is ERC20("Mezo USD", "MUSD") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Covers: one kit per address, the UTC-day limit and its reset, empty and paused kits, owner-only
/// settings inside their caps, and withdrawals that can only reach the owner.
contract ReachStarterKitTest is Test {
    KitToken musd;
    ReachStarterKit kit;
    address owner = makeAddr("owner");

    function setUp() public {
        vm.warp(1_800_000_000);
        musd = new KitToken();
        kit = new ReachStarterKit(musd, 50e18, 3, owner);
        musd.mint(address(kit), 1_000e18);
    }

    function test_claimPaysOneKitOnce() public {
        address a = makeAddr("a");
        vm.prank(a);
        kit.claim();
        assertEq(musd.balanceOf(a), 50e18);
        assertTrue(kit.claimed(a));
        assertEq(kit.totalClaims(), 1);

        vm.prank(a);
        vm.expectRevert(ReachStarterKit.AlreadyClaimed.selector);
        kit.claim();
    }

    function test_dailyLimitThenResetsNextDay() public {
        for (uint256 i; i < 3; ++i) {
            vm.prank(address(uint160(0x1000 + i)));
            kit.claim();
        }
        assertEq(kit.kitsAvailableToday(), 0);
        vm.prank(address(0x2000));
        vm.expectRevert(ReachStarterKit.DailyLimitReached.selector);
        kit.claim();

        vm.warp(block.timestamp + 1 days);
        assertEq(kit.kitsAvailableToday(), 3);
        vm.prank(address(0x2000));
        kit.claim();
        assertEq(musd.balanceOf(address(0x2000)), 50e18);
    }

    function test_emptyKitReverts() public {
        vm.prank(owner);
        kit.withdraw(990e18); // 10 MUSD left, below one kit
        assertEq(kit.kitsAvailableToday(), 0);
        vm.prank(makeAddr("a"));
        vm.expectRevert(ReachStarterKit.KitEmpty.selector);
        kit.claim();
    }

    function test_pauseBlocksClaims() public {
        vm.prank(owner);
        kit.setPaused(true);
        assertEq(kit.kitsAvailableToday(), 0);
        vm.prank(makeAddr("a"));
        vm.expectRevert(ReachStarterKit.ClaimsPaused.selector);
        kit.claim();
    }

    function test_settingsOwnerOnlyAndCapped() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        kit.setKit(10e18);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        kit.withdraw(1);
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectRevert(ReachStarterKit.InvalidSetting.selector);
        kit.setKit(0);
        vm.expectRevert(ReachStarterKit.InvalidSetting.selector);
        kit.setKit(501e18);
        vm.expectRevert(ReachStarterKit.InvalidSetting.selector);
        kit.setDailyLimit(501);
        vm.expectRevert(ReachStarterKit.InvalidSetting.selector);
        kit.renounceOwnership();
        kit.setKit(25e18);
        vm.stopPrank();
        assertEq(kit.kitAmount(), 25e18);
    }

    function test_withdrawGoesToOwnerOnly() public {
        vm.prank(owner);
        kit.withdraw(100e18);
        assertEq(musd.balanceOf(owner), 100e18);
    }

    function testFuzz_neverPaysMoreThanKitsClaimed(uint8 n) public {
        uint256 claims = bound(n, 0, 60);
        vm.prank(owner);
        kit.setDailyLimit(500);
        uint256 paid;
        for (uint256 i; i < claims; ++i) {
            address a = address(uint160(0x5000 + i));
            if (kit.kitsAvailableToday() == 0) break;
            vm.prank(a);
            kit.claim();
            paid += 50e18;
        }
        assertEq(musd.balanceOf(address(kit)), 1_000e18 - paid);
        assertEq(paid, kit.totalClaims() * 50e18);
    }
}
