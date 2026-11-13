// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ReachStarterKit
/// @notice Testnet onboarding: gives each wallet one kit of test MUSD on Mezo, so a new tester
///         can save on Mezo and borrow on Base without first opening a 1,800 MUSD loan.
/// @dev    Holds test MUSD only and stands apart from the protocol: no Reach contract reads it.
///         One kit per address, ever. At most `dailyLimit` kits per UTC day, so a burst of new
///         addresses cannot drain it at once. The owner can tune the kit and the limit within
///         hard caps, pause claims, and withdraw the remaining MUSD to itself.
contract ReachStarterKit is Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_KIT = 500e18;
    uint256 public constant MAX_DAILY_LIMIT = 500;

    IERC20 public immutable musd;

    uint256 public kitAmount;
    uint256 public dailyLimit;
    bool public paused;

    mapping(address account => bool) public claimed;
    mapping(uint256 day => uint256) public claimsOnDay;
    uint256 public totalClaims;

    event Claimed(address indexed account, uint256 amount, uint256 day);
    event KitSet(uint256 amount);
    event DailyLimitSet(uint256 limit);
    event Paused(bool paused);
    event Withdrawn(uint256 amount);

    error AlreadyClaimed();
    error DailyLimitReached();
    error ClaimsPaused();
    error KitEmpty();
    error InvalidSetting();

    constructor(IERC20 musd_, uint256 kitAmount_, uint256 dailyLimit_, address owner_) Ownable(owner_) {
        musd = musd_;
        _setKit(kitAmount_);
        _setDailyLimit(dailyLimit_);
    }

    /// @notice Sends one kit to the caller. Once per address, within today's limit.
    function claim() external {
        if (paused) revert ClaimsPaused();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        uint256 day = block.timestamp / 1 days;
        if (claimsOnDay[day] >= dailyLimit) revert DailyLimitReached();
        uint256 amount = kitAmount;
        if (musd.balanceOf(address(this)) < amount) revert KitEmpty();

        claimed[msg.sender] = true;
        claimsOnDay[day] += 1;
        totalClaims += 1;
        musd.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount, day);
    }

    /// @notice Kits left today, limited by both the daily limit and the MUSD held.
    function kitsAvailableToday() external view returns (uint256) {
        if (paused) return 0;
        uint256 used = claimsOnDay[block.timestamp / 1 days];
        uint256 byLimit = used >= dailyLimit ? 0 : dailyLimit - used;
        uint256 byBalance = musd.balanceOf(address(this)) / kitAmount;
        return byLimit < byBalance ? byLimit : byBalance;
    }

    function setKit(uint256 amount) external onlyOwner {
        _setKit(amount);
    }

    function setDailyLimit(uint256 limit) external onlyOwner {
        _setDailyLimit(limit);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    /// @notice Returns MUSD to the owner, and to no one else.
    function withdraw(uint256 amount) external onlyOwner {
        musd.safeTransfer(owner(), amount);
        emit Withdrawn(amount);
    }

    function renounceOwnership() public pure override {
        revert InvalidSetting();
    }

    function _setKit(uint256 amount) internal {
        if (amount == 0 || amount > MAX_KIT) revert InvalidSetting();
        kitAmount = amount;
        emit KitSet(amount);
    }

    function _setDailyLimit(uint256 limit) internal {
        if (limit == 0 || limit > MAX_DAILY_LIMIT) revert InvalidSetting();
        dailyLimit = limit;
        emit DailyLimitSet(limit);
    }
}
