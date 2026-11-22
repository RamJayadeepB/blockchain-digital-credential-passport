// Public settings, filled in by `npm run export-env:<network>` in /blockchain.
export const config = {
  networkName: process.env.NEXT_PUBLIC_NETWORK_NAME || "localhost",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545",
  issuerRegistry: process.env.NEXT_PUBLIC_ISSUER_REGISTRY || "",
  credentialRegistry: process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY || "",
  didRegistry: process.env.NEXT_PUBLIC_DID_REGISTRY || "",
  explorer: process.env.NEXT_PUBLIC_EXPLORER || "",
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "",
};

export const txUrl = (hash) => (config.explorer ? `${config.explorer}/tx/${hash}` : null);
export const addressUrl = (addr) => (config.explorer ? `${config.explorer}/address/${addr}` : null);
