const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying AnnaSetu Transparency contract to Polygon zkEVM...");
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "MATIC");

  const AnnaSetuFactory = await ethers.getContractFactory("AnnaSetuTransparency");
  const contract = await AnnaSetuFactory.deploy();
  await contract.deployed();

  console.log("✅ AnnaSetu deployed to:", contract.address);
  console.log("TX hash:", contract.deployTransaction.hash);
  
  // Save deployment info
  const fs = require("fs");
  const deployInfo = {
    network: hre.network.name,
    contractAddress: contract.address,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    txHash: contract.deployTransaction.hash
  };
  fs.writeFileSync("deployment.json", JSON.stringify(deployInfo, null, 2));
  console.log("Deployment info saved to deployment.json");
}

main().catch(err => { console.error(err); process.exit(1); });
