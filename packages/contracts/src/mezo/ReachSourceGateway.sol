// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";
import {ReachGatewayBase} from "../shared/ReachGatewayBase.sol";
import {ReachMessages} from "../shared/ReachMessages.sol";
import {ReachSavingsWrapper} from "./ReachSavingsWrapper.sol";

/// @title ReachSourceGateway
/// @notice Mezo-side custody and messenger. Locks wSMUSD shares and publishes an
///         ISSUE message; releases locked shares only on an authenticated REDEEM
///         message proving the matching rwSMUSD units were burned on the destination.
/// @dev    Custody and messaging live in one contract on purpose: no cross-contract
///         trust edge exists through which shares could be released.
///
///         Conservation: `totalLocked == totalIssued - totalReleased`, and at mutually
///         finalized checkpoints `totalLocked == remote supply + in-flight issues + in-flight
///         redemptions`. There is no refund-on-timeout: a published ISSUE VAA can always be
///         delivered later, so the only way to unlock is a delivered REDEEM.
///
///         The guardian can only pause *new* locks. It cannot release, seize, or block
///         redemption delivery. Peer configuration is immutable.
///
///         Payout-asset integrity: a REDEEM message names the asset the burner chose. A relayer
///         controls the gas of `receiveRedeem` and must not be able to change that choice. MUSD
///         settlements therefore (1) revert the whole delivery if the settlement attempt ran out of
///         gas, so the message stays deliverable, and (2) never silently substitute shares: a
///         settlement that genuinely fails is parked as a pending settlement in custody that anyone
///         may retry, and only the recipient may relax (lower minimum) or convert (take shares).
contract ReachSourceGateway is ReachGatewayBase {
    using SafeERC20 for IERC20;

    ReachSavingsWrapper public immutable shareToken;
    IERC20 public immutable musd;
    IERC20 public immutable smusd;
    address public immutable destinationGateway;
    address public immutable remoteReceipt;

    /// @notice wSMUSD units currently held against issued or in-flight remote receipts.
    uint256 public totalLocked;
    uint256 public totalIssued;
    uint256 public totalReleased;

    address public guardian;
    address public pendingGuardian;
    bool public issuancePaused;

    struct Issue {
        address sender;
        address recipient;
        uint256 shares;
        uint64 sequence;
        uint64 nonce;
        uint64 timestamp;
    }

    mapping(bytes32 transferId => Issue) public issues;

    /// @notice MUSD redemptions whose settlement could not complete at delivery. The shares stay in
    ///         custody, owed to `recipient`, and count toward `totalPendingSettlement`.
    struct PendingSettlement {
        address recipient;
        uint256 shares;
        uint256 minAssets;
    }

    mapping(bytes32 transferId => PendingSettlement) public pendingSettlements;
    /// @notice wSMUSD held for pending MUSD settlements (no longer backing remote receipts).
    uint256 public totalPendingSettlement;

    event SharesLocked(
        bytes32 indexed transferId,
        address indexed sender,
        address indexed recipient,
        uint256 shares,
        uint64 sequence,
        uint64 nonce
    );
    event SharesReleased(
        bytes32 indexed transferId, address indexed recipient, uint256 shares, uint8 mode
    );
    event RedeemedToMusd(
        bytes32 indexed transferId, address indexed recipient, uint256 shares, uint256 assets
    );
    event SettlementPending(bytes32 indexed transferId, address indexed recipient, uint256 shares, uint256 minAssets, bytes reason);
    event PendingSettlementSharesClaimed(bytes32 indexed transferId, address indexed recipient, uint256 shares);
    event NavPublished(
        bytes32 indexed transferId, uint256 navAssets, uint256 navSupply, uint64 navTimestamp, uint64 sequence
    );
    event IssuancePaused(bool paused);
    event GuardianProposed(address indexed proposed);
    event GuardianAccepted(address indexed guardian);

    error IssuanceIsPaused();
    error NotGuardian();
    error NotPendingGuardian();
    error InvalidMode();
    error OnlySelf();
    error InsufficientGasForSettlement();
    error NoPendingSettlement();
    error NotRecipient();

    constructor(
        IWormhole wormhole_,
        ReachSavingsWrapper wrapper_,
        uint16 destinationWormholeChainId_,
        uint256 destinationEvmChainId_,
        address destinationGateway_,
        address remoteReceipt_,
        uint8 consistencyLevel_,
        address guardian_
    )
        ReachGatewayBase(
            wormhole_,
            destinationWormholeChainId_,
            destinationEvmChainId_,
            address(wrapper_),
            consistencyLevel_
        )
    {
        if (destinationGateway_ == address(0) || remoteReceipt_ == address(0) || guardian_ == address(0))
        {
            revert ZeroAddress();
        }
        shareToken = wrapper_;
        musd = IERC20(wrapper_.asset());
        smusd = IERC20(address(wrapper_.savingsVault()));
        destinationGateway = destinationGateway_;
        remoteReceipt = remoteReceipt_;
        guardian = guardian_;
    }

    function _peerGateway() internal view override returns (address) {
        return destinationGateway;
    }

    function _receipt() internal view override returns (address) {
        return remoteReceipt;
    }

    function _navSnapshot()
        internal
        view
        override
        returns (uint256 assets, uint256 supply, uint64 timestamp, uint64 blockNumber)
    {
        return (
            shareToken.totalAssets(),
            shareToken.totalSupply(),
            uint64(block.timestamp),
            uint64(block.number)
        );
    }

    /// @notice Publish a wrapper NAV snapshot to the destination chain. Permissionless; moves
    ///         no value. Lets destination integrations (e.g. a lending oracle) read an
    ///         authenticated, timestamped wrapper NAV instead of a backend-supplied price.
    function publishNav() external payable nonReentrant returns (bytes32 transferId, uint64 sequence) {
        ReachMessages.Message memory m = _baseMessage(ReachMessages.DIRECTION_NAV, 0, address(0));
        (transferId, sequence) = _publish(m);
        emit NavPublished(transferId, m.navAssets, m.navSupply, m.navTimestamp, sequence);
    }

    // ---------------------------------------------------------------------
    // Outbound: lock -> ISSUE
    // ---------------------------------------------------------------------

    /// @notice Lock existing wSMUSD shares and request exact rwSMUSD issuance on Base.
    function lockAndIssue(uint256 shares, address recipient)
        external
        payable
        nonReentrant
        returns (bytes32 transferId, uint64 sequence)
    {
        IERC20(address(shareToken)).safeTransferFrom(msg.sender, address(this), shares);
        return _lock(shares, recipient);
    }

    /// @notice One transaction: deposit MUSD into the wrapper, lock the minted shares,
    ///         and request issuance. Requires a MUSD allowance to this gateway.
    function depositAndIssue(uint256 assets, address recipient, uint256 minShares)
        external
        payable
        nonReentrant
        returns (bytes32 transferId, uint64 sequence, uint256 shares)
    {
        musd.safeTransferFrom(msg.sender, address(this), assets);
        musd.forceApprove(address(shareToken), assets);
        shares = shareToken.depositWithMin(assets, address(this), minShares);
        (transferId, sequence) = _lock(shares, recipient);
    }

    /// @notice One transaction: wrap native sMUSD principal, lock the minted shares, and
    ///         request issuance. Yield the caller accrued before this call stays with the
    ///         caller in the native vault. Requires an sMUSD allowance to this gateway.
    function depositSavingsAndIssue(uint256 amount, address recipient, uint256 minShares)
        external
        payable
        nonReentrant
        returns (bytes32 transferId, uint64 sequence, uint256 shares)
    {
        smusd.safeTransferFrom(msg.sender, address(this), amount);
        smusd.forceApprove(address(shareToken), amount);
        shares = shareToken.depositSavings(amount, address(this), minShares);
        (transferId, sequence) = _lock(shares, recipient);
    }

    function _lock(uint256 shares, address recipient)
        internal
        returns (bytes32 transferId, uint64 sequence)
    {
        if (issuancePaused) revert IssuanceIsPaused();
        if (shares == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        totalLocked += shares;
        totalIssued += shares;

        ReachMessages.Message memory m =
            _baseMessage(ReachMessages.DIRECTION_ISSUE, shares, recipient);
        (transferId, sequence) = _publish(m);
        issues[transferId] = Issue({
            sender: msg.sender,
            recipient: recipient,
            shares: shares,
            sequence: sequence,
            nonce: m.nonce,
            timestamp: uint64(block.timestamp)
        });
        emit SharesLocked(transferId, msg.sender, recipient, shares, sequence, m.nonce);
    }

    // ---------------------------------------------------------------------
    // Inbound: REDEEM -> release
    // ---------------------------------------------------------------------

    /// @notice Deliver a guardian-signed REDEEM VAA from the destination gateway.
    ///         Callable by anyone; executes at most once per transfer.
    function receiveRedeem(bytes calldata encodedVaa)
        external
        nonReentrant
        returns (bytes32 transferId)
    {
        ReachMessages.Message memory m;
        (m, transferId) = _consume(encodedVaa, ReachMessages.DIRECTION_REDEEM);

        totalLocked -= m.shares;
        totalReleased += m.shares;

        if (m.redeemMode == ReachMessages.MODE_SHARES) {
            IERC20(address(shareToken)).safeTransfer(m.recipient, m.shares);
            emit SharesReleased(transferId, m.recipient, m.shares, m.redeemMode);
        } else if (m.redeemMode == ReachMessages.MODE_MUSD) {
            // The shares no longer back a remote receipt; they are owed to the recipient as MUSD.
            totalPendingSettlement += m.shares;
            pendingSettlements[transferId] = PendingSettlement(m.recipient, m.shares, m.minAssets);
            (bool settled, bytes memory reason,) = _trySettle(transferId, m.minAssets);
            if (!settled) emit SettlementPending(transferId, m.recipient, m.shares, m.minAssets, reason);
        } else {
            // Unreachable for messages produced by the peer gateway, which validates mode.
            revert InvalidMode();
        }
    }

    // ---------------------------------------------------------------------
    // Pending MUSD settlements
    // ---------------------------------------------------------------------

    /// @notice Retry a pending MUSD settlement with the burner's original minimum. Permissionless;
    ///         reverts (leaving it pending) if it still cannot settle.
    function retrySettlement(bytes32 transferId) external nonReentrant returns (uint256 assets) {
        PendingSettlement memory p = pendingSettlements[transferId];
        if (p.shares == 0) revert NoPendingSettlement();
        return _settleOrRevert(transferId, p.minAssets);
    }

    /// @notice The recipient may accept a lower minimum (for example after a NAV drop).
    function settleWithMinAssets(bytes32 transferId, uint256 minAssets)
        external
        nonReentrant
        returns (uint256 assets)
    {
        PendingSettlement memory p = pendingSettlements[transferId];
        if (p.shares == 0) revert NoPendingSettlement();
        if (msg.sender != p.recipient) revert NotRecipient();
        return _settleOrRevert(transferId, minAssets);
    }

    /// @notice The recipient may take the wSMUSD shares instead of MUSD. Only the recipient can
    ///         make this choice; nobody else can switch the payout asset.
    function claimSharesInstead(bytes32 transferId) external nonReentrant {
        PendingSettlement memory p = pendingSettlements[transferId];
        if (p.shares == 0) revert NoPendingSettlement();
        if (msg.sender != p.recipient) revert NotRecipient();
        delete pendingSettlements[transferId];
        totalPendingSettlement -= p.shares;
        IERC20(address(shareToken)).safeTransfer(p.recipient, p.shares);
        emit PendingSettlementSharesClaimed(transferId, p.recipient, p.shares);
        emit SharesReleased(transferId, p.recipient, p.shares, ReachMessages.MODE_SHARES);
    }

    function _settleOrRevert(bytes32 transferId, uint256 minAssets) internal returns (uint256 assets) {
        bool settled;
        bytes memory reason;
        (settled, reason, assets) = _trySettle(transferId, minAssets);
        if (!settled) {
            // Bubble up the settlement failure; the entry stays pending.
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
    }

    /// @dev Attempts the MUSD settlement of a pending entry. On success the entry is cleared.
    ///      If the attempt failed because it ran out of gas (the callee consumed all but ~1/64 of
    ///      the forwarded gas), the whole transaction reverts so a relayer cannot turn a gas-starved
    ///      attempt into a recorded failure.
    function _trySettle(bytes32 transferId, uint256 minAssets)
        internal
        returns (bool settled, bytes memory reason, uint256 assets)
    {
        PendingSettlement memory p = pendingSettlements[transferId];
        uint256 gasBefore = gasleft();
        try this.redeemForRecipient(p.shares, p.recipient, minAssets) returns (uint256 out) {
            delete pendingSettlements[transferId];
            totalPendingSettlement -= p.shares;
            emit SharesReleased(transferId, p.recipient, p.shares, ReachMessages.MODE_MUSD);
            emit RedeemedToMusd(transferId, p.recipient, p.shares, out);
            return (true, "", out);
        } catch (bytes memory r) {
            if (gasleft() <= gasBefore / 63) revert InsufficientGasForSettlement();
            return (false, r, 0);
        }
    }

    /// @dev External self-call so a failed MUSD redemption reverts atomically and can be
    ///      caught by `receiveRedeem` without releasing anything twice.
    function redeemForRecipient(uint256 shares, address recipient, uint256 minAssets)
        external
        returns (uint256 assets)
    {
        if (msg.sender != address(this)) revert OnlySelf();
        assets = shareToken.redeem(shares, recipient, address(this));
        if (assets < minAssets) revert ReachSavingsWrapper.SlippageExceeded(assets, minAssets);
    }

    // ---------------------------------------------------------------------
    // Guardian: may pause new locks only
    // ---------------------------------------------------------------------

    function setIssuancePaused(bool paused) external {
        if (msg.sender != guardian) revert NotGuardian();
        issuancePaused = paused;
        emit IssuancePaused(paused);
    }

    function proposeGuardian(address proposed) external {
        if (msg.sender != guardian) revert NotGuardian();
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
