// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Mezo's VaultGauge for sMUSD (mainnet 0x677817bF3e44b90E8F95222F75e2950b7904a401, verified).
/// @dev    Staked sMUSD earns MEZO emissions directed by veBTC votes. The gauge claims the native
///         MUSD yield of everything staked and sends it to veBTC voters (`_claimFees`), so a staker
///         trades the savings yield for MEZO. `deposit` requires the gauge to be alive; `withdraw`
///         and `getReward` do not.
interface IVaultGauge {
    function stakingToken() external view returns (address);

    function rewardToken() external view returns (address);

    function balanceOf(address account) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function rewardRate() external view returns (uint256);

    function periodFinish() external view returns (uint256);

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    /// @dev Callable by `account` itself or the voter.
    function getReward(address account) external;
}
