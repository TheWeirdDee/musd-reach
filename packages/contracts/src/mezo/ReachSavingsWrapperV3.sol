// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IMUSDSavingsRate, IPCV} from "../interfaces/IMUSDSavingsRate.sol";
import {IVaultGauge} from "../interfaces/IVaultGauge.sol";

/// @title ReachSavingsWrapperV3 (wSMUSD), mainnet candidate
/// @notice Same accounting and guarantees as ReachSavingsWrapper (v2), plus an optional
///         gauge mode. Mezo pays sMUSD holders in one of two ways, never both:
///
///           savings mode: the native vault's MUSD yield (fees on MUSD borrowing), or
///           gauge mode:   MEZO emissions from Mezo's sMUSD VaultGauge, while the MUSD yield
///                         of staked sMUSD goes to veBTC voters (VaultGauge._claimFees).
///
///         The guardian switches between them, so Reach savers get whichever pays more.
///         In gauge mode the wrapper's sMUSD principal sits in the gauge; principal
///         accounting is unchanged, exits unstake exactly what they need, and exits can
///         never be paused. MEZO rewards are claimable by anyone and go only to the
///         guardian-set rewards recipient (a distributor that passes them to holders); they
///         never change the share price, which stays in MUSD.
///
/// Original v2 notes follow.
///
/// @notice Accumulating, claim-and-hold wrapper around Mezo's native MUSDSavingsRate
/// @notice Accumulating, claim-and-hold wrapper around Mezo's native MUSDSavingsRate
///         vault. The wrapper owns native sMUSD principal and the native yield that
///         principal earns *while held by the wrapper*. wSMUSD shares are a pro-rata
///         claim on the wrapper's net assets:
///
///             A = principal (sMUSD units, redeemable 1:1 for MUSD by the native vault)
///               + idle      (claimed MUSD yield held by the wrapper)
///               + pending   (native yield accrued to the wrapper, not yet claimed)
///
/// @dev    Accounting is tracked internally, so tokens sent directly to this contract
///         never move the share price. Every state-changing entry/exit first harvests
///         native yield so the price used for minting/burning includes all yield that
///         belongs to existing holders. Conversions use OpenZeppelin's virtual
///         share/asset offset (offset 0) against first-depositor inflation.
///
///         This contract exposes the ERC-4626 interface with MUSD as `asset()`, with
///         one documented deviation: if the native vault's PCV holds undistributed
///         fees, a deposit's harvest distributes them first, so `previewDeposit` can
///         overstate minted shares by the share of those fees. On Mezo testnet
///         `pcv()` is the zero address, so previews are exact there.
///
///         There is no fee, no admin mint, no admin withdrawal, and no upgradeability.
///         The guardian may only pause new deposits; exits can never be paused.
contract ReachSavingsWrapperV3 is ERC4626, ERC20Permit, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for IMUSDSavingsRate;

    IMUSDSavingsRate public immutable savingsVault;
    IERC20 public immutable musd;
    /// @notice Mezo's VaultGauge for sMUSD, or address(0) where none exists (Mezo testnet).
    IVaultGauge public immutable gauge;

    /// @notice Native sMUSD principal units owned and accounted for by the wrapper.
    uint256 public principal;
    /// @notice Claimed MUSD yield held by the wrapper (claim-and-hold, not reinvested).
    uint256 public idle;

    address public guardian;
    address public pendingGuardian;
    bool public depositsPaused;
    /// @notice True while the wrapper's sMUSD principal is staked in the gauge (gauge mode).
    bool public staked;
    /// @notice Where claimed MEZO rewards go: a distributor that passes them to holders.
    address public rewardsRecipient;

    event Harvested(uint256 claimed, uint256 idleAfter);
    event SavingsDeposited(
        address indexed caller, address indexed receiver, uint256 smusdAmount, uint256 shares
    );
    event RedeemedInKind(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 shares,
        uint256 smusdOut,
        uint256 musdOut
    );
    event DepositsPaused(bool paused);
    event GuardianProposed(address indexed proposed);
    event GuardianAccepted(address indexed guardian);
    event GaugeModeSet(bool staked, uint256 principalMoved);
    event RewardsRecipientSet(address indexed recipient);
    event RewardsClaimed(address indexed recipient, uint256 amount);

    error ZeroAddress();
    error ZeroShares();
    error ZeroAssets();
    error SlippageExceeded(uint256 shares, uint256 minShares);
    error DepositsArePaused();
    error NotGuardian();
    error NotPendingGuardian();
    error UnexpectedVaultDelta(uint256 expected, uint256 actual);
    error InsufficientPrincipal(uint256 requested, uint256 available);
    error VaultUnderlyingMismatch();
    error OnlySelf();
    error HarvestOutOfGas();
    error NoGauge();
    error GaugeMismatch();
    error NoRewardsRecipient();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    constructor(IMUSDSavingsRate vault_, IVaultGauge gauge_, address guardian_)
        ERC20("Reach Wrapped Mezo Savings", "wSMUSD")
        ERC20Permit("Reach Wrapped Mezo Savings")
        ERC4626(IERC20(vault_.musdToken()))
    {
        if (address(vault_) == address(0) || guardian_ == address(0)) revert ZeroAddress();
        savingsVault = vault_;
        musd = IERC20(vault_.musdToken());
        if (address(musd) != asset()) revert VaultUnderlyingMismatch();
        guardian = guardian_;
        if (address(gauge_) != address(0) && gauge_.stakingToken() != address(vault_)) revert GaugeMismatch();
        gauge = gauge_;
    }

    // ---------------------------------------------------------------------
    // Asset accounting
    // ---------------------------------------------------------------------

    /// @notice Native yield accrued to the wrapper that has not been claimed yet.
    /// @dev Mirrors MUSDSavingsRate._updateYieldFor exactly.
    function pendingYield() public view returns (uint256) {
        uint256 bal = savingsVault.balanceOf(address(this));
        uint256 accrued = savingsVault.claimableYield(address(this));
        if (bal == 0) return accrued;
        uint256 delta = savingsVault.yieldIndex() - savingsVault.supplyYieldIndex(address(this));
        return accrued + (bal * delta) / 1e18;
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        return principal + idle + pendingYield();
    }

    /// @notice Assets attributable to `shares` at the current state, rounded down.
    function assetsPerShare() external view returns (uint256) {
        return convertToAssets(10 ** decimals());
    }

    function maxDeposit(address) public view override returns (uint256) {
        return depositsPaused ? 0 : type(uint256).max;
    }

    function maxMint(address) public view override returns (uint256) {
        return depositsPaused ? 0 : type(uint256).max;
    }

    function decimals() public view override(ERC20, ERC4626) returns (uint8) {
        return ERC4626.decimals();
    }

    // ---------------------------------------------------------------------
    // Harvest
    // ---------------------------------------------------------------------

    /// @notice Pulls all native yield owed to the wrapper into `idle`. Permissionless.
    function harvest() external nonReentrant returns (uint256 claimed) {
        return _harvest();
    }

    /// @dev Distributes PCV fees (best effort, exactly like the native vault does),
    ///      pulls strategy yield, then claims the wrapper's yield. The claimed amount is
    ///      measured as an actual MUSD balance delta, never trusted from return values.
    function _harvest() internal returns (uint256 claimed) {
        address pcv = savingsVault.pcv();
        if (pcv != address(0)) {
            // Best effort, like the native vault. But a caller must not be able to skip the
            // distribution by starving it of gas (that would let a depositor price in before
            // fees owed to existing holders are distributed).
            uint256 gasBefore = gasleft();
            try IPCV(pcv).distributeMUSD() {}
            catch {
                if (gasleft() <= gasBefore / 63) revert HarvestOutOfGas();
            }
        }
        savingsVault.receiveYieldFromStrategy();
        uint256 before = musd.balanceOf(address(this));
        savingsVault.claimYield();
        claimed = musd.balanceOf(address(this)) - before;
        if (claimed > 0) {
            idle += claimed;
        }
        emit Harvested(claimed, idle);
    }

    // ---------------------------------------------------------------------
    // ERC-4626 entry points (MUSD in/out)
    // ---------------------------------------------------------------------

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _harvest();
        return super.deposit(assets, receiver);
    }

    /// @notice Deposit MUSD with a minimum-shares bound.
    function depositWithMin(uint256 assets, address receiver, uint256 minShares)
        external
        nonReentrant
        returns (uint256 shares)
    {
        _harvest();
        shares = super.deposit(assets, receiver);
        if (shares < minShares) revert SlippageExceeded(shares, minShares);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        _harvest();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _harvest();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _harvest();
        return super.redeem(shares, receiver, owner);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        if (assets == 0) revert ZeroAssets();
        if (shares == 0) revert ZeroShares();
        musd.safeTransferFrom(caller, address(this), assets);

        uint256 before = savingsVault.balanceOf(address(this));
        musd.forceApprove(address(savingsVault), assets);
        savingsVault.deposit(assets);
        uint256 received = savingsVault.balanceOf(address(this)) - before;
        if (received != assets) revert UnexpectedVaultDelta(assets, received);
        principal += assets;
        if (staked) _stake(assets);

        _mint(receiver, shares);
        emit Deposit(caller, receiver, assets, shares);
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        if (assets == 0) revert ZeroAssets();
        if (shares == 0) revert ZeroShares();
        if (caller != owner) _spendAllowance(owner, caller, shares);
        _burn(owner, shares);
        _payOut(assets);
        musd.safeTransfer(receiver, assets);
        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    /// @dev Pays from idle MUSD first so principal keeps earning for remaining holders,
    ///      then withdraws the shortfall from the native vault. Yield the native vault
    ///      pays out during `withdraw` is measured and kept in `idle`.
    function _payOut(uint256 assets) internal {
        uint256 _idle = idle;
        if (assets <= _idle) {
            idle = _idle - assets;
            return;
        }
        uint256 fromVault = assets - _idle;
        if (fromVault > principal) revert InsufficientPrincipal(fromVault, principal);
        idle = 0;
        principal -= fromVault;

        if (staked) _unstake(fromVault);
        uint256 before = musd.balanceOf(address(this));
        savingsVault.withdraw(fromVault);
        uint256 received = musd.balanceOf(address(this)) - before;
        if (received < fromVault) revert UnexpectedVaultDelta(fromVault, received);
        if (received > fromVault) idle = received - fromVault;
    }

    // ---------------------------------------------------------------------
    // Native sMUSD entry and in-kind exit
    // ---------------------------------------------------------------------

    /// @notice Wrap existing native sMUSD principal. Yield the caller accrued before this
    ///         transfer stays claimable by the caller in the native vault; the wrapper
    ///         only earns yield on this principal from now on.
    function depositSavings(uint256 amount, address receiver, uint256 minShares)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (depositsPaused) revert DepositsArePaused();
        if (amount == 0) revert ZeroAssets();
        if (receiver == address(0)) revert ZeroAddress();
        _harvest();

        // One sMUSD unit is one MUSD unit of native principal.
        shares = _convertToShares(amount, Math.Rounding.Floor);
        if (shares == 0) revert ZeroShares();
        if (shares < minShares) revert SlippageExceeded(shares, minShares);

        uint256 before = savingsVault.balanceOf(address(this));
        savingsVault.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = savingsVault.balanceOf(address(this)) - before;
        if (received != amount) revert UnexpectedVaultDelta(amount, received);
        principal += amount;
        if (staked) _stake(amount);

        _mint(receiver, shares);
        emit SavingsDeposited(msg.sender, receiver, amount, shares);
    }

    /// @notice Preview of `depositSavings`, using the same conversion as `previewDeposit`.
    function previewDepositSavings(uint256 amount) external view returns (uint256) {
        return _convertToShares(amount, Math.Rounding.Floor);
    }

    /// @notice Exit that does not depend on native vault withdrawal liquidity: returns a
    ///         pro-rata slice of native sMUSD principal and idle MUSD. Harvest is attempted
    ///         but not required; if it fails, unharvested yield stays with remaining holders.
    function redeemInKind(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 smusdOut, uint256 musdOut)
    {
        if (shares == 0) revert ZeroShares();
        if (receiver == address(0)) revert ZeroAddress();
        uint256 gasBefore = gasleft();
        try this.harvestForInKind() {}
        catch {
            // A genuine harvest failure is tolerated; a gas-starved one is not.
            if (gasleft() <= gasBefore / 63) revert HarvestOutOfGas();
        }

        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        uint256 supply = totalSupply();
        smusdOut = Math.mulDiv(principal, shares, supply, Math.Rounding.Floor);
        musdOut = Math.mulDiv(idle, shares, supply, Math.Rounding.Floor);
        if (smusdOut == 0 && musdOut == 0) revert ZeroAssets();

        _burn(owner, shares);
        principal -= smusdOut;
        idle -= musdOut;
        if (smusdOut > 0) {
            if (staked) _unstake(smusdOut);
            savingsVault.safeTransfer(receiver, smusdOut);
        }
        if (musdOut > 0) musd.safeTransfer(receiver, musdOut);
        emit RedeemedInKind(msg.sender, receiver, owner, shares, smusdOut, musdOut);
    }

    function previewRedeemInKind(uint256 shares)
        external
        view
        returns (uint256 smusdOut, uint256 musdOut)
    {
        uint256 supply = totalSupply();
        if (supply == 0) return (0, 0);
        smusdOut = Math.mulDiv(principal, shares, supply, Math.Rounding.Floor);
        musdOut = Math.mulDiv(idle + pendingYield(), shares, supply, Math.Rounding.Floor);
    }

    /// @dev External self-call so a failing native claim can be caught without the
    ///      reentrancy guard (already held by `redeemInKind`) blocking it.
    function harvestForInKind() external {
        if (msg.sender != address(this)) revert OnlySelf();
        _harvest();
    }

    // ---------------------------------------------------------------------
    // Gauge mode
    // ---------------------------------------------------------------------

    /// @notice sMUSD principal currently staked in the gauge.
    function stakedPrincipal() external view returns (uint256) {
        return address(gauge) == address(0) ? 0 : gauge.balanceOf(address(this));
    }

    /// @notice MEZO earned in the gauge and not yet claimed.
    function pendingRewards() external view returns (uint256) {
        return address(gauge) == address(0) ? 0 : gauge.earned(address(this));
    }

    /// @notice Sends earned MEZO to the rewards recipient. Permissionless.
    function claimRewards() external nonReentrant returns (uint256 amount) {
        if (address(gauge) == address(0)) revert NoGauge();
        address to = rewardsRecipient;
        if (to == address(0)) revert NoRewardsRecipient();
        IERC20 reward = IERC20(gauge.rewardToken());
        uint256 before = reward.balanceOf(address(this));
        gauge.getReward(address(this));
        amount = reward.balanceOf(address(this)) - before;
        if (amount > 0) reward.safeTransfer(to, amount);
        emit RewardsClaimed(to, amount);
    }

    function _stake(uint256 amount) internal {
        IERC20(address(savingsVault)).forceApprove(address(gauge), amount);
        gauge.deposit(amount);
    }

    function _unstake(uint256 amount) internal {
        gauge.withdraw(amount);
    }

    // ---------------------------------------------------------------------
    // Guardian: may pause new deposits, choose the yield source, set the rewards recipient
    // ---------------------------------------------------------------------

    /// @notice Gauge mode on: stake all sMUSD principal for MEZO emissions (the MUSD yield of
    ///         staked sMUSD then goes to veBTC voters). Off: unstake it all and earn the
    ///         native MUSD savings yield again. Yield owed so far is harvested first.
    function setGaugeMode(bool on) external onlyGuardian nonReentrant {
        if (address(gauge) == address(0)) revert NoGauge();
        if (on == staked) return;
        _harvest();
        uint256 moved;
        if (on) {
            moved = savingsVault.balanceOf(address(this));
            staked = true;
            if (moved > 0) _stake(moved);
        } else {
            moved = gauge.balanceOf(address(this));
            staked = false;
            if (moved > 0) _unstake(moved);
        }
        emit GaugeModeSet(on, moved);
    }

    function setRewardsRecipient(address recipient) external onlyGuardian {
        if (recipient == address(0)) revert ZeroAddress();
        rewardsRecipient = recipient;
        emit RewardsRecipientSet(recipient);
    }

    function setDepositsPaused(bool paused) external onlyGuardian {
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }

    function proposeGuardian(address proposed) external onlyGuardian {
        pendingGuardian = proposed;
        emit GuardianProposed(proposed);
    }

    function acceptGuardian() external {
        if (msg.sender != pendingGuardian) revert NotPendingGuardian();
        guardian = msg.sender;
        pendingGuardian = address(0);
        emit GuardianAccepted(msg.sender);
    }
}
