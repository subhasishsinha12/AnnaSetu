/**
 * AnnaSetu — Polygon Amoy Deploy Script
 * Hardhat Ignition deployment for DonationEscrow
 * Run: npx hardhat run scripts/deploy-amoy.js --network amoy
 */

'use strict';

const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log("\n🌾 AnnaSetu — DonationEscrow Deployment");
  console.log("━".repeat(50));
  console.log(`Network: ${network.name}`);

  const [deployer, bankAdmin] = await ethers.getSigners();
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`BankAdmin:  ${bankAdmin ? bankAdmin.address : deployer.address}`);

  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:    ${ethers.formatEther(deployerBalance)} MATIC`);

  if (deployerBalance < ethers.parseEther("0.1")) {
    throw new Error("Insufficient MATIC balance. Need at least 0.1 MATIC for deployment.");
  }

  // ── Deploy DonationEscrow ─────────────────────────────────────────────────
  console.log("\n📦 Deploying DonationEscrow…");

  const adminAddr = (bankAdmin || deployer).address;
  const Factory   = await ethers.getContractFactory("DonationEscrow");

  // Estimate gas first
  const deployTx = await Factory.getDeployTransaction(adminAddr);
  const gasEstimate = await ethers.provider.estimateGas(deployTx);
  console.log(`Gas estimate: ${gasEstimate.toString()}`);

  const escrow = await Factory.deploy(adminAddr, {
    gasLimit: gasEstimate * 120n / 100n,  // 20% buffer
  });
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  const deployReceipt = await escrow.deploymentTransaction().wait(2);

  console.log(`✅ DonationEscrow deployed: ${address}`);
  console.log(`   TX Hash: ${deployReceipt.hash}`);
  console.log(`   Block:   ${deployReceipt.blockNumber}`);
  console.log(`   Gas Used:${deployReceipt.gasUsed.toString()}`);

  // ── Fund escrow with initial MATIC ───────────────────────────────────────
  console.log("\n💰 Funding escrow with 0.5 MATIC…");
  const fundTx = await deployer.sendTransaction({
    to:    address,
    value: ethers.parseEther("0.5"),
  });
  await fundTx.wait(2);
  console.log(`   Funded: ${fundTx.hash}`);

  // ── Setup initial roles ───────────────────────────────────────────────────
  console.log("\n🔐 Configuring initial roles…");

  const BANK_ROLE     = ethers.keccak256(ethers.toUtf8Bytes("BANK_ROLE"));
  const NGO_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("NGO_ROLE"));
  const MERCHANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MERCHANT_ROLE"));
  const AUDITOR_ROLE  = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));

  // Grant NGO role to demo NGO wallet
  const demoNGO = process.env.DEMO_NGO_ADDRESS;
  if (demoNGO) {
    const tx = await escrow.grantRole(NGO_ROLE, demoNGO);
    await tx.wait(2);
    console.log(`   ✓ NGO_ROLE granted to ${demoNGO}`);
  }

  // Grant merchant role to demo kirana
  const demoMerchant = process.env.DEMO_MERCHANT_ADDRESS;
  if (demoMerchant) {
    const tx = await escrow.grantRole(MERCHANT_ROLE, demoMerchant);
    await tx.wait(2);
    console.log(`   ✓ MERCHANT_ROLE granted to ${demoMerchant}`);
  }

  // ── Verify on PolygonScan ─────────────────────────────────────────────────
  if (network.name === 'amoy' || network.name === 'polygon') {
    console.log("\n🔍 Scheduling PolygonScan verification…");
    console.log("   Run after 1 min:");
    console.log(`   npx hardhat verify --network ${network.name} ${address} "${adminAddr}"`);
  }

  // ── Save deployment artifacts ─────────────────────────────────────────────
  const deployment = {
    network:       network.name,
    chainId:       (await ethers.provider.getNetwork()).chainId.toString(),
    contractName:  "DonationEscrow",
    address,
    deployer:      deployer.address,
    bankAdmin:     adminAddr,
    deployedAt:    new Date().toISOString(),
    blockNumber:   deployReceipt.blockNumber,
    txHash:        deployReceipt.hash,
    gasUsed:       deployReceipt.gasUsed.toString(),
    abi:           JSON.parse(Factory.interface.formatJson()),
    roles: {
      BANK_ROLE, NGO_ROLE, MERCHANT_ROLE, AUDITOR_ROLE,
    },
    polygonScan:   network.name === 'amoy'
      ? `https://amoy.polygonscan.com/address/${address}`
      : `https://polygonscan.com/address/${address}`,
  };

  const outDir  = path.join(__dirname, '../deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}-latest.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Deployment saved: ${outFile}`);

  // Also write to shared layer-05 config
  const sharedDir = path.join(__dirname, '../../../layer-05-erupi/contracts');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(
    path.join(sharedDir, 'escrow-deployment.json'),
    JSON.stringify({ address, abi: deployment.abi, network: network.name }, null, 2)
  );
  console.log("   Shared to layer-05-erupi");

  console.log("\n✅ Deployment complete!");
  console.log(`   Contract: ${address}`);
  console.log(`   Explorer: ${deployment.polygonScan}`);

  return deployment;
}

main().catch(err => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
