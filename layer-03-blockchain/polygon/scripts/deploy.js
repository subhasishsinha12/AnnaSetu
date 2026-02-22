/**
 * AnnaSetu Contract Deployment Script
 * Deploys AnnaSetu.sol to Polygon Amoy Testnet
 * Run: npx hardhat run scripts/deploy.js --network amoy
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AnnaSetu contract with:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC");

  const AnnaSetu = await ethers.getContractFactory("AnnaSetu");
  const contract = await AnnaSetu.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AnnaSetu deployed to:", address);
  console.log("Update ANNASETU_CONTRACT_ADDRESS in .env with:", address);
  console.log("Verify on Amoy: https://amoy.polygonscan.com/address/" + address);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
