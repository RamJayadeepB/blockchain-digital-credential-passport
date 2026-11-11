// Shared setup for every script: load or deploy contracts, approve the issuer,
// and build the DID resolver for the current network.
const fs = require("fs");
const path = require("path");
const { makeResolver, makeIssuer } = require("./credential");

// Hardhat's public test account #1. Only used on local networks.
const LOCAL_ISSUER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SEPOLIA_DID_REGISTRY = "0x03d5003bf0e79C5F5223588F347ebA39AfbC3818"; // ERC-1056, already deployed by uPort/Veramo

const DEPLOY_DIR = path.join(__dirname, "..", "deployments");

function explorerTx(network, hash) {
  return network === "sepolia" ? `https://sepolia.etherscan.io/tx/${hash}` : null;
}
function explorerAddress(network, addr) {
  return network === "sepolia" ? `https://sepolia.etherscan.io/address/${addr}` : null;
}

async function deployAll(hre, log = console.log) {
  const { ethers, network } = hre;
  const [admin] = await ethers.getSigners();
  const out = { network: network.name, chainId: Number((await ethers.provider.getNetwork()).chainId), admin: admin.address, deployedAt: new Date().toISOString(), contracts: {}, deployGas: {} };

  async function deploy(name, args = [], factoryOverride) {
    const factory = factoryOverride || (await ethers.getContractFactory(name));
    const c = await factory.deploy(...args);
    const receipt = await c.deploymentTransaction().wait();
    out.contracts[name] = await c.getAddress();
    out.deployGas[name] = Number(receipt.gasUsed);
    log(`  ${name.padEnd(20)} ${out.contracts[name]}  (gas ${receipt.gasUsed}, tx ${receipt.hash})`);
    const link = explorerAddress(network.name, out.contracts[name]);
    if (link) log(`  ${"".padEnd(20)} ${link}`);
    return c;
  }

  log(`Deploying to ${network.name} (chainId ${out.chainId}) from ${admin.address}`);
  const issuerRegistry = await deploy("IssuerRegistry");
  await deploy("CredentialRegistry", [await issuerRegistry.getAddress()]);

  if (network.name === "sepolia") {
    out.contracts.EthereumDIDRegistry = SEPOLIA_DID_REGISTRY;
  } else {
    // Local chains have no DID registry, so deploy the standard ERC-1056 one.
    const art = require("ethr-did-registry/artifacts/contracts/EthereumDIDRegistry.sol/EthereumDIDRegistry.json");
    await deploy("EthereumDIDRegistry", [], new ethers.ContractFactory(art.abi, art.bytecode, admin));
  }

  if (network.name !== "hardhat") {
    fs.mkdirSync(DEPLOY_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEPLOY_DIR, `${network.name}.json`), JSON.stringify(out, null, 2));
    log(`  Saved deployments/${network.name}.json`);
  }
  return out;
}

async function loadDeployment(hre) {
  const file = path.join(DEPLOY_DIR, `${hre.network.name}.json`);
  if (hre.network.name === "hardhat" || !fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const code = await hre.ethers.provider.getCode(d.contracts.CredentialRegistry);
  return code === "0x" ? null : d; // stale file (e.g. local node restarted)
}

/**
 * Everything a script needs. Deploys automatically if nothing is deployed yet.
 */
async function setup(hre, { log = console.log } = {}) {
  const { ethers, network } = hre;
  const deployment = (await loadDeployment(hre)) || (await deployAll(hre, log));
  const chainId = deployment.chainId;
  const [admin] = await ethers.getSigners();

  const issuerKey = process.env.ISSUER_PRIVATE_KEY || (network.name === "sepolia" ? process.env.DEPLOYER_PRIVATE_KEY : LOCAL_ISSUER_KEY);
  const issuerWallet = new ethers.Wallet(issuerKey, ethers.provider);
  const issuer = makeIssuer(issuerKey, chainId);

  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", deployment.contracts.IssuerRegistry, admin);
  const credentialRegistry = await ethers.getContractAt("CredentialRegistry", deployment.contracts.CredentialRegistry, issuerWallet);

  if (!(await issuerRegistry.isActiveIssuer(issuer.address))) {
    const name = process.env.ISSUER_NAME || "Amrita Vishwa Vidyapeetham, Bengaluru";
    const tx = await issuerRegistry.addIssuer(issuer.address, name, issuer.did);
    const rc = await tx.wait();
    log(`  Approved issuer ${name} (${issuer.address}) - tx ${rc.hash}`);
  }

  const resolver = makeResolver({ chainId, provider: ethers.provider, didRegistry: deployment.contracts.EthereumDIDRegistry });

  return {
    network: network.name,
    chainId,
    deployment,
    admin,
    issuer,
    issuerWallet,
    issuerRegistry,
    credentialRegistry,
    resolver,
    txLink: (h) => explorerTx(network.name, h),
    addressLink: (a) => explorerAddress(network.name, a),
  };
}

module.exports = { setup, deployAll, LOCAL_ISSUER_KEY };
