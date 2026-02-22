require("@nomicfoundation/hardhat-toolbox");

const POLYGON_PRIVATE_KEY = process.env.POLYGON_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat default key, safe for CI

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    hardhat: {},
    amoy: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: [POLYGON_PRIVATE_KEY],
      chainId: 80002
    }
  }
};
