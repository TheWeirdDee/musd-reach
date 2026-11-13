// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ReachTesterKit
/// @notice Testnet onboarding with no tokens needed: Reach's relayer sends one kit to a new
///         wallet, paying the gas itself. On Mezo the kit is test MUSD plus a little BTC for gas;
///         on Base it is a little ETH for gas. A tester starts with an empty wallet.
/// @dev    Stands apart from the protocol: no Reach contract reads it. Only the relayer can send
///         a kit, so the claim costs the tester nothing. One kit per address, ever, and at most
///         `dailyLimit` kits per UTC day. Kit sizes are bounded by hard caps, so a slipped digit
///         or a stolen relayer key cannot hand out more than `dailyLimit` capped kits a day. The
///         owner can rotate the relayer, tune the kit, pause, and withdraw only to itself.
contract ReachTesterKit is Ownable2Step {
    using SafeERC20 for IERC20;

    /// @dev Ten times the planned 25 MUSD kit.
    uint256 public constant MAX_TOKEN_KIT = 250e18;
    /// @dev Native gas money per kit (BTC on Mezo, ETH on Base): far above a tester's real needs.
    uint256 public constant MAX_NATIVE_KIT = 0.01 ether;
    uint256 public constant MAX_DAILY_LIMIT = 200;
    /// @dev A smart-wallet recipient's receive() may need a few thousand gas; 50k bounds what a
    ///      hostile recipient can cost the relayer.
    uint256 public constant RECIPIENT_GAS = 50_000;

    /// @notice Token in each kit, or address(0) for a gas-only kit.
    IERC20 public immutable token;

    address public relayer;
    uint256 public tokenPerKit;
    uint256 public nativePerKit;
    uint256 public dailyLimit;
    bool public paused;

    mapping(address account => bool) public claimed;
    mapping(uint256 day => uint256) public claimsOnDay;
    uint256 public totalClaims;

    event Claimed(address indexed account, uint256 tokenAmount, uint256 nativeAmount, uint256 day);
    event RelayerSet(address relayer);
    event KitSet(uint256 tokenAmount, uint256 nativeAmount);
    event DailyLimitSet(uint256 limit);
    event Paused(bool paused);
    event Withdrawn(uint256 tokenAmount, uint256 nativeAmount);

    error NotRelayer();
    error AlreadyClaimed();
    error DailyLimitReached();
    error ClaimsPaused();
    error KitEmpty();
    error InvalidSetting();
    error NativeTransferFailed();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(IERC20 token_, uint256 tokenPerKit_, uint256 nativePerKit_, uint256 dailyLimit_, address relayer_, address owner_)
        Ownable(owner_)
    {
        token = token_;
        _setRelayer(relayer_);
        _setKit(tokenPerKit_, nativePerKit_);
        _setDailyLimit(dailyLimit_);
    }

    /// @notice Funding in native gas money, credited to nobody.
    receive() external payable {}

    /// @notice Sends one kit to `to`. Relayer only; once per address, within today's limit.
    function claimFor(address to) external onlyRelayer {
        if (paused) revert ClaimsPaused();
        if (to == address(0) || to == address(this)) revert InvalidSetting();
        if (claimed[to]) revert AlreadyClaimed();
        uint256 day = block.timestamp / 1 days;
        if (claimsOnDay[day] >= dailyLimit) revert DailyLimitReached();
        uint256 tokenAmount = tokenPerKit;
        uint256 nativeAmount = nativePerKit;
        if (tokenAmount > 0 && token.balanceOf(address(this)) < tokenAmount) revert KitEmpty();
        if (address(this).balance < nativeAmount) revert KitEmpty();

        claimed[to] = true;
        claimsOnDay[day] += 1;
        totalClaims += 1;
        emit Claimed(to, tokenAmount, nativeAmount, day);

        if (tokenAmount > 0) token.safeTransfer(to, tokenAmount);
        if (nativeAmount > 0) {
            (bool ok,) = to.call{value: nativeAmount, gas: RECIPIENT_GAS}("");
            if (!ok) revert NativeTransferFailed();
        }
    }

    /// @notice Kits left today, limited by the daily limit and by what the kit holds.
    function kitsAvailableToday() external view returns (uint256) {
        if (paused) return 0;
        uint256 used = claimsOnDay[block.timestamp / 1 days];
        uint256 left = used >= dailyLimit ? 0 : dailyLimit - used;
        if (tokenPerKit > 0) left = _min(left, token.balanceOf(address(this)) / tokenPerKit);
        if (nativePerKit > 0) left = _min(left, address(this).balance / nativePerKit);
        return left;
    }

    function setRelayer(address relayer_) external onlyOwner {
        _setRelayer(relayer_);
    }

    function setKit(uint256 tokenAmount, uint256 nativeAmount) external onlyOwner {
        _setKit(tokenAmount, nativeAmount);
    }

    function setDailyLimit(uint256 limit) external onlyOwner {
        _setDailyLimit(limit);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    /// @notice Returns tokens and gas money to the owner, and to no one else.
    function withdraw(uint256 tokenAmount, uint256 nativeAmount) external onlyOwner {
        if (tokenAmount > 0) token.safeTransfer(owner(), tokenAmount);
        if (nativeAmount > 0) {
            (bool ok,) = owner().call{value: nativeAmount}("");
            if (!ok) revert NativeTransferFailed();
        }
        emit Withdrawn(tokenAmount, nativeAmount);
    }

    function renounceOwnership() public pure override {
        revert InvalidSetting();
    }

    function _setRelayer(address relayer_) internal {
        if (relayer_ == address(0)) revert InvalidSetting();
        relayer = relayer_;
        emit RelayerSet(relayer_);
    }

    function _setKit(uint256 tokenAmount, uint256 nativeAmount) internal {
        if (tokenAmount > MAX_TOKEN_KIT || nativeAmount > MAX_NATIVE_KIT) revert InvalidSetting();
        if (tokenAmount > 0 && address(token) == address(0)) revert InvalidSetting();
        if (tokenAmount == 0 && nativeAmount == 0) revert InvalidSetting();
        tokenPerKit = tokenAmount;
        nativePerKit = nativeAmount;
        emit KitSet(tokenAmount, nativeAmount);
    }

    function _setDailyLimit(uint256 limit) internal {
        if (limit == 0 || limit > MAX_DAILY_LIMIT) revert InvalidSetting();
        dailyLimit = limit;
        emit DailyLimitSet(limit);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
