// End-to-end demo of the credential lifecycle, printed step by step.
//   npx hardhat run scripts/demo-flow.js --network localhost|sepolia
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const hre = require("hardhat");
const { ethers } = hre;
const { setup } = require("../lib/setup");
const { didFor, issueCredential, verifyCredentialJwt, tamperJwt, makeIssuer } = require("../lib/credential");

const OUT = path.join(__dirname, "..", "out");
const VERIFY_URL = process.env.VERIFY_BASE_URL || "http://localhost:3000/verify";

function step(n, title) {
  console.log(`\n=== Step ${n}: ${title} ===`);
}
function show(result) {
  console.log(`  Result : ${result.status}`);
  console.log(`  Reason : ${result.reason}`);
  console.log(`  Time   : ${result.timingsMs.total} ms (signature ${result.timingsMs.signature} ms, chain ${result.timingsMs.chain ?? "-"} ms)`);
}
async function txSummary(ctx, label, tx) {
  const t0 = Date.now();
  const rc = await tx.wait();
  const fee = rc.gasUsed * rc.gasPrice;
  console.log(`  ${label} tx : ${rc.hash}`);
  console.log(`  Block     : ${rc.blockNumber}   Gas used: ${rc.gasUsed}   Fee: ${ethers.formatEther(fee)} ETH   Confirmed in ${Date.now() - t0} ms`);
  const link = ctx.txLink(rc.hash);
  if (link) console.log(`  Etherscan : ${link}`);
  return rc;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await setup(hre);
  const { issuer, credentialRegistry, resolver, chainId } = ctx;

  step(1, "Identities (DIDs)");
  const student = ethers.Wallet.createRandom();
  const studentDid = didFor(student.address, chainId);
  console.log(`  Issuer  DID: ${issuer.did}`);
  console.log(`  Student DID: ${studentDid}`);

  step(2, "University signs a W3C Verifiable Credential (off-chain)");
  const cred = await issueCredential(issuer, {
    studentDid,
    studentName: process.env.STUDENT_NAME || "P Siva Rama Krishna Reddy",
    rollNo: "BL.EN.U4CSE23241",
    degree: "B.Tech",
    program: "Computer Science and Engineering",
    institution: "Amrita Vishwa Vidyapeetham, Bengaluru",
    cgpa: "8.11",
    graduationYear: 2027,
  });
  console.log(`  Signed JWT length : ${cred.jwt.length} characters`);
  console.log(`  Credential hash   : ${cred.credentialHash}`);
  console.log(`  Subject hash      : ${cred.subjectHash}`);

  step(3, "Anchor the hash on Ethereum (transaction)");
  const issueRc = await txSummary(ctx, "issue()", await credentialRegistry.issue(cred.credentialHash, cred.subjectHash));

  step(4, "Student gets a QR code");
  const qrText = `${VERIFY_URL}#${cred.jwt}`;
  await QRCode.toFile(path.join(OUT, "credential-qr.png"), qrText, { errorCorrectionLevel: "L", width: 600 });
  fs.writeFileSync(path.join(OUT, "credential.jwt"), cred.jwt);
  console.log(`  QR payload: ${qrText.length} characters -> out/credential-qr.png`);

  step(5, "Verifier scans the QR - genuine credential");
  const valid = await verifyCredentialJwt(cred.jwt, { resolver, credentialRegistry });
  show(valid);

  step(6, "Attacker edits the CGPA from 8.11 to 9.90");
  const tampered = tamperJwt(cred.jwt, (p) => (p.vc.credentialSubject.cgpa = "9.90"));
  show(await verifyCredentialJwt(tampered, { resolver, credentialRegistry }));

  step(7, "Attacker signs a fake degree with their own key");
  const fakeIssuer = makeIssuer(ethers.Wallet.createRandom().privateKey, chainId);
  const fake = await issueCredential(fakeIssuer, { studentDid, studentName: "P Siva Rama Krishna Reddy", degree: "M.Tech", program: "CSE", institution: "Fake University", cgpa: "10.0", graduationYear: 2027 });
  show(await verifyCredentialJwt(fake.jwt, { resolver, credentialRegistry }));

  step(8, "University revokes the credential");
  const revokeRc = await txSummary(ctx, "revoke()", await credentialRegistry.revoke(cred.credentialHash));
  show(await verifyCredentialJwt(cred.jwt, { resolver, credentialRegistry }));

  const summary = {
    network: ctx.network,
    contracts: ctx.deployment.contracts,
    issuerDid: issuer.did,
    studentDid,
    credentialHash: cred.credentialHash,
    issueTx: issueRc.hash,
    revokeTx: revokeRc.hash,
    jwt: cred.jwt,
  };
  fs.writeFileSync(path.join(OUT, `demo-result-${ctx.network}.json`), JSON.stringify(summary, null, 2));
  console.log(`\nSaved out/demo-result-${ctx.network}.json. Next: npx hardhat run scripts/show-storage.js --network ${ctx.network}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
