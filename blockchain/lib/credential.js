// Off-chain half of the system: DIDs, signed W3C Verifiable Credentials (JWT),
// hashing for the on-chain anchor, and the 4-state verification logic.
const { ethers } = require("ethers");
const { ES256KSigner, decodeJWT } = require("did-jwt");
const { createVerifiableCredentialJwt, verifyCredential } = require("did-jwt-vc");
const { Resolver } = require("did-resolver");
const { getResolver } = require("ethr-did-resolver");

const STATUS = {
  VALID: "VALID",
  REVOKED: "REVOKED",
  TAMPERED: "TAMPERED",
  UNKNOWN_ISSUER: "UNKNOWN_ISSUER",
};

/** did:ethr:<chainId hex>:<address>  e.g. did:ethr:0xaa36a7:0xAbc... on Sepolia */
function didFor(address, chainId) {
  return `did:ethr:${ethers.toQuantity(chainId)}:${ethers.getAddress(address)}`;
}

function addressFromDid(did) {
  const m = /^did:ethr:(?:[^:]+:)?(0x[0-9a-fA-F]{40})$/.exec(did);
  if (!m) throw new Error(`Not a did:ethr address DID: ${did}`);
  return ethers.getAddress(m[1]);
}

/** A DID resolver that reads the ERC-1056 DID registry on the given chain. */
function makeResolver({ chainId, rpcUrl, provider, didRegistry }) {
  const net = { chainId: BigInt(chainId), registry: didRegistry };
  if (provider) net.provider = provider;
  else net.rpcUrl = rpcUrl;
  return new Resolver(getResolver({ networks: [net] }));
}

/** Build the issuer object did-jwt-vc needs, from a wallet private key. */
function makeIssuer(privateKey, chainId) {
  const wallet = new ethers.Wallet(privateKey);
  return {
    did: didFor(wallet.address, chainId),
    signer: ES256KSigner(ethers.getBytes(privateKey)),
    alg: "ES256K",
    address: wallet.address,
  };
}

/**
 * Create and sign an academic credential.
 * Returns the JWT (this is what goes into the QR code) and the hashes for the chain.
 */
async function issueCredential(issuer, { studentDid, studentName, rollNo, degree, program, institution, cgpa, graduationYear }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: studentDid,
    nbf: now,
    jti: `urn:uuid:${crypto.randomUUID()}`,
    vc: {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", "AcademicCredential"],
      credentialSubject: { name: studentName, rollNo, degree, program, institution, cgpa, graduationYear },
    },
  };
  const jwt = await createVerifiableCredentialJwt(payload, issuer);
  return { jwt, credentialHash: hashCredential(jwt), subjectHash: hashSubject(studentDid) };
}

/** keccak256 of the full signed JWT: any change to any byte changes this hash. */
function hashCredential(jwt) {
  return ethers.keccak256(ethers.toUtf8Bytes(jwt));
}

/** keccak256 of the student DID, so the chain never sees the DID itself. */
function hashSubject(did) {
  return ethers.keccak256(ethers.toUtf8Bytes(did));
}

/**
 * Verify a credential JWT.
 *  1. Check the issuer's signature against its DID document (off-chain, cryptographic).
 *  2. Look up the credential hash in CredentialRegistry (on-chain, free read).
 *  3. Return one of VALID / REVOKED / TAMPERED / UNKNOWN_ISSUER with reasons and timings.
 */
async function verifyCredentialJwt(jwt, { resolver, credentialRegistry }) {
  const t0 = performance.now();
  const result = { status: null, reason: "", checks: {}, timingsMs: {} };

  // Step 1: signature
  let verified;
  try {
    verified = await verifyCredential(jwt, resolver);
    result.checks.signature = true;
  } catch (err) {
    result.checks.signature = false;
    result.timingsMs.signature = +(performance.now() - t0).toFixed(1);
    result.timingsMs.total = result.timingsMs.signature;
    result.status = STATUS.TAMPERED;
    result.reason = `Signature check failed: ${err.message.split("\n")[0]}`;
    return result;
  }
  const t1 = performance.now();
  result.timingsMs.signature = +(t1 - t0).toFixed(1);

  const issuerDid = verified.issuer;
  const subjectDid = verified.payload.sub;
  result.credential = {
    issuer: issuerDid,
    subject: subjectDid,
    ...verified.verifiableCredential.credentialSubject,
    issuedAt: new Date(verified.payload.nbf * 1000).toISOString(),
  };

  // Step 2: on-chain lookup
  const credentialHash = hashCredential(jwt);
  const r = await credentialRegistry.verify(credentialHash);
  result.timingsMs.chain = +(performance.now() - t1).toFixed(1);
  result.timingsMs.total = +(performance.now() - t0).toFixed(1);
  result.credentialHash = credentialHash;
  result.onChain = {
    exists: r.exists,
    issuer: r.issuer,
    issuedAt: Number(r.issuedAt),
    revoked: r.revoked,
    revokedAt: Number(r.revokedAt),
    issuerActive: r.issuerActive,
  };
  result.checks.anchored = r.exists;
  result.checks.issuerApproved = r.issuerActive;
  result.checks.notRevoked = !r.revoked;

  // Step 3: decide
  if (!r.exists) {
    result.status = STATUS.UNKNOWN_ISSUER;
    result.reason = "Signature is valid, but no approved issuer registered this credential on-chain.";
  } else if (ethers.getAddress(r.issuer) !== addressFromDid(issuerDid)) {
    result.status = STATUS.TAMPERED;
    result.reason = "The on-chain issuer does not match the issuer that signed the credential.";
  } else if (r.subjectHash !== hashSubject(subjectDid)) {
    result.status = STATUS.TAMPERED;
    result.reason = "The credential subject does not match the on-chain record.";
  } else if (!r.issuerActive) {
    result.status = STATUS.UNKNOWN_ISSUER;
    result.reason = "The issuer is no longer approved in IssuerRegistry.";
  } else if (r.revoked) {
    result.status = STATUS.REVOKED;
    result.reason = `Revoked by the issuer at ${new Date(Number(r.revokedAt) * 1000).toISOString()}.`;
  } else {
    result.status = STATUS.VALID;
    result.reason = "Signature valid, anchored on-chain by an approved issuer, not revoked.";
  }
  return result;
}

/** Simulate an attacker editing a field in the JWT payload without the issuer's key. */
function tamperJwt(jwt, edit) {
  const [header, , signature] = jwt.split(".");
  const { payload } = decodeJWT(jwt);
  edit(payload);
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${signature}`;
}

module.exports = {
  STATUS,
  didFor,
  addressFromDid,
  makeResolver,
  makeIssuer,
  issueCredential,
  hashCredential,
  hashSubject,
  verifyCredentialJwt,
  tamperJwt,
};
