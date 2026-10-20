// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title RemoteWrapperReceipt (rwSMUSD)
/// @notice Standard ERC-20 receipt on the destination chain. One rwSMUSD base unit is a
///         claim on exactly one wSMUSD base unit locked in the Mezo ReachSourceGateway.
///         It is not MUSD, not native sMUSD, and not pegged to $1: its value is
///         `units x wrapper net assets per share`, subject to cross-chain risk.
/// @dev    The only minter/burner is the gateway that deployed it (immutable). There is
///         no owner, no pause, no blocklist and no admin seizure.
contract RemoteWrapperReceipt is ERC20, ERC20Permit {
    address public immutable gateway;

    error OnlyGateway();

    constructor(address gateway_)
        ERC20("Reach Remote Mezo Savings Receipt", "rwSMUSD")
        ERC20Permit("Reach Remote Mezo Savings Receipt")
    {
        gateway = gateway_;
    }

    modifier onlyGateway() {
        if (msg.sender != gateway) revert OnlyGateway();
        _;
    }

    /// @dev Called only after an authenticated ISSUE message was consumed.
    function mint(address to, uint256 amount) external onlyGateway {
        _mint(to, amount);
    }

    /// @dev The gateway only ever burns from the holder initiating the redemption.
    function burnFrom(address holder, uint256 amount) external onlyGateway {
        _burn(holder, amount);
    }
}
