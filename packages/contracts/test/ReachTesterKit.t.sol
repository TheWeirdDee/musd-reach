// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReachTesterKit} from "../src/shared/ReachTesterKit.sol";

contract TesterKitToken is ERC20("Mezo USD", "MUSD") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// A recipient whose receive() burns more gas than RECIPIENT_GAS allows.
contract GasHungryWallet {
    uint256 public sink;

    receive() external payable {
        for (uint256 i; i < 1_000; ++i) sink += i;
    }
}

/// Covers: only the relayer can send a kit; each address gets one kit of token plus gas money,
/// ever; the UTC-day limit and its reset; empty and paused kits; gas-only kits; hard caps on every
/// setting; relayer rotation; withdrawals that only reach the owner; a hostile recipient.
contract ReachTesterKitTest is Test {
    TesterKitToken musd;
    ReachTesterKit kit;
    address owner = makeAddr("owner");
    address relayer = makeAddr("relayer");

    function setUp() public {
        vm.warp(1_800_000_000);
        musd = new TesterKitToken();
        kit = new ReachTesterKit(musd, 25e18, 0.0001 ether, 3, relayer, owner);
        musd.mint(address(kit), 1_000e18);
        vm.deal(address(kit), 1 ether);
    }

    function _claim(address to) internal {
        vm.prank(relayer);
        kit.claimFor(to);
    }

    function test_relayerSendsTokenAndGasOnce() public {
        address a = makeAddr("a");
        _claim(a);
        assertEq(musd.balanceOf(a), 25e18);
        assertEq(a.balance, 0.0001 ether);
        assertTrue(kit.claimed(a));
        assertEq(kit.totalClaims(), 1);

        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.AlreadyClaimed.selector);
        kit.claimFor(a);
    }

    function test_onlyRelayerCanSend() public {
        address a = makeAddr("a");
        vm.prank(a);
        vm.expectRevert(ReachTesterKit.NotRelayer.selector);
        kit.claimFor(a);
        vm.prank(owner);
        vm.expectRevert(ReachTesterKit.NotRelayer.selector);
        kit.claimFor(a);
    }

    function test_dailyLimitThenResetsNextUtcDay() public {
        for (uint256 i; i < 3; ++i) _claim(address(uint160(0x1000 + i)));
        assertEq(kit.kitsAvailableToday(), 0);
        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.DailyLimitReached.selector);
        kit.claimFor(address(0x2000));

        vm.warp((block.timestamp / 1 days + 1) * 1 days);
        assertEq(kit.kitsAvailableToday(), 3);
        _claim(address(0x2000));
        assertEq(musd.balanceOf(address(0x2000)), 25e18);
    }

    function test_emptyKitReverts() public {
        vm.prank(owner);
        kit.withdraw(990e18, 0);
        assertEq(kit.kitsAvailableToday(), 0);
        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.KitEmpty.selector);
        kit.claimFor(makeAddr("a"));

        musd.mint(address(kit), 25e18);
        vm.prank(owner);
        kit.withdraw(0, 1 ether);
        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.KitEmpty.selector);
        kit.claimFor(makeAddr("a"));
    }

    function test_pausedKitReverts() public {
        vm.prank(owner);
        kit.setPaused(true);
        assertEq(kit.kitsAvailableToday(), 0);
        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.ClaimsPaused.selector);
        kit.claimFor(makeAddr("a"));
    }

    function test_gasOnlyKit() public {
        ReachTesterKit baseKit = new ReachTesterKit(IERC20(address(0)), 0, 0.0002 ether, 5, relayer, owner);
        vm.deal(address(baseKit), 0.001 ether);
        assertEq(baseKit.kitsAvailableToday(), 5);
        address a = makeAddr("a");
        vm.prank(relayer);
        baseKit.claimFor(a);
        assertEq(a.balance, 0.0002 ether);
        assertEq(baseKit.kitsAvailableToday(), 4);
        // A token amount on a gas-only kit is refused.
        vm.prank(owner);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        baseKit.setKit(1e18, 0);
    }

    function test_settingsStayInsideCaps() public {
        vm.startPrank(owner);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.setKit(250e18 + 1, 0);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.setKit(0, 0.01 ether + 1);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.setKit(0, 0);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.setDailyLimit(0);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.setDailyLimit(201);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.setRelayer(address(0));
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.renounceOwnership();
        kit.setKit(50e18, 0.001 ether);
        kit.setDailyLimit(200);
        vm.stopPrank();
        assertEq(kit.tokenPerKit(), 50e18);
        assertEq(kit.nativePerKit(), 0.001 ether);

        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        kit.setKit(1e18, 0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        kit.setRelayer(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        kit.withdraw(1, 0);
        vm.stopPrank();
    }

    function test_rotatedRelayerTakesOver() public {
        address next = makeAddr("next");
        vm.prank(owner);
        kit.setRelayer(next);
        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.NotRelayer.selector);
        kit.claimFor(makeAddr("a"));
        vm.prank(next);
        kit.claimFor(makeAddr("a"));
        assertTrue(kit.claimed(makeAddr("a")));
    }

    function test_withdrawPaysOwnerOnly() public {
        uint256 before = owner.balance;
        vm.prank(owner);
        kit.withdraw(100e18, 0.5 ether);
        assertEq(musd.balanceOf(owner), 100e18);
        assertEq(owner.balance, before + 0.5 ether);
    }

    function test_hostileRecipientCannotBurnRelayerGas() public {
        GasHungryWallet w = new GasHungryWallet();
        vm.prank(relayer);
        vm.expectRevert(ReachTesterKit.NativeTransferFailed.selector);
        kit.claimFor(address(w));
        // Nothing was marked or paid: the whole claim reverted.
        assertFalse(kit.claimed(address(w)));
        assertEq(musd.balanceOf(address(w)), 0);
    }

    function test_refusesZeroAndSelf() public {
        vm.startPrank(relayer);
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.claimFor(address(0));
        vm.expectRevert(ReachTesterKit.InvalidSetting.selector);
        kit.claimFor(address(kit));
        vm.stopPrank();
    }

    function testFuzz_neverPaysMoreThanLimitPerDay(uint8 n) public {
        vm.prank(owner);
        kit.setDailyLimit(10);
        uint256 attempts = bound(n, 1, 40);
        uint256 paid;
        for (uint256 i; i < attempts; ++i) {
            vm.prank(relayer);
            try kit.claimFor(address(uint160(0x5000 + i))) {
                ++paid;
            } catch {}
        }
        assertLe(paid, 10);
        assertEq(musd.balanceOf(address(kit)), 1_000e18 - paid * 25e18);
        assertEq(address(kit).balance, 1 ether - paid * 0.0001 ether);
    }
}
