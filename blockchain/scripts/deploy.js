// npx hardhat run scripts/deploy.js --network localhost|sepolia
const hre = require("hardhat");
const { deployAll } = require("../lib/setup");

deployAll(hre).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
