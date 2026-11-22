import { ethers } from "ethers";

// Reads the wallet sign-in header and returns the checksummed address, or null.
export function readAuth(request) {
  const raw = request.headers.get("x-wallet-auth");
  if (!raw) return null;
  try {
    const { address, message, signature } = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (ethers.verifyMessage(message, signature).toLowerCase() !== String(address).toLowerCase()) return null;
    if (!message.includes(`Address: ${address}`)) return null;
    const issued = Date.parse(/Issued: (.+)$/.exec(message)?.[1] || "");
    if (!issued || Math.abs(Date.now() - issued) > 15 * 60 * 1000) return null;
    return ethers.getAddress(address);
  } catch {
    return null;
  }
}

export function issuerWallet() {
  const key = process.env.ISSUER_PRIVATE_KEY;
  if (!key) throw new Error("ISSUER_PRIVATE_KEY is not set in web/.env.local");
  return new ethers.Wallet(key);
}
