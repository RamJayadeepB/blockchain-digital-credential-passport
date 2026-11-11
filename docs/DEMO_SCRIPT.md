# Demo script (about 8 minutes)

Run on **Sepolia** so the panel sees a real public blockchain. Keep a local run (`npm run node` + `npm run demo:local`) as a backup in case Wi-Fi fails.

**Before the panel:** deploy and verify the contracts, run `npm run metrics:sepolia` once, and open these tabs:
1. Etherscan → CredentialRegistry → **Contract** tab (verified source code)
2. Etherscan → CredentialRegistry → **Read Contract** tab
3. Etherscan → CredentialRegistry → **Events** tab
4. Terminal in `blockchain/`
5. `metrics/results-sepolia.md`

| # | Show | Say |
|---|---|---|
| 1 | Etherscan Contract tab | "These are our two contracts, deployed on the Ethereum Sepolia testnet with verified source code." Point at `issue`, `revoke`, `verify`. |
| 2 | `npm run demo:sepolia`, steps 1–3 | "The university has a DID. It signs the credential off-chain, then anchors only its hash on-chain." Click the **issue tx** link: show block, gas used, fee, and **Input Data → Decode** (the credentialHash). |
| 3 | Step 4: open `out/credential-qr.png` | "The student gets a QR code that contains the signed credential." Scan it with a phone (web app). |
| 4 | Step 5 | VALID, and verification takes milliseconds. |
| 5 | Step 6 | "We change the CGPA from 8.11 to 9.90" → TAMPERED. |
| 6 | Step 7 | "An attacker signs a fake degree with their own key" → UNKNOWN_ISSUER. |
| 7 | Step 8 + revoke tx link | Revoke transaction on Etherscan → verification now says REVOKED. |
| 8 | `npm run storage:sepolia` | **Blockchain storage:** the slot formula, raw 32-byte words, decoded issuer, timestamps and subject hash. "This is everything the chain stores: 64 bytes. No name, no marks." |
| 9 | Etherscan Read Contract | Paste the credentialHash into `verify` → same values. Show `totalIssued`, `totalRevoked`. |
| 10 | Etherscan Events tab | `CredentialIssued` / `CredentialRevoked` history. |
| 11 | Metrics table | Gas, fee, confirmation time, verification time, 100% detection. |

## Backup answers
- **"Why is confirmation about 12 s on Sepolia but milliseconds locally?"** Sepolia makes a new block every 12 seconds; a local chain mines instantly.
- **"Is verification really free?"** Yes. `verify()` is a `view` call, so it sends no transaction.
