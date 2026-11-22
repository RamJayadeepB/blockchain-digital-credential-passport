// Browser-safe verification logic. The same code runs in the verifier page (no backend needed).
import { ethers } from "ethers";
import { decodeJWT } from "did-jwt";
import { verifyCredential } from "did-jwt-vc";
import { Resolver } from "did-resolver";
import { getResolver } from "ethr-did-resolver";
import { config } from "./config";
import { credentialRegistryAbi, issuerRegistryAbi } from "./abi";

export const STATUS = { VALID: "VALID", REVOKED: "REVOKED", TAMPERED: "TAMPERED", UNKNOWN_ISSUER: "UNKNOWN_ISSUER" };

let _provider;
export function readProvider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  return _provider;
}
export const readCredentialRegistry = () => new ethers.Contract(config.credentialRegistry, credentialRegistryAbi, readProvider());
export const readIssuerRegistry = () => new ethers.Contract(config.issuerRegistry, issuerRegistryAbi, readProvider());

export const didFor = (address) => `did:ethr:${ethers.toQuantity(config.chainId)}:${ethers.getAddress(address)}`;

export function addressFromDid(did) {
  const m = /^did:ethr:(?:[^:]+:)?(0x[0-9a-fA-F]{40})$/.exec(did || "");
  if (!m) throw new Error(`Not a did:ethr address DID: ${did}`);
  return ethers.getAddress(m[1]);
}

export const hashCredential = (jwt) => ethers.keccak256(ethers.toUtf8Bytes(jwt));
export const hashSubject = (did) => ethers.keccak256(ethers.toUtf8Bytes(did));

export function makeResolver() {
  return new Resolver(
    getResolver({ networks: [{ chainId: BigInt(config.chainId), registry: config.didRegistry, provider: readProvider() }] })
  );
}

const b64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Demo helper: edit a field of the credential without the issuer's key (signature stays the same). */
export function tamperJwt(jwt, edit) {
  const [header, , signature] = jwt.split(".");
  const { payload } = decodeJWT(jwt);
  edit(payload);
  return `${header}.${b64url(JSON.stringify(payload))}.${signature}`;
}

export async function verifyCredentialJwt(jwt) {
  const t0 = performance.now();
  const result = { status: null, reason: "", checks: {}, timingsMs: {} };
  const resolver = makeResolver();

  let verified;
  try {
    verified = await verifyCredential(jwt, resolver);
    result.checks.signature = true;
  } catch (err) {
    result.checks.signature = false;
    result.timingsMs.signature = +(performance.now() - t0).toFixed(1);
    result.timingsMs.total = result.timingsMs.signature;
    result.status = STATUS.TAMPERED;
    result.reason = `Signature check failed: ${String(err.message).split("\n")[0]}`;
    try {
      const { payload } = decodeJWT(jwt);
      result.credential = { issuer: payload.iss, subject: payload.sub, ...(payload.vc?.credentialSubject || {}) };
    } catch {}
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
    issuedAt: verified.payload.nbf ? new Date(verified.payload.nbf * 1000).toISOString() : undefined,
  };

  const credentialHash = hashCredential(jwt);
  const r = await readCredentialRegistry().verify(credentialHash);
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
    subjectHash: r.subjectHash,
  };
  result.checks.anchored = r.exists;
  result.checks.issuerApproved = r.issuerActive;
  result.checks.notRevoked = r.exists && !r.revoked;

  if (!r.exists) {
    result.status = STATUS.UNKNOWN_ISSUER;
    result.reason = "The signature is valid, but no approved issuer registered this credential on the blockchain.";
  } else if (ethers.getAddress(r.issuer) !== addressFromDid(issuerDid)) {
    result.status = STATUS.TAMPERED;
    result.reason = "The issuer recorded on-chain is not the issuer that signed this credential.";
  } else if (r.subjectHash !== hashSubject(subjectDid)) {
    result.status = STATUS.TAMPERED;
    result.reason = "The credential holder does not match the on-chain record.";
  } else if (!r.issuerActive) {
    result.status = STATUS.UNKNOWN_ISSUER;
    result.reason = "This issuer is no longer approved in the issuer registry.";
  } else if (r.revoked) {
    result.status = STATUS.REVOKED;
    result.reason = `The issuer revoked this credential on ${new Date(Number(r.revokedAt) * 1000).toLocaleString()}.`;
  } else {
    result.status = STATUS.VALID;
    result.reason = "Signature is valid, the credential is anchored on-chain by an approved issuer, and it has not been revoked.";
  }
  return result;
}

/** Read the raw storage words for a credential straight from the blockchain (eth_getStorageAt). */
export async function readRawStorage(credentialHash) {
  const provider = readProvider();
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const base = BigInt(ethers.keccak256(coder.encode(["bytes32", "uint256"], [credentialHash, 0])));
  const slot0 = await provider.getStorage(config.credentialRegistry, base);
  const slot1 = await provider.getStorage(config.credentialRegistry, base + 1n);
  const w = BigInt(slot0);
  return {
    contract: config.credentialRegistry,
    slotKeyFormula: "keccak256(abi.encode(credentialHash, 0))",
    slot0Index: ethers.toBeHex(base, 32),
    slot1Index: ethers.toBeHex(base + 1n, 32),
    slot0, slot1,
    issuer: ethers.getAddress(ethers.toBeHex(w & ((1n << 160n) - 1n), 20)),
    issuedAt: Number((w >> 160n) & ((1n << 40n) - 1n)),
    revokedAt: Number((w >> 200n) & ((1n << 40n) - 1n)),
    subjectHash: slot1,
  };
}

export async function getIssuerInfo(address) {
  try {
    const i = await readIssuerRegistry().getIssuer(address);
    return { name: i.name, did: i.did, active: i.active };
  } catch {
    return null;
  }
}

export const fmtTime = (unix) => (unix ? new Date(unix * 1000).toLocaleString() : "-");
