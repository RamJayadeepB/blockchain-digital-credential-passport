# Digital Credential Passport

Blockchain-based academic credentials using **DIDs**, **W3C Verifiable Credentials** and **QR verification**.

A university signs a credential and records its fingerprint (hash) on Ethereum. The student holds the signed credential as a QR code. An employer scans the QR and learns in milliseconds whether it is **VALID**, **REVOKED**, **TAMPERED** or from an **UNKNOWN ISSUER**. No personal data is stored on-chain.

## How it works

```
 University (issuer)                    Ethereum (Sepolia)                     Employer (verifier)
 ───────────────────                    ──────────────────                     ───────────────────
 1. Build credential JSON
 2. Sign it with its DID key  ──JWT──►  3. issue(hash, subjectHash)
                                           stored: issuer, time, status
          │                                       ▲
          ▼                                       │ 6. verify(hash)  (free read)
 4. Student gets QR = verify URL + JWT ───scan──► 5. Check signature against issuer DID
                                                  7. Show VALID / REVOKED / TAMPERED / UNKNOWN_ISSUER
```

| Part | What it does |
|---|---|
| `IssuerRegistry.sol` | Admin's list of approved universities |
| `CredentialRegistry.sol` | Stores credential hash → issuer, issue time, revoke time, student-DID hash |
| `EthereumDIDRegistry` (ERC-1056) | Standard registry behind `did:ethr` identifiers (already on Sepolia) |
| `lib/credential.js` | Creates DIDs, signs credentials (JWT), hashes them, runs the verification logic |

## Tools

| Tool | Role |
|---|---|
| Solidity 0.8.24 + Hardhat | Smart contracts, tests, deployment |
| Ethereum Sepolia testnet | Public blockchain for the demo |
| MetaMask | Wallet that signs transactions (web app) |
| Etherscan | Shows transactions, contract storage and events |
| did-jwt, did-jwt-vc, ethr-did-resolver | `did:ethr` identities and W3C Verifiable Credentials |
| ethers.js v6 | Talks to the blockchain |
| qrcode | QR generation |
| hardhat-gas-reporter, solidity-coverage | Metrics |

## Quick start (local blockchain)

```bash
cd blockchain
npm install
npm test                  # 14 tests
npm run coverage          # 100% lines
npm run node              # terminal 1: local blockchain on :8545
npm run deploy:local      # terminal 2
npm run demo:local        # full lifecycle: issue -> verify -> tamper -> fake issuer -> revoke
npm run storage:local     # raw on-chain storage of the credential
npm run metrics:local     # writes metrics/results-localhost.md
```

## Sepolia (for the real demo)

1. Create a **test-only** MetaMask account and get Sepolia ETH from a faucet (Google Cloud Web3 faucet or Alchemy faucet).
2. Get an RPC URL from Alchemy or Infura, and an Etherscan API key.
3. `cp .env.example .env` and fill it in.
4. Run:
   ```bash
   npm run deploy:sepolia
   npx hardhat verify --network sepolia <IssuerRegistry address>
   npx hardhat verify --network sepolia <CredentialRegistry address> <IssuerRegistry address>
   npm run demo:sepolia
   npm run storage:sepolia
   npm run metrics:sepolia
   ```
   Every transaction prints an Etherscan link. After `verify`, Etherscan shows the source code and the **Read Contract** tab.

## Web app (issuer portal, student passport, verifier)

Local chain (needs 3 terminals):

```bash
cd blockchain
npm run node                 # terminal 1 (leave running)
npm run deploy:local         # terminal 2
npm run export-env:local     # writes web/.env.local (contains the issuer key, never commit)
cd ../web
npm install
npm run build && npm start   # http://localhost:3000
```

MetaMask for the local chain: add network RPC `http://127.0.0.1:8545`, chain ID `31337`. Import Hardhat account #1 (private key is printed by `npm run node`; it is a public test key) as the university, and any other account as the student.

Sepolia: after `npm run deploy:sepolia` run `npm run export-env:sepolia`, then rebuild the web app.

Pages: `/issuer` (sign + record on-chain, revoke), `/passport` (student signs in with wallet, sees QR), `/verify` (scan, upload or paste; shows checks, on-chain record and raw storage; has a tamper demo button).

Notes: a phone can only scan-and-open the QR if the site is reachable from it, so set `NEXT_PUBLIC_BASE_URL` to your LAN IP or deployed URL. Credentials are kept in `web/data/credentials.json` (swap for Postgres in production; it will not persist on Vercel). Do not run `next dev` and `next start` from the same folder at the same time.

## Metrics we report

Gas and fee for deploy / issue / revoke, transaction confirmation time, verification time, QR payload size, on-chain bytes per credential, and detection accuracy (genuine, tampered, forged issuer, revoked). See `blockchain/metrics/`.

## Security notes

- **Privacy:** only hashes go on-chain. The student's name, marks and DID stay off-chain (DPDP Act friendly).
- **Tampering:** changing any field breaks the issuer's signature and the hash, so it is detected.
- **Fake issuers:** anyone can sign a credential, but only wallets approved in `IssuerRegistry` can anchor one.
- **Revocation:** only the original issuer can revoke; the time is recorded on-chain.
- **Limits (prototype):** testnet only; issuer key loss/rotation and student key recovery are not handled.

## Repo layout

```
blockchain/
  contracts/      IssuerRegistry.sol, CredentialRegistry.sol
  test/           contract tests
  lib/            credential.js (DID + VC + verification), setup.js
  scripts/        deploy, demo-flow, show-storage, metrics, add-issuer
  deployments/    contract addresses per network
  metrics/        results tables
docs/
  CONTRACTS_WALKTHROUGH.md   line-by-line explanation for viva
  DEMO_SCRIPT.md             what to show, in order
web/              Next.js app: issuer portal, student passport, QR verifier
```
