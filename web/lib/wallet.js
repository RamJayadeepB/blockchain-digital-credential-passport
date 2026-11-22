"use client";
// MetaMask helpers (browser only).
import { ethers } from "ethers";
import { config } from "./config";
import { credentialRegistryAbi } from "./abi";

export async function connectWallet() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet found. Install MetaMask and reload this page.");
  }
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const hexChain = ethers.toQuantity(config.chainId);
  let current = await window.ethereum.request({ method: "eth_chainId" });
  if (current !== hexChain) {
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
    } catch (err) {
      if (err.code === 4902 || /unrecognized|not added/i.test(err.message || "")) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hexChain, chainName: `${config.networkName} (${config.chainId})`, rpcUrls: [config.rpcUrl], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } }],
        });
      } else {
        throw err;
      }
    }
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export const writeCredentialRegistry = (signer) => new ethers.Contract(config.credentialRegistry, credentialRegistryAbi, signer);

// Sign-in = sign a short text message with the wallet (free, no transaction).
export async function getAuthHeader(signer) {
  const address = await signer.getAddress();
  const key = `cp-auth-${address}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || "null");
    if (cached && Date.now() - cached.t < 10 * 60 * 1000) return cached.h;
  } catch {}
  const message = `Credential Passport sign-in\nAddress: ${address}\nIssued: ${new Date().toISOString()}`;
  const signature = await signer.signMessage(message);
  const h = btoa(JSON.stringify({ address, message, signature }));
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), h })); } catch {}
  return h;
}

export const qrBase = () => (config.baseUrl || window.location.origin).replace(/\/$/, "");
export const verifyLink = (jwt) => `${qrBase()}/verify#${jwt}`;
