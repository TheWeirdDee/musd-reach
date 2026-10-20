// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice The deployed Mezo `MUSDSavingsRate` vault (sMUSD), as verified on the
///         Mezo explorer (testnet implementation 0x92D12f0a60906b39d81acD9bf8977b6c824cD98C).
/// @dev    This is NOT an ERC-4626 vault. sMUSD is minted and burned 1:1 against
///         MUSD principal. Yield is tracked per account with a global index:
///         claimable(a) = claimableYield[a] + balanceOf(a) * (yieldIndex - supplyYieldIndex[a]) / 1e18
///         Every sMUSD transfer checkpoints both parties first, so yield accrued
///         before a transfer stays with the sender.
interface IMUSDSavingsRate is IERC20 {
    function musdToken() external view returns (address);

    function deposit(uint256 amount) external;

    /// @dev Also claims all of the caller's outstanding yield before burning.
    function withdraw(uint256 amount) external;

    function claimYield() external returns (uint256);

    /// @dev Permissionless; anyone can donate MUSD yield to all sMUSD holders.
    function receiveProtocolYield(uint256 amount) external;

    /// @dev Permissionless; pulls yield from the active strategy into the index.
    function receiveYieldFromStrategy() external;

    function yieldIndex() external view returns (uint256);

    function supplyYieldIndex(address account) external view returns (uint256);

    function claimableYield(address account) external view returns (uint256);

    function pendingYield() external view returns (uint256);

    function pcv() external view returns (address);

    function strategy() external view returns (address);
}

/// @notice MUSD protocol-controlled value; distributes accumulated fees to the vault.
interface IPCV {
    function distributeMUSD() external;
}
