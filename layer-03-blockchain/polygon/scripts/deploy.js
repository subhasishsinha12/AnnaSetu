/**
 * AnnaSetu Contract Deploy Script
 * Run: npx hardhat run scripts/deploy.js --network amoy
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const AnnaSetu = await ethers.getContractFactory("AnnaSetu");
  const contract = await AnnaSetu.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AnnaSetu deployed to:", address);
  console.log("Set ANNASETU_CONTRACT_ADDRESS=" + address + " in .env");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
