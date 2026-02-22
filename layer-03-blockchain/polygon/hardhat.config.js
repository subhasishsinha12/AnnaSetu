require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: { version: "0.8.19", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    polygon_amoy: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : [],
      chainId: 80002
    },
    polygon_mainnet: {
      url: "https://polygon-rpc.com",
      accounts: process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : [],
      chainId: 137
    }
  },
  etherscan: { apiKey: { polygon: process.env.POLYGONSCAN_API_KEY || "" } }
};
