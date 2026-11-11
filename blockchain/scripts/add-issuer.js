// Admin approves another institution as an issuer.
//   ISSUER_ADDRESS=0x... ISSUER_NAME="XYZ University" npx hardhat run scripts/add-issuer.js --network localhost|sepolia
const hre = require("hardhat");
const { setup } = require("../lib/setup");
const { didFor } = require("../lib/credential");

async function main() {
  const { ISSUER_ADDRESS, ISSUER_NAME } = process.env;
  if (!ISSUER_ADDRESS || !ISSUER_NAME) throw new Error("Set ISSUER_ADDRESS and ISSUER_NAME");
  const ctx = await setup(hre);
  const did = didFor(ISSUER_ADDRESS, ctx.chainId);
  const rc = await (await ctx.issuerRegistry.addIssuer(ISSUER_ADDRESS, ISSUER_NAME, did)).wait();
  console.log(`Approved ${ISSUER_NAME} (${did}) in tx ${rc.hash}`);
  if (ctx.txLink(rc.hash)) console.log(ctx.txLink(rc.hash));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
