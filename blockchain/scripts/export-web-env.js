// Writes ../web/.env.local from deployments/<network>.json so the website points at your contracts.
//   npm run export-env:local   |   npm run export-env:sepolia
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config({ quiet: true });
const { LOCAL_ISSUER_KEY } = require("../lib/setup");

const SEPOLIA_DID_REGISTRY = "0x03d5003bf0e79C5F5223588F347ebA39AfbC3818";

const net = hre.network.name;
const file = path.join(__dirname, "..", "deployments", `${net}.json`);
if (!fs.existsSync(file)) throw new Error(`Run the deploy first (deployments/${net}.json not found).`);
const d = JSON.parse(fs.readFileSync(file, "utf8"));

const isSepolia = net === "sepolia";
const rpc = process.env.WEB_RPC_URL || (isSepolia ? process.env.SEPOLIA_RPC_URL : "http://127.0.0.1:8545");
let issuerKey = isSepolia ? process.env.ISSUER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY : LOCAL_ISSUER_KEY;
if (!rpc || !issuerKey) throw new Error("Missing SEPOLIA_RPC_URL / DEPLOYER_PRIVATE_KEY in blockchain/.env");
if (!issuerKey.startsWith("0x")) issuerKey = "0x" + issuerKey;

const lines = [
  `NEXT_PUBLIC_NETWORK_NAME=${net}`,
  `NEXT_PUBLIC_CHAIN_ID=${d.chainId}`,
  `NEXT_PUBLIC_RPC_URL=${rpc}`,
  `NEXT_PUBLIC_ISSUER_REGISTRY=${d.contracts.IssuerRegistry}`,
  `NEXT_PUBLIC_CREDENTIAL_REGISTRY=${d.contracts.CredentialRegistry}`,
  `NEXT_PUBLIC_DID_REGISTRY=${d.contracts.EthereumDIDRegistry || SEPOLIA_DID_REGISTRY}`,
  `NEXT_PUBLIC_EXPLORER=${isSepolia ? "https://sepolia.etherscan.io" : ""}`,
  `NEXT_PUBLIC_BASE_URL=${process.env.WEB_BASE_URL || ""}`,
  `ISSUER_PRIVATE_KEY=${issuerKey}`,
  "",
];
const out = path.join(__dirname, "..", "..", "web", ".env.local");
fs.writeFileSync(out, lines.join("\n"));
console.log(`Wrote web/.env.local for ${net}. Start the site with: cd ../web && npm run dev`);
