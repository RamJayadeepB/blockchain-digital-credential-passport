// Shows exactly what is stored on the blockchain for a credential, by reading
// the contract's raw storage slots and its event logs.
//   npx hardhat run scripts/show-storage.js --network localhost|sepolia
// Uses the credential from the last demo-flow run, or set CRED_HASH=0x...
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { setup } = require("../lib/setup");
const { didFor, issueCredential } = require("../lib/credential");

const coder = ethers.AbiCoder.defaultAbiCoder();

function line(label, value) {
  console.log(`  ${label.padEnd(26)} ${value}`);
}
function ts(n) {
  return n === 0n ? "0 (not set)" : `${n} (${new Date(Number(n) * 1000).toISOString()})`;
}

async function pickCredential(ctx) {
  if (process.env.CRED_HASH) return process.env.CRED_HASH;
  const file = path.join(__dirname, "..", "out", `demo-result-${ctx.network}.json`);
  if (ctx.network !== "hardhat" && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).credentialHash;

  console.log("  No earlier credential found on this network, issuing one now...");
  const student = ethers.Wallet.createRandom();
  const cred = await issueCredential(ctx.issuer, { studentDid: didFor(student.address, ctx.chainId), studentName: "Demo Student", degree: "B.Tech", program: "CSE", institution: "Amrita", cgpa: "8.5", graduationYear: 2027 });
  await (await ctx.credentialRegistry.issue(cred.credentialHash, cred.subjectHash)).wait();
  return cred.credentialHash;
}

async function main() {
  const ctx = await setup(hre);
  const provider = ethers.provider;
  const registryAddr = ctx.deployment.contracts.CredentialRegistry;
  const credHash = await pickCredential(ctx);

  console.log("\n=== Contract on-chain ===");
  line("CredentialRegistry", registryAddr);
  if (ctx.addressLink(registryAddr)) line("Etherscan", ctx.addressLink(registryAddr));
  line("Deployed bytecode size", `${(await provider.getCode(registryAddr)).length / 2 - 1} bytes`);

  console.log("\n=== Contract-level storage slots ===");
  console.log("  slot 0 = mapping credentials (values live at hashed slots, below)");
  line("slot 1 totalIssued", BigInt(await provider.getStorage(registryAddr, 1)).toString());
  line("slot 2 totalRevoked", BigInt(await provider.getStorage(registryAddr, 2)).toString());

  console.log("\n=== Where this credential is stored ===");
  line("Credential hash (key)", credHash);
  const base = BigInt(ethers.keccak256(coder.encode(["bytes32", "uint256"], [credHash, 0])));
  console.log("  Slot = keccak256(abi.encode(key, 0))  (Solidity's rule for mapping entries)");
  line("Struct slot 0", ethers.toBeHex(base, 32));
  line("Struct slot 1", ethers.toBeHex(base + 1n, 32));

  const raw0 = await provider.getStorage(registryAddr, base);
  const raw1 = await provider.getStorage(registryAddr, base + 1n);
  console.log("\n=== Raw 32-byte words read with eth_getStorageAt ===");
  line("slot 0 raw", raw0);
  line("slot 1 raw", raw1);

  // slot 0 layout (right to left): issuer [0..20) | issuedAt [20..25) | revokedAt [25..30)
  const w = BigInt(raw0);
  const issuer = ethers.getAddress(ethers.toBeHex(w & ((1n << 160n) - 1n), 20));
  const issuedAt = (w >> 160n) & ((1n << 40n) - 1n);
  const revokedAt = (w >> 200n) & ((1n << 40n) - 1n);
  console.log("\n=== Decoded ===");
  line("issuer (20 bytes)", issuer);
  line("issuedAt (5 bytes)", ts(issuedAt));
  line("revokedAt (5 bytes)", ts(revokedAt));
  line("subjectHash (32 bytes)", raw1);
  line("Status", revokedAt === 0n ? "ACTIVE" : "REVOKED");

  const v = await ctx.credentialRegistry.verify(credHash);
  line("Matches verify() call", v.issuer === issuer && v.subjectHash === raw1 ? "yes" : "NO");

  console.log("\n=== What is NOT on-chain ===");
  console.log("  Student name, roll number, CGPA and the DID itself: these stay in the signed credential (QR / database).");

  console.log("\n=== Event log for this credential ===");
  const from = Number(process.env.FROM_BLOCK || 0);
  const issued = await ctx.credentialRegistry.queryFilter(ctx.credentialRegistry.filters.CredentialIssued(credHash), from);
  const revoked = await ctx.credentialRegistry.queryFilter(ctx.credentialRegistry.filters.CredentialRevoked(credHash), from);
  for (const e of [...issued, ...revoked].sort((a, b) => a.blockNumber - b.blockNumber)) {
    console.log(`  block ${e.blockNumber}  ${e.fragment.name.padEnd(18)} tx ${e.transactionHash}`);
    if (ctx.txLink(e.transactionHash)) console.log(`  ${"".padEnd(30)}${ctx.txLink(e.transactionHash)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
