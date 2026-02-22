// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AnnaSetu Food Bridge Contract
 * @notice Public transparency ledger on Polygon for food donation audit
 * @dev Deployed on Polygon Amoy Testnet (Chain ID: 80002)
 *      Stores anonymized donation hashes — no PII on-chain
 */
contract AnnaSetu {

    // ── Events ──
    event DonationRecorded(
        bytes32 indexed lotHash,
        address indexed donor,
        uint256 quantityKg,
        uint256 beneficiaryCount,
        uint256 timestamp
    );

    event FoodCreditIssued(
        bytes32 indexed beneficiaryHash,
        uint256 amountINR,
        uint256 validUntil,
        uint256 timestamp
    );

    event CreditRedeemed(
        bytes32 indexed beneficiaryHash,
        bytes32 indexed merchantHash,
        uint256 amountINR,
        uint256 timestamp
    );

    event TaxCertificateIssued(
        bytes32 indexed lotHash,
        bytes32 indexed donorHash,
        uint256 deductionValueINR,
        uint256 timestamp
    );

    // ── State ──
    address public owner;
    uint256 public totalDonationsKg;
    uint256 public totalBeneficiariesServed;
    uint256 public totalCreditsIssuedINR;

    struct DonationRecord {
        bytes32 lotHash;
        uint256 quantityKg;
        uint256 beneficiaryCount;
        uint256 timestamp;
        bool taxCertIssued;
    }

    mapping(bytes32 => DonationRecord) public donations;
    mapping(bytes32 => bool) public activeFoodCredits;

    modifier onlyOwner() {
        require(msg.sender == owner, "AnnaSetu: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Record a completed food donation on public chain
     * @param lotHash keccak256 of Hyperledger lotId (private chain reference)
     * @param quantityKg Food quantity in kilograms * 100 (to preserve 2 decimals)
     * @param beneficiaryCount Number of beneficiaries served
     */
    function recordDonation(
        bytes32 lotHash,
        uint256 quantityKg,
        uint256 beneficiaryCount
    ) external onlyOwner {
        require(donations[lotHash].timestamp == 0, "AnnaSetu: lot already recorded");

        donations[lotHash] = DonationRecord({
            lotHash: lotHash,
            quantityKg: quantityKg,
            beneficiaryCount: beneficiaryCount,
            timestamp: block.timestamp,
            taxCertIssued: false
        });

        totalDonationsKg += quantityKg;
        totalBeneficiariesServed += beneficiaryCount;

        emit DonationRecorded(lotHash, msg.sender, quantityKg, beneficiaryCount, block.timestamp);
    }

    /**
     * @notice Issue food credit to beneficiary (anonymized via hash)
     * @param beneficiaryHash keccak256 of beneficiary Aadhaar hash (double-hashed, no PII)
     * @param amountINR Credit amount in paise (1 INR = 100 paise)
     * @param validityDays Days until credit expires
     */
    function issueFoodCredit(
        bytes32 beneficiaryHash,
        uint256 amountINR,
        uint256 validityDays
    ) external onlyOwner {
        uint256 validUntil = block.timestamp + (validityDays * 1 days);
        activeFoodCredits[beneficiaryHash] = true;
        totalCreditsIssuedINR += amountINR;

        emit FoodCreditIssued(beneficiaryHash, amountINR, validUntil, block.timestamp);
    }

    /**
     * @notice Record credit redemption at merchant
     */
    function recordRedemption(
        bytes32 beneficiaryHash,
        bytes32 merchantHash,
        uint256 amountINR
    ) external onlyOwner {
        activeFoodCredits[beneficiaryHash] = false;
        emit CreditRedeemed(beneficiaryHash, merchantHash, amountINR, block.timestamp);
    }

    /**
     * @notice Issue 80G tax certificate hash on-chain
     */
    function issueTaxCertificate(
        bytes32 lotHash,
        bytes32 donorHash,
        uint256 deductionValueINR
    ) external onlyOwner {
        require(donations[lotHash].timestamp > 0, "AnnaSetu: lot not found");
        donations[lotHash].taxCertIssued = true;

        emit TaxCertificateIssued(lotHash, donorHash, deductionValueINR, block.timestamp);
    }

    /**
     * @notice Get aggregate impact metrics (public)
     */
    function getImpactMetrics() external view returns (
        uint256 donationsKg,
        uint256 beneficiaries,
        uint256 creditsINR
    ) {
        return (totalDonationsKg, totalBeneficiariesServed, totalCreditsIssuedINR);
    }
}
