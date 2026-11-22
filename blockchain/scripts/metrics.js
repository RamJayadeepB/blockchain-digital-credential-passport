// Collects evaluation metrics: gas, fees, confirmation time, verification latency,
// detection accuracy. Writes metrics/results-<network>.json and .md
//   RUNS=10 npx hardhat run scripts/metrics.js --network localhost|sepolia
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { setup } = require("../lib/setup");
const { STATUS, didFor, issueCredential, verifyCredentialJwt, tamperJwt, makeIssuer } = require("../lib/credential");

const RUNS = Number(process.env.RUNS || 10);
const TAMPER_CASES = Number(process.env.TAMPER_CASES || 20);

const stats = (xs, d = 2) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean: +mean.toFixed(d), min: +s[0].toFixed(d), max: +s[s.length - 1].toFixed(d), median: +s[Math.floor(s.length / 2)].toFixed(d) };
};

async function timedTx(sendPromise) {
  const t0 = performance.now();
  const tx = await sendPromise;
  const rc = await tx.wait();
  return { ms: performance.now() - t0, gas: Number(rc.gasUsed), feeEth: Number(ethers.formatEther(rc.gasUsed * rc.gasPrice)), gwei: Number(ethers.formatUnits(rc.gasPrice, "gwei")), hash: rc.hash };
}

const sample = (studentDid, i) => ({ studentDid, studentName: `Student ${i}`, rollNo: `BL.EN.U4CSE23${String(i).padStart(3, "0")}`, degree: "B.Tech", program: "Computer Science and Engineering", institution: "Amrita Vishwa Vidyapeetham, Bengaluru", cgpa: "8.50", graduationYear: 2027 });

async function main() {
  const ctx = await setup(hre);
  const { issuer, credentialRegistry, resolver, chainId } = ctx;
  const opts = { resolver, credentialRegistry };
  const m = { sign: [], issue: [], revoke: [], verifyValid: [], verifyRevoked: [], jwtBytes: [], qrChars: [] };
  const issued = [];
  const txs = [];

  console.log(`Running ${RUNS} issue/verify/revoke cycles on ${ctx.network}...`);
  for (let i = 0; i < RUNS; i++) {
    const studentDid = didFor(ethers.Wallet.createRandom().address, chainId);
    const t0 = performance.now();
    const cred = await issueCredential(issuer, sample(studentDid, i));
    m.sign.push(performance.now() - t0);
    m.jwtBytes.push(cred.jwt.length);
    m.qrChars.push(`${process.env.VERIFY_BASE_URL || "http://localhost:3000/verify"}#${cred.jwt}`.length);

    const iss = await timedTx(credentialRegistry.issue(cred.credentialHash, cred.subjectHash));
    m.issue.push(iss);
    txs.push({ action: "issue", hash: iss.hash });

    const v = await verifyCredentialJwt(cred.jwt, opts);
    if (v.status !== STATUS.VALID) throw new Error(`Expected VALID, got ${v.status}`);
    m.verifyValid.push(v.timingsMs.total);
    issued.push(cred);
    process.stdout.write(`  run ${i + 1}/${RUNS}: issue ${iss.gas} gas, ${iss.ms.toFixed(0)} ms; verify ${v.timingsMs.total} ms\n`);
  }

  // Revoke half of them
  const toRevoke = issued.slice(0, Math.max(1, Math.floor(RUNS / 2)));
  for (const cred of toRevoke) {
    const r = await timedTx(credentialRegistry.revoke(cred.credentialHash));
    m.revoke.push(r);
    txs.push({ action: "revoke", hash: r.hash });
    const v = await verifyCredentialJwt(cred.jwt, opts);
    if (v.status !== STATUS.REVOKED) throw new Error(`Expected REVOKED, got ${v.status}`);
    m.verifyRevoked.push(v.timingsMs.total);
  }

  // Detection accuracy: tampered fields, forged issuers, revoked credentials
  const edits = [
    (p) => (p.vc.credentialSubject.cgpa = "9.99"),
    (p) => (p.vc.credentialSubject.name = "Someone Else"),
    (p) => (p.vc.credentialSubject.degree = "M.Tech"),
    (p) => (p.vc.credentialSubject.graduationYear = 2020),
    (p) => (p.sub = didFor(ethers.Wallet.createRandom().address, chainId)),
  ];
  const detection = { tampered: { total: 0, detected: 0 }, forgedIssuer: { total: 0, detected: 0 }, revoked: { total: 0, detected: 0 }, genuine: { total: 0, accepted: 0 } };
  const live = issued.slice(toRevoke.length);
  for (let i = 0; i < TAMPER_CASES; i++) {
    const base = live[i % live.length] || issued[0];
    const v = await verifyCredentialJwt(tamperJwt(base.jwt, edits[i % edits.length]), opts);
    detection.tampered.total++;
    if (v.status === STATUS.TAMPERED) detection.tampered.detected++;
  }
  for (let i = 0; i < 5; i++) {
    const fake = makeIssuer(ethers.Wallet.createRandom().privateKey, chainId);
    const cred = await issueCredential(fake, sample(didFor(ethers.Wallet.createRandom().address, chainId), 900 + i));
    const v = await verifyCredentialJwt(cred.jwt, opts);
    detection.forgedIssuer.total++;
    if (v.status === STATUS.UNKNOWN_ISSUER) detection.forgedIssuer.detected++;
  }
  for (const cred of toRevoke) {
    detection.revoked.total++;
    if ((await verifyCredentialJwt(cred.jwt, opts)).status === STATUS.REVOKED) detection.revoked.detected++;
  }
  for (const cred of live) {
    detection.genuine.total++;
    if ((await verifyCredentialJwt(cred.jwt, opts)).status === STATUS.VALID) detection.genuine.accepted++;
  }

  const results = {
    network: ctx.network,
    chainId,
    date: new Date().toISOString(),
    runs: RUNS,
    deployGas: ctx.deployment.deployGas,
    issue: { gas: stats(m.issue.map((x) => x.gas)), confirmMs: stats(m.issue.map((x) => x.ms)), feeEth: stats(m.issue.map((x) => x.feeEth), 18), gasPriceGwei: stats(m.issue.map((x) => x.gwei), 12) },
    revoke: { gas: stats(m.revoke.map((x) => x.gas)), confirmMs: stats(m.revoke.map((x) => x.ms)), feeEth: stats(m.revoke.map((x) => x.feeEth), 18) },
    verify: { validMs: stats(m.verifyValid), revokedMs: stats(m.verifyRevoked), costEth: 0 },
    signMs: stats(m.sign),
    payload: { jwtChars: stats(m.jwtBytes), qrChars: stats(m.qrChars) },
    onChainBytesPerCredential: 64,
    detection,
    transactions: txs.map((t) => ({ ...t, link: ctx.txLink(t.hash) })),
  };

  const dir = path.join(__dirname, "..", "metrics");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `results-${ctx.network}.json`), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(dir, `results-${ctx.network}.md`), toMarkdown(results));
  console.log("\n" + toMarkdown(results));
  console.log(`Saved metrics/results-${ctx.network}.json and .md`);
}

function toMarkdown(r) {
  const row = (name, s, unit = "") => `| ${name} | ${s.mean}${unit} | ${s.median}${unit} | ${s.min}${unit} | ${s.max}${unit} |`;
  const pct = (a, b) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(0) : 0}%)`;
  return [
    `# Metrics - ${r.network} (chainId ${r.chainId})`,
    ``,
    `${r.runs} runs, ${r.date}`,
    ``,
    `## Gas and cost`,
    `| Operation | Gas used | Fee (ETH, mean) |`,
    `|---|---|---|`,
    ...Object.entries(r.deployGas).map(([k, v]) => `| Deploy ${k} | ${v} | - |`),
    `| issue() | ${r.issue.gas.mean} | ${r.issue.feeEth.mean} |`,
    `| revoke() | ${r.revoke.gas.mean} | ${r.revoke.feeEth.mean} |`,
    `| verify() (read-only call) | 0 | 0 |`,
    ``,
    `Mean gas price during issue(): ${r.issue.gasPriceGwei.mean} gwei. On-chain storage per credential: ${r.onChainBytesPerCredential} bytes (2 slots).`,
    ``,
    `## Time (ms)`,
    `| Metric | Mean | Median | Min | Max |`,
    `|---|---|---|---|---|`,
    row("Sign credential (off-chain)", r.signMs),
    row("issue() confirmation", r.issue.confirmMs),
    row("revoke() confirmation", r.revoke.confirmMs),
    row("Verify (valid credential)", r.verify.validMs),
    row("Verify (revoked credential)", r.verify.revokedMs),
    ``,
    `## Size`,
    `Signed credential (JWT): ${r.payload.jwtChars.mean} characters. Full QR payload: ${r.payload.qrChars.mean} characters.`,
    ``,
    `## Detection accuracy`,
    `| Case | Correct result |`,
    `|---|---|`,
    `| Genuine credentials accepted as VALID | ${pct(r.detection.genuine.accepted, r.detection.genuine.total)} |`,
    `| Tampered credentials flagged TAMPERED | ${pct(r.detection.tampered.detected, r.detection.tampered.total)} |`,
    `| Forged-issuer credentials flagged UNKNOWN_ISSUER | ${pct(r.detection.forgedIssuer.detected, r.detection.forgedIssuer.total)} |`,
    `| Revoked credentials flagged REVOKED | ${pct(r.detection.revoked.detected, r.detection.revoked.total)} |`,
    ``,
  ].join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
