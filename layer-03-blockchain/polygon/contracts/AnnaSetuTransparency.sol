// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AnnaSetu Transparency Ledger
 * @notice Public Polygon zkEVM contract for immutable food donation audit trail
 * @dev Records anonymised donation hashes — no PII stored on-chain
 */
contract AnnaSetuTransparency {
    address public immutable owner;
    uint256 public totalDonations;
    uint256 public totalFoodKg;
    uint256 public totalBeneficiaries;
    uint256 public totalCreditsINR;

    struct DonationRecord {
        bytes32 hyperledgerTxHash; // Hash from Hyperledger private chain
        address donor;             // Donor wallet address
        uint256 foodQuantityGrams;
        uint256 timestamp;
        string city;
        bool qualityApproved;
    }

    struct CreditRecord {
        bytes32 creditId;
        bytes32 beneficiaryHash;   // Aadhaar hash — never raw ID
        uint256 amountPaise;       // Amount in paise (1 INR = 100 paise)
        uint256 issuedAt;
        bool redeemed;
    }

    struct TaxCertificate {
        bytes32 certificateHash;
        address donor;
        uint256 donationValue;
        uint256 eligible80GAmount;
        uint256 issuedAt;
    }

    mapping(bytes32 => DonationRecord) public donations;
    mapping(bytes32 => CreditRecord) public credits;
    mapping(bytes32 => TaxCertificate) public taxCerts;
    mapping(address => uint256) public donorTotalKg;
    
    bytes32[] public donationIndex;
    bytes32[] public creditIndex;

    event DonationRecorded(bytes32 indexed txHash, address indexed donor, uint256 foodKg, string city);
    event CreditIssued(bytes32 indexed creditId, uint256 amount, uint256 issuedAt);
    event CreditRedeemed(bytes32 indexed creditId, bytes32 merchantHash, uint256 amount);
    event TaxCertificateIssued(bytes32 indexed certHash, address indexed donor, uint256 value);

    modifier onlyOwner() { require(msg.sender == owner, "Not authorized"); _; }

    constructor() { owner = msg.sender; }

    /**
     * @notice Record a food donation event (called after Hyperledger confirmation)
     */
    function recordDonation(
        bytes32 hyperledgerTxHash,
        uint256 foodQuantityGrams,
        string calldata city,
        bool qualityApproved
    ) external {
        require(donations[hyperledgerTxHash].timestamp == 0, "Already recorded");
        
        donations[hyperledgerTxHash] = DonationRecord({
            hyperledgerTxHash: hyperledgerTxHash,
            donor: msg.sender,
            foodQuantityGrams: foodQuantityGrams,
            timestamp: block.timestamp,
            city: city,
            qualityApproved: qualityApproved
        });

        if (qualityApproved) {
            totalFoodKg += foodQuantityGrams / 1000;
            donorTotalKg[msg.sender] += foodQuantityGrams / 1000;
        }
        totalDonations++;
        donationIndex.push(hyperledgerTxHash);

        emit DonationRecorded(hyperledgerTxHash, msg.sender, foodQuantityGrams / 1000, city);
    }

    /**
     * @notice Issue food credit (e-RUPI voucher reference on public chain)
     */
    function issueCredit(
        bytes32 creditId,
        bytes32 beneficiaryHash,
        uint256 amountPaise
    ) external onlyOwner {
        require(credits[creditId].issuedAt == 0, "Credit already exists");
        
        credits[creditId] = CreditRecord({
            creditId: creditId,
            beneficiaryHash: beneficiaryHash,
            amountPaise: amountPaise,
            issuedAt: block.timestamp,
            redeemed: false
        });
        
        totalCreditsINR += amountPaise / 100;
        totalBeneficiaries++;
        creditIndex.push(creditId);
        
        emit CreditIssued(creditId, amountPaise, block.timestamp);
    }

    /**
     * @notice Record credit redemption at merchant
     */
    function recordRedemption(
        bytes32 creditId,
        bytes32 merchantHash,
        uint256 amountPaise
    ) external onlyOwner {
        require(credits[creditId].issuedAt != 0, "Credit not found");
        require(!credits[creditId].redeemed, "Already redeemed");
        credits[creditId].redeemed = true;
        emit CreditRedeemed(creditId, merchantHash, amountPaise);
    }

    /**
     * @notice Issue 80G tax certificate hash on public chain
     */
    function issueTaxCertificate(
        bytes32 certificateHash,
        uint256 donationValue,
        uint256 eligible80GAmount
    ) external {
        taxCerts[certificateHash] = TaxCertificate({
            certificateHash: certificateHash,
            donor: msg.sender,
            donationValue: donationValue,
            eligible80GAmount: eligible80GAmount,
            issuedAt: block.timestamp
        });
        emit TaxCertificateIssued(certificateHash, msg.sender, donationValue);
    }

    /**
     * @notice Get aggregated public impact metrics
     */
    function getImpactMetrics() external view returns (
        uint256 _totalDonations,
        uint256 _totalFoodKg,
        uint256 _totalBeneficiaries,
        uint256 _totalCreditsINR
    ) {
        return (totalDonations, totalFoodKg, totalBeneficiaries, totalCreditsINR);
    }
}
