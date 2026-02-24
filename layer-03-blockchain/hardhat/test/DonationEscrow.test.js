/**
 * AnnaSetu — Hardhat Test Suite: DonationEscrow.sol
 * Comprehensive tests for all contract functions
 * Run: npx hardhat test
 */

const { expect }         = require("chai");
const { ethers }         = require("hardhat");
const { time }           = require("@nomicfoundation/hardhat-network-helpers");

const BANK_ROLE     = ethers.keccak256(ethers.toUtf8Bytes("BANK_ROLE"));
const NGO_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("NGO_ROLE"));
const DONOR_ROLE    = ethers.keccak256(ethers.toUtf8Bytes("DONOR_ROLE"));
const MERCHANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MERCHANT_ROLE"));

const PAISE = (inr) => BigInt(inr) * 100n;   // helper: INR → paise

describe("DonationEscrow", function () {
  let escrow;
  let bankAdmin, donor, beneficiary, merchant, ngo, auditor, attacker;

  const LOT_ID    = "LOT-20250222-abc123";
  const DONOR_PAN = "ABCDE1234F";

  beforeEach(async function () {
    [bankAdmin, donor, beneficiary, merchant, ngo, auditor, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("DonationEscrow");
    escrow = await Factory.connect(bankAdmin).deploy(bankAdmin.address);
    await escrow.waitForDeployment();

    // Fund escrow for settlement tests
    await bankAdmin.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("10") });

    // Register merchant
    await escrow.connect(bankAdmin).grantRole(MERCHANT_ROLE, merchant.address);
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("Should set bank admin correctly", async function () {
      expect(await escrow.hasRole(BANK_ROLE, bankAdmin.address)).to.be.true;
    });

    it("Should start with zero escrow balance", async function () {
      expect(await escrow.getEscrowBalance()).to.equal(0n);
    });

    it("Should have correct default TTL (90 days)", async function () {
      expect(await escrow.voucherDefaultTTL()).to.equal(90n * 24n * 3600n);
    });
  });

  // ── Access Control ─────────────────────────────────────────────────────────

  describe("Access Control", function () {
    it("Should prevent non-bank from issuing vouchers", async function () {
      await expect(
        escrow.connect(attacker).issueVoucher(
          beneficiary.address, merchant.address, PAISE(100),
          LOT_ID, DONOR_PAN, true
        )
      ).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("Should prevent unregistered merchant voucher issuance", async function () {
      await expect(
        escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, attacker.address, PAISE(100),
          LOT_ID, DONOR_PAN, true
        )
      ).to.be.revertedWith("Merchant not registered");
    });

    it("Should prevent non-bank from settling merchants", async function () {
      await expect(
        escrow.connect(attacker).settleMerchant(merchant.address)
      ).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });
  });

  // ── Voucher Issuance ──────────────────────────────────────────────────────

  describe("Voucher Issuance", function () {
    it("Should issue a voucher with correct fields", async function () {
      const tx = await escrow.connect(bankAdmin).issueVoucher(
        beneficiary.address, merchant.address, PAISE(500),
        LOT_ID, DONOR_PAN, true
      );
      const receipt = await tx.wait();

      const event = receipt.logs.find(l => l.fragment?.name === "VoucherIssued");
      expect(event).to.not.be.undefined;

      const voucherId = event.args[0];
      const v = await escrow.getVoucher(voucherId);

      expect(v.beneficiary).to.equal(beneficiary.address);
      expect(v.merchant).to.equal(merchant.address);
      expect(v.faceValue).to.equal(PAISE(500));
      expect(v.lotId).to.equal(LOT_ID);
      expect(v.donorPan).to.equal(DONOR_PAN);
      expect(v.isVegetarian).to.be.true;
      expect(v.status).to.equal(0); // Active
    });

    it("Should increase escrow balance on issuance", async function () {
      await escrow.connect(bankAdmin).issueVoucher(
        beneficiary.address, merchant.address, PAISE(1000),
        LOT_ID, DONOR_PAN, false
      );
      expect(await escrow.getEscrowBalance()).to.equal(PAISE(1000));
    });

    it("Should track multiple vouchers for same beneficiary", async function () {
      for (let i = 0; i < 3; i++) {
        await time.increase(1); // ensure unique timestamps
        await escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, merchant.address, PAISE(100),
          LOT_ID + i, DONOR_PAN, true
        );
      }
      const vouchers = await escrow.getBeneficiaryVouchers(beneficiary.address);
      expect(vouchers.length).to.equal(3);
    });

    it("Should revert on zero value voucher", async function () {
      await expect(
        escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, merchant.address, 0n,
          LOT_ID, DONOR_PAN, true
        )
      ).to.be.revertedWith("Value must be > 0");
    });

    it("Should revert on zero address beneficiary", async function () {
      await expect(
        escrow.connect(bankAdmin).issueVoucher(
          ethers.ZeroAddress, merchant.address, PAISE(100),
          LOT_ID, DONOR_PAN, true
        )
      ).to.be.revertedWith("Invalid beneficiary");
    });
  });

  // ── Voucher Redemption ────────────────────────────────────────────────────

  describe("Voucher Redemption", function () {
    let voucherId;

    beforeEach(async function () {
      const tx = await escrow.connect(bankAdmin).issueVoucher(
        beneficiary.address, merchant.address, PAISE(250),
        LOT_ID, DONOR_PAN, true
      );
      const receipt = await tx.wait();
      const event   = receipt.logs.find(l => l.fragment?.name === "VoucherIssued");
      voucherId     = event.args[0];
    });

    it("Should allow beneficiary to redeem their voucher", async function () {
      await expect(
        escrow.connect(beneficiary).redeemVoucher(voucherId)
      ).to.emit(escrow, "VoucherRedeemed")
        .withArgs(voucherId, beneficiary.address, merchant.address, PAISE(250));

      const v = await escrow.getVoucher(voucherId);
      expect(v.status).to.equal(1); // Redeemed
    });

    it("Should update merchant pending settlement on redemption", async function () {
      await escrow.connect(beneficiary).redeemVoucher(voucherId);
      const ms = await escrow.merchantSettlements(merchant.address);
      expect(ms.pendingAmount).to.equal(PAISE(250));
      expect(ms.totalRedeemed).to.equal(PAISE(250));
    });

    it("Should decrease escrow balance on redemption", async function () {
      await escrow.connect(beneficiary).redeemVoucher(voucherId);
      expect(await escrow.getEscrowBalance()).to.equal(0n);
    });

    it("Should prevent non-owner from redeeming", async function () {
      await expect(
        escrow.connect(attacker).redeemVoucher(voucherId)
      ).to.be.revertedWith("Not voucher owner");
    });

    it("Should prevent double redemption", async function () {
      await escrow.connect(beneficiary).redeemVoucher(voucherId);
      await expect(
        escrow.connect(beneficiary).redeemVoucher(voucherId)
      ).to.be.revertedWith("Voucher not active");
    });

    it("Should prevent redemption after expiry", async function () {
      await time.increase(91 * 24 * 3600); // 91 days
      await expect(
        escrow.connect(beneficiary).redeemVoucher(voucherId)
      ).to.be.revertedWith("Voucher expired");
    });
  });

  // ── Merchant Settlement ───────────────────────────────────────────────────

  describe("Merchant Settlement", function () {
    it("Should settle pending amount to merchant", async function () {
      const tx = await escrow.connect(bankAdmin).issueVoucher(
        beneficiary.address, merchant.address, PAISE(10000),
        LOT_ID, DONOR_PAN, false
      );
      const receipt = await tx.wait();
      const vid     = receipt.logs.find(l => l.fragment?.name === "VoucherIssued").args[0];
      await escrow.connect(beneficiary).redeemVoucher(vid);

      const merchantBalBefore = await ethers.provider.getBalance(merchant.address);
      await expect(
        escrow.connect(bankAdmin).settleMerchant(merchant.address)
      ).to.emit(escrow, "MerchantSettled");

      const ms = await escrow.merchantSettlements(merchant.address);
      expect(ms.pendingAmount).to.equal(0n);
      expect(ms.settledAmount).to.equal(PAISE(10000));
    });

    it("Should revert if nothing to settle", async function () {
      await expect(
        escrow.connect(bankAdmin).settleMerchant(merchant.address)
      ).to.be.revertedWith("Nothing to settle");
    });
  });

  // ── Expiry & Cancellation ─────────────────────────────────────────────────

  describe("Expiry & Cancellation", function () {
    it("Should batch expire stale vouchers", async function () {
      const voucherIds = [];
      for (let i = 0; i < 3; i++) {
        await time.increase(1);
        const tx = await escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, merchant.address, PAISE(100),
          LOT_ID + i, DONOR_PAN, true
        );
        const r = await tx.wait();
        voucherIds.push(r.logs.find(l => l.fragment?.name === "VoucherIssued").args[0]);
      }
      await time.increase(91 * 24 * 3600); // expire all
      await escrow.connect(bankAdmin).batchExpireVouchers(voucherIds);

      for (const vid of voucherIds) {
        const v = await escrow.getVoucher(vid);
        expect(v.status).to.equal(2); // Expired
      }
    });

    it("Should allow bank to cancel a voucher", async function () {
      const tx = await escrow.connect(bankAdmin).issueVoucher(
        beneficiary.address, merchant.address, PAISE(200),
        LOT_ID, DONOR_PAN, true
      );
      const r   = await tx.wait();
      const vid = r.logs.find(l => l.fragment?.name === "VoucherIssued").args[0];

      await expect(
        escrow.connect(bankAdmin).cancelVoucher(vid, "Lot recalled by donor")
      ).to.emit(escrow, "VoucherCancelled").withArgs(vid, "Lot recalled by donor");

      const v = await escrow.getVoucher(vid);
      expect(v.status).to.equal(3); // Cancelled
    });
  });

  // ── Donor Credit Tracking ─────────────────────────────────────────────────

  describe("Donor Credit Tracking", function () {
    it("Should record donor credit for 80G purposes", async function () {
      await expect(
        escrow.connect(bankAdmin).recordDonorCredit(donor.address, DONOR_PAN, PAISE(50000))
      ).to.emit(escrow, "DonorCreditRecorded")
        .withArgs(donor.address, DONOR_PAN, PAISE(50000));

      const dc = await escrow.donorCredits(donor.address);
      expect(dc.pan).to.equal(DONOR_PAN);
      expect(dc.totalValuePaise).to.equal(PAISE(50000));
      expect(dc.vouchersIssued).to.equal(1n);
    });

    it("Should accumulate credits across multiple donations", async function () {
      await escrow.connect(bankAdmin).recordDonorCredit(donor.address, DONOR_PAN, PAISE(10000));
      await escrow.connect(bankAdmin).recordDonorCredit(donor.address, DONOR_PAN, PAISE(20000));
      const dc = await escrow.donorCredits(donor.address);
      expect(dc.totalValuePaise).to.equal(PAISE(30000));
      expect(dc.vouchersIssued).to.equal(2n);
    });
  });

  // ── Pause / Emergency ─────────────────────────────────────────────────────

  describe("Emergency Controls", function () {
    it("Should pause and prevent voucher issuance", async function () {
      await escrow.connect(bankAdmin).pause();
      await expect(
        escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, merchant.address, PAISE(100),
          LOT_ID, DONOR_PAN, true
        )
      ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });

    it("Should unpause and resume normal operation", async function () {
      await escrow.connect(bankAdmin).pause();
      await escrow.connect(bankAdmin).unpause();
      await expect(
        escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, merchant.address, PAISE(100),
          LOT_ID, DONOR_PAN, true
        )
      ).to.emit(escrow, "VoucherIssued");
    });
  });

  // ── Integration Flow ──────────────────────────────────────────────────────

  describe("Full Donation → Voucher → Redemption → Settlement Flow", function () {
    it("Should complete end-to-end happy path", async function () {
      // 1. Record donor credit
      await escrow.connect(bankAdmin).recordDonorCredit(donor.address, DONOR_PAN, PAISE(5000));

      // 2. Issue 5 vouchers of ₹100 each
      const voucherIds = [];
      for (let i = 0; i < 5; i++) {
        await time.increase(1);
        const tx = await escrow.connect(bankAdmin).issueVoucher(
          beneficiary.address, merchant.address, PAISE(100),
          LOT_ID, DONOR_PAN, true
        );
        const r = await tx.wait();
        voucherIds.push(r.logs.find(l => l.fragment?.name === "VoucherIssued").args[0]);
      }
      expect(await escrow.getEscrowBalance()).to.equal(PAISE(500));

      // 3. Beneficiary redeems 3 vouchers
      for (let i = 0; i < 3; i++) {
        await escrow.connect(beneficiary).redeemVoucher(voucherIds[i]);
      }

      // 4. Check escrow balance
      expect(await escrow.getEscrowBalance()).to.equal(PAISE(200));

      // 5. Bank settles merchant
      await escrow.connect(bankAdmin).settleMerchant(merchant.address);
      const ms = await escrow.merchantSettlements(merchant.address);
      expect(ms.settledAmount).to.equal(PAISE(300));
      expect(ms.pendingAmount).to.equal(0n);

      // 6. Expire remaining vouchers
      await time.increase(91 * 24 * 3600);
      await escrow.connect(bankAdmin).batchExpireVouchers([voucherIds[3], voucherIds[4]]);

      expect(await escrow.getEscrowBalance()).to.equal(0n);

      console.log("✅ Full E2E flow passed: Issue → Redeem → Settle → Expire");
    });
  });
});
