// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AnnaSetu — DonationEscrow.sol
 * Polygon Amoy (testnet) / Polygon PoS (mainnet)
 * Manages e-RUPI voucher escrow for food donation value credits
 * 
 * Architecture:
 *   BankOrg deploys → donors trigger credits → NGOs claim vouchers → merchants settle
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract DonationEscrow is AccessControl, ReentrancyGuard, Pausable {

    // ── Roles ─────────────────────────────────────────────────────────────────
    bytes32 public constant BANK_ROLE       = keccak256("BANK_ROLE");
    bytes32 public constant NGO_ROLE        = keccak256("NGO_ROLE");
    bytes32 public constant DONOR_ROLE      = keccak256("DONOR_ROLE");
    bytes32 public constant MERCHANT_ROLE   = keccak256("MERCHANT_ROLE");
    bytes32 public constant AUDITOR_ROLE    = keccak256("AUDITOR_ROLE");

    // ── Structs ───────────────────────────────────────────────────────────────
    enum VoucherStatus { Active, Redeemed, Expired, Cancelled }

    struct Voucher {
        bytes32  voucherId;
        address  beneficiary;          // BPL family wallet (Jan Dhan linked)
        address  merchant;             // Kirana / Merchant wallet
        uint256  faceValue;            // in paise (INR * 100)
        uint256  createdAt;
        uint256  expiresAt;
        string   lotId;               // Hyperledger lot reference
        string   donorPan;            // for 80G tracking
        bool     isVegetarian;
        VoucherStatus status;
    }

    struct DonorCredit {
        address  donor;
        string   pan;
        uint256  totalValuePaise;
        uint256  vouchersIssued;
        uint256  lastUpdated;
    }

    struct MerchantSettlement {
        address  merchant;
        uint256  totalRedeemed;
        uint256  settledAmount;
        uint256  pendingAmount;
        uint256  lastSettlement;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    mapping(bytes32 => Voucher)              public vouchers;
    mapping(address => DonorCredit)          public donorCredits;
    mapping(address => MerchantSettlement)   public merchantSettlements;
    mapping(address => bytes32[])            public beneficiaryVouchers;
    mapping(address => bytes32[])            public merchantPendingVouchers;

    uint256 public totalEscrowPaise;        // total locked value
    uint256 public voucherDefaultTTL = 90 days;
    uint256 public voucherCount;

    // ── Events ────────────────────────────────────────────────────────────────
    event VoucherIssued(bytes32 indexed voucherId, address indexed beneficiary, uint256 value, string lotId);
    event VoucherRedeemed(bytes32 indexed voucherId, address indexed beneficiary, address indexed merchant, uint256 value);
    event VoucherExpired(bytes32 indexed voucherId);
    event VoucherCancelled(bytes32 indexed voucherId, string reason);
    event MerchantSettled(address indexed merchant, uint256 amount);
    event DonorCreditRecorded(address indexed donor, string pan, uint256 value);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address bankAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, bankAdmin);
        _grantRole(BANK_ROLE, bankAdmin);
    }

    // ── Receive MATIC for escrow ──────────────────────────────────────────────
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    // ── Voucher Management ────────────────────────────────────────────────────

    /**
     * @notice Issue a new food voucher (called by BankOrg after donation delivery confirmed)
     * @param beneficiary Jan Dhan-linked wallet address
     * @param merchant    Pre-approved Kirana merchant address
     * @param faceValuePaise  Face value in paise (₹100 = 10000)
     * @param lotId       Hyperledger Fabric lot ID
     * @param donorPan    PAN for 80G tracking
     * @param isVeg       Vegetarian-only restriction flag
     */
    function issueVoucher(
        address  beneficiary,
        address  merchant,
        uint256  faceValuePaise,
        string   calldata lotId,
        string   calldata donorPan,
        bool     isVeg
    ) external onlyRole(BANK_ROLE) whenNotPaused returns (bytes32 voucherId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(merchant    != address(0), "Invalid merchant");
        require(faceValuePaise > 0,         "Value must be > 0");
        require(hasRole(MERCHANT_ROLE, merchant), "Merchant not registered");

        voucherId = keccak256(abi.encodePacked(
            beneficiary, merchant, faceValuePaise, lotId, block.timestamp, voucherCount++
        ));
        require(vouchers[voucherId].createdAt == 0, "Voucher already exists");

        vouchers[voucherId] = Voucher({
            voucherId:   voucherId,
            beneficiary: beneficiary,
            merchant:    merchant,
            faceValue:   faceValuePaise,
            createdAt:   block.timestamp,
            expiresAt:   block.timestamp + voucherDefaultTTL,
            lotId:       lotId,
            donorPan:    donorPan,
            isVegetarian:isVeg,
            status:      VoucherStatus.Active
        });

        beneficiaryVouchers[beneficiary].push(voucherId);
        merchantPendingVouchers[merchant].push(voucherId);
        totalEscrowPaise += faceValuePaise;

        emit VoucherIssued(voucherId, beneficiary, faceValuePaise, lotId);
    }

    /**
     * @notice Beneficiary redeems voucher at merchant (via QR scan)
     * @param voucherId  The voucher to redeem
     */
    function redeemVoucher(bytes32 voucherId)
        external
        nonReentrant
        whenNotPaused
    {
        Voucher storage v = vouchers[voucherId];
        require(v.createdAt != 0,                           "Voucher not found");
        require(v.beneficiary == msg.sender,                "Not voucher owner");
        require(v.status == VoucherStatus.Active,           "Voucher not active");
        require(block.timestamp <= v.expiresAt,             "Voucher expired");

        v.status = VoucherStatus.Redeemed;
        totalEscrowPaise -= v.faceValue;

        // Update merchant settlement
        MerchantSettlement storage ms = merchantSettlements[v.merchant];
        ms.merchant        = v.merchant;
        ms.totalRedeemed   += v.faceValue;
        ms.pendingAmount   += v.faceValue;
        ms.lastSettlement   = block.timestamp;

        emit VoucherRedeemed(voucherId, msg.sender, v.merchant, v.faceValue);
    }

    /**
     * @notice Bank settles accumulated redemptions to merchant
     * @param merchant  Merchant address to settle
     */
    function settleMerchant(address merchant)
        external
        onlyRole(BANK_ROLE)
        nonReentrant
    {
        MerchantSettlement storage ms = merchantSettlements[merchant];
        require(ms.pendingAmount > 0, "Nothing to settle");

        // Convert paise to MATIC (mock: 1 INR = 0.001 MATIC for demo)
        uint256 maticAmount = ms.pendingAmount / 100000;  // paise → MATIC wei approx
        uint256 pending     = ms.pendingAmount;

        ms.settledAmount  += pending;
        ms.pendingAmount   = 0;
        ms.lastSettlement  = block.timestamp;

        if (maticAmount > 0 && address(this).balance >= maticAmount) {
            (bool sent,) = payable(merchant).call{value: maticAmount}("");
            require(sent, "MATIC transfer failed");
        }

        emit MerchantSettled(merchant, pending);
    }

    /**
     * @notice Batch expire vouchers past their TTL
     * @param voucherIds  Array of voucher IDs to expire
     */
    function batchExpireVouchers(bytes32[] calldata voucherIds)
        external
        onlyRole(BANK_ROLE)
    {
        for (uint i = 0; i < voucherIds.length; i++) {
            Voucher storage v = vouchers[voucherIds[i]];
            if (v.status == VoucherStatus.Active && block.timestamp > v.expiresAt) {
                v.status = VoucherStatus.Expired;
                totalEscrowPaise -= v.faceValue;
                emit VoucherExpired(voucherIds[i]);
            }
        }
    }

    /**
     * @notice Record donor's in-kind donation value for 80G credit tracking
     */
    function recordDonorCredit(
        address donorWallet,
        string calldata pan,
        uint256 valuePaise
    ) external onlyRole(BANK_ROLE) {
        DonorCredit storage dc = donorCredits[donorWallet];
        dc.donor           = donorWallet;
        dc.pan             = pan;
        dc.totalValuePaise += valuePaise;
        dc.vouchersIssued  += 1;
        dc.lastUpdated      = block.timestamp;
        emit DonorCreditRecorded(donorWallet, pan, valuePaise);
    }

    /**
     * @notice Cancel a voucher (e.g. if lot is recalled)
     */
    function cancelVoucher(bytes32 voucherId, string calldata reason)
        external
        onlyRole(BANK_ROLE)
    {
        Voucher storage v = vouchers[voucherId];
        require(v.status == VoucherStatus.Active, "Cannot cancel non-active voucher");
        v.status = VoucherStatus.Cancelled;
        totalEscrowPaise -= v.faceValue;
        emit VoucherCancelled(voucherId, reason);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    function getVoucher(bytes32 voucherId) external view returns (Voucher memory) {
        return vouchers[voucherId];
    }

    function getBeneficiaryVouchers(address beneficiary) external view returns (bytes32[] memory) {
        return beneficiaryVouchers[beneficiary];
    }

    function getMerchantPending(address merchant) external view returns (bytes32[] memory) {
        return merchantPendingVouchers[merchant];
    }

    function getEscrowBalance() external view returns (uint256) {
        return totalEscrowPaise;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setVoucherTTL(uint256 ttlSeconds) external onlyRole(BANK_ROLE) {
        voucherDefaultTTL = ttlSeconds;
    }

    function pause()   external onlyRole(BANK_ROLE) { _pause(); }
    function unpause() external onlyRole(BANK_ROLE) { _unpause(); }

    function withdrawExcess(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0));
        (bool sent,) = payable(to).call{value: amount}("");
        require(sent, "Withdraw failed");
        emit FundsWithdrawn(to, amount);
    }
}
