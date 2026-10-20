// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IWormhole} from "../interfaces/IWormhole.sol";
import {ReachGatewayBase} from "../shared/ReachGatewayBase.sol";
import {ReachMessages} from "../shared/ReachMessages.sol";
import {RemoteWrapperReceipt} from "./RemoteWrapperReceipt.sol";

/// @title ReachDestinationGateway
/// @notice Destination-chain verifier and messenger. Mints rwSMUSD exactly once per
///         authenticated ISSUE message from the enrolled Mezo source gateway, and burns
///         rwSMUSD before publishing a REDEEM message.
/// @dev    The destination gateway has no pause and no admin. The deployer's only power is
///         a single, one-time enrollment of the Mezo source gateway address (needed because
///         the source gateway's constructor binds this contract's and the receipt's
///         addresses). After `bindSourceGateway`, the deployer has no remaining authority.
contract ReachDestinationGateway is ReachGatewayBase {
    RemoteWrapperReceipt public immutable receipt;
    address public immutable binder;

    address public sourceGateway;

    uint256 public totalMinted;
    uint256 public totalBurned;

    struct Redemption {
        address holder;
        address recipient;
        uint256 shares;
        uint64 sequence;
        uint64 nonce;
        uint8 mode;
        uint64 timestamp;
    }

    mapping(bytes32 transferId => Redemption) public redemptions;

    /// @notice Freshest authenticated wrapper NAV snapshot received from Mezo.
    struct Nav {
        uint256 assets; // wrapper totalAssets, MUSD base units
        uint256 supply; // wrapper totalSupply, wSMUSD base units
        uint64 timestamp; // Mezo block timestamp of the snapshot
        uint64 blockNumber; // Mezo block number of the snapshot
        uint64 sourceNonce; // source gateway nonce of the message that carried it
    }

    Nav public latestNav;
    bool public hasNav;

    event SourceGatewayBound(address indexed sourceGateway);
    event NavUpdated(uint256 assets, uint256 supply, uint64 timestamp, uint64 blockNumber);
    event ReceiptMinted(bytes32 indexed transferId, address indexed recipient, uint256 shares);
    event ReceiptBurned(
        bytes32 indexed transferId,
        address indexed holder,
        address indexed recipient,
        uint256 shares,
        uint8 mode,
        uint64 sequence,
        uint64 nonce
    );

    error NotBinder();
    error AlreadyBound();
    error InvalidMode();

    constructor(
        IWormhole wormhole_,
        uint16 sourceWormholeChainId_,
        uint256 sourceEvmChainId_,
        address sourceWrapper_,
        uint8 consistencyLevel_
    )
        ReachGatewayBase(
            wormhole_, sourceWormholeChainId_, sourceEvmChainId_, sourceWrapper_, consistencyLevel_
        )
    {
        receipt = new RemoteWrapperReceipt(address(this));
        binder = msg.sender;
    }

    function _peerGateway() internal view override returns (address) {
        return sourceGateway;
    }

    function _receipt() internal view override returns (address) {
        return address(receipt);
    }

    /// @notice One-time enrollment of the Mezo source gateway.
    function bindSourceGateway(address sourceGateway_) external {
        if (msg.sender != binder) revert NotBinder();
        if (sourceGateway != address(0)) revert AlreadyBound();
        if (sourceGateway_ == address(0)) revert ZeroAddress();
        sourceGateway = sourceGateway_;
        emit SourceGatewayBound(sourceGateway_);
    }

    /// @notice Deliver a guardian-signed ISSUE VAA. Callable by anyone, executes once.
    function receiveIssue(bytes calldata encodedVaa)
        external
        nonReentrant
        returns (bytes32 transferId)
    {
        ReachMessages.Message memory m;
        (m, transferId) = _consume(encodedVaa, ReachMessages.DIRECTION_ISSUE);
        _updateNav(m);
        totalMinted += m.shares;
        receipt.mint(m.recipient, m.shares);
        emit ReceiptMinted(transferId, m.recipient, m.shares);
    }

    /// @notice Deliver a guardian-signed NAV snapshot. Callable by anyone, executes once.
    ///         An older snapshot delivered late is consumed but does not overwrite a newer one.
    function receiveNav(bytes calldata encodedVaa) external nonReentrant returns (bytes32 transferId) {
        ReachMessages.Message memory m;
        (m, transferId) = _consume(encodedVaa, ReachMessages.DIRECTION_NAV);
        _updateNav(m);
    }

    /// @dev Source nonces are strictly increasing, so they order snapshots even within one
    ///      Mezo block.
    function _updateNav(ReachMessages.Message memory m) internal {
        if (hasNav && m.nonce <= latestNav.sourceNonce) return;
        hasNav = true;
        latestNav = Nav(m.navAssets, m.navSupply, m.navTimestamp, m.navBlock, m.nonce);
        emit NavUpdated(m.navAssets, m.navSupply, m.navTimestamp, m.navBlock);
    }

    /// @notice Burn rwSMUSD and request release on Mezo.
    /// @param shares       exact rwSMUSD base units to burn
    /// @param mezoRecipient Mezo address that receives the released wSMUSD (or MUSD)
    /// @param mode         MODE_SHARES (1) or MODE_MUSD (2)
    /// @param minAssets    MODE_MUSD only: minimum MUSD; below it, shares are delivered
    function burnAndRedeem(uint256 shares, address mezoRecipient, uint8 mode, uint256 minAssets)
        external
        payable
        nonReentrant
        returns (bytes32 transferId, uint64 sequence)
    {
        if (shares == 0) revert ZeroAmount();
        if (mezoRecipient == address(0)) revert ZeroAddress();
        if (mode != ReachMessages.MODE_SHARES && mode != ReachMessages.MODE_MUSD) {
            revert InvalidMode();
        }

        receipt.burnFrom(msg.sender, shares);
        totalBurned += shares;

        ReachMessages.Message memory m =
            _baseMessage(ReachMessages.DIRECTION_REDEEM, shares, mezoRecipient);
        m.redeemMode = mode;
        m.minAssets = mode == ReachMessages.MODE_MUSD ? minAssets : 0;
        (transferId, sequence) = _publish(m);

        redemptions[transferId] = Redemption({
            holder: msg.sender,
            recipient: mezoRecipient,
            shares: shares,
            sequence: sequence,
            nonce: m.nonce,
            mode: mode,
            timestamp: uint64(block.timestamp)
        });
        emit ReceiptBurned(transferId, msg.sender, mezoRecipient, shares, mode, sequence, m.nonce);
    }
}
