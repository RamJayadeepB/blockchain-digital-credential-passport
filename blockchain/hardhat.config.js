require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ quiet: true });

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

// Optional: compile with the bundled solc-js instead of downloading the native
// compiler (useful on restricted networks). Enable with USE_SOLCJS=1.
if (process.env.USE_SOLCJS === "1") {
  const { subtask } = require("hardhat/config");
  const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
    if (args.solcVersion === "0.8.24") {
      return {
        compilerPath: require.resolve("solc/soljson.js"),
        isSolcJs: true,
        version: args.solcVersion,
        longVersion: require("solc/package.json").version,
      };
    }
    return runSuper();
  });
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    ...(SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [DEPLOYER_PRIVATE_KEY], chainId: 11155111 } }
      : {}),
  },
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "1",
    currency: "USD",
    outputFile: process.env.GAS_REPORT_FILE || undefined,
    noColors: !!process.env.GAS_REPORT_FILE,
  },
};
