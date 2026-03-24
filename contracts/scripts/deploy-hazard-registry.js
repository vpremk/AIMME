const { ethers } = require("hardhat");

async function main() {
  const net = await ethers.provider.getNetwork();
  const signers = await ethers.getSigners();
  if (!signers || signers.length === 0) {
    throw new Error(
      "No deployer signer found. Set DEPLOYER_PRIVATE_KEY in contracts/.env (0x...) " +
        "and ensure hardhat.config.js uses it for the amoy network accounts.",
    );
  }
  const deployer = signers[0];
  if (!deployer || !deployer.address) {
    throw new Error(
      "Deployer signer is invalid. Check DEPLOYER_PRIVATE_KEY format and value in contracts/.env.",
    );
  }

  console.log(`Deploying HazardRegistry to chainId=${net.chainId}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await deployer.getBalance();
  const minWei = ethers.utils.parseEther("0.001");
  if (balance.lt(minWei)) {
    const balHuman = ethers.utils.formatEther(balance);
    throw new Error(
      `Deployer balance too low on this network (${balHuman} native token). ` +
        `Fund ${deployer.address} with Amoy MATIC (or native token for the network), ` +
        `then retry. Suggested minimum ~0.01 for deploy + buffer.`,
    );
  }

  const factory = await ethers.getContractFactory("HazardRegistry");
  const contract = await factory.deploy();
  await contract.deployed();

  const address = contract.address;
  console.log("HazardRegistry deployed.");
  console.log(`HAZARD_REGISTRY_ADDRESS=${address}`);
  console.log("");
  console.log("Copy for env setup:");
  console.log(`export HAZARD_REGISTRY_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
