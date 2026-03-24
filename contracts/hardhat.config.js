require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const amoyRpcUrl =
  process.env.POLYGON_AMOY_RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY";
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  defaultNetwork: "hardhat",
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  networks: {
    hardhat: {},
    amoy: {
      url: amoyRpcUrl,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};
