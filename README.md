# Digital Credential Passport

A blockchain-based academic credential verification system using **Decentralized Identifiers (DIDs)**, **W3C Verifiable Credentials (VCs)**, and **QR code verification**.

A university signs a digital credential and records its cryptographic fingerprint (hash) on the Ethereum blockchain. Students hold their signed credentials, accessible through a QR code. Employers can scan the QR code and verify whether a credential is **VALID**, **REVOKED**, **TAMPERED**, or issued by an **UNKNOWN ISSUER**.

No personal information is stored on-chain.

## How It Works

```text
University (Issuer)             Ethereum (Sepolia)             Employer (Verifier)
       |                                |                              |
1. Build credential JSON                |                              |
2. Sign using DID key                   |                              |
       |                                |                              |
       |------ JWT -------------------->|                              |
       |                       3. issue(hash, subjectHash)              |
       |                       Store issuer, time, status               |
       |                                |                              |
4. Student receives QR code             |                              |
       |                                |                              |
       |-------------------------- QR Scan ---------------------------->|
                                        |                              |
                              5. Verify issuer signature                |
                              6. Check on-chain record                  |
                              7. Display verification result            |
```

### Core Components

| Component | Purpose |
|---|---|
| `IssuerRegistry.sol` | Maintains the list of approved university issuers |
| `CredentialRegistry.sol` | Stores credential hashes, issuer details, issue time, revocation time, and student DID hash |
| `EthereumDIDRegistry` (ERC-1056) | Standard registry supporting `did:ethr` identifiers |
| `lib/credential.js` | Creates DIDs, signs credentials (JWT), generates hashes, and handles verification |

## Technology Stack

| Technology | Role |
|---|---|
| Solidity 0.8.24 + Hardhat | Smart contracts, testing, and deployment |
| Ethereum Sepolia | Public Ethereum test network |
| MetaMask | Wallet and transaction signing |
| Etherscan | Transaction and smart contract inspection |
| did-jwt, did-jwt-vc | DID-based identity and verifiable credential signing |
| ethr-did-resolver | Resolves `did:ethr` identities |
| ethers.js v6 | Blockchain interaction |
| qrcode | QR code generation |
| hardhat-gas-reporter | Gas usage analysis |
| solidity-coverage | Smart contract test coverage |

## Project Structure

```text
credential-passport/
│
├── blockchain/
│   ├── contracts/
│   │   ├── IssuerRegistry.sol
│   │   └── CredentialRegistry.sol
│   ├── test/
│   ├── lib/
│   │   ├── credential.js
│   │   └── setup.js
│   ├── scripts/
│   ├── deployments/
│   ├── metrics/
│   └── docs/
│
├── web/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   └── next.config.js
│
├── README.md
└── .gitignore
```

## Getting Started

### 1. Smart Contract Setup

Navigate to the blockchain directory:

```bash
cd blockchain
npm install
```

Run the tests:

```bash
npm test
```

Run test coverage:

```bash
npm run coverage
```

### 2. Run a Local Blockchain

Open separate terminals.

**Terminal 1 – Start the local blockchain:**

```bash
npm run node
```

**Terminal 2 – Deploy smart contracts:**

```bash
npm run deploy:local
```

**Terminal 2 – Run the demonstration:**

```bash
npm run demo:local
```

Additional commands:

```bash
npm run storage:local
npm run metrics:local
```

The demonstration covers the credential lifecycle:

- Issue a credential
- Verify a genuine credential
- Detect tampered credentials
- Detect forged issuers
- Revoke a credential

### 3. Ethereum Sepolia Deployment

For deployment to Sepolia:

1. Create a test-only MetaMask account.
2. Obtain Sepolia test ETH from a faucet.
3. Get an RPC URL from Alchemy or Infura.
4. Obtain an Etherscan API key.
5. Configure the environment variables.

Create your environment file:

```bash
cp .env.example .env
```

Configure the required values, then deploy:

```bash
npm run deploy:sepolia
```

Verify the deployed contracts:

```bash
npx hardhat verify --network sepolia <IssuerRegistry_ADDRESS>

npx hardhat verify --network sepolia <CredentialRegistry_ADDRESS> <IssuerRegistry_ADDRESS>
```

Run the demonstration and metrics:

```bash
npm run demo:sepolia
npm run storage:sepolia
npm run metrics:sepolia
```

Transaction links and contract details can be inspected through Etherscan.

## Web Application

The project includes three main interfaces:

| Page | Functionality |
|---|---|
| `/issuer` | University portal to issue and revoke credentials |
| `/passport` | Student portal to access credentials and generate QR codes |
| `/verify` | Employer portal to scan, upload, or paste credentials for verification |

### Run the Web Application Locally

First, start the local blockchain and deploy the contracts as described above.

Export the local environment configuration:

```bash
cd blockchain
npm run export-env:local
```

Navigate to the web directory:

```bash
cd ../web
npm install
npm run build
npm start
```

The application will be available at:

```text
http://localhost:3000
```

### MetaMask Configuration

For the local blockchain, configure MetaMask with:

- Network RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`

Import the local Hardhat test account for the university issuer and use another account for the student.

For Sepolia, deploy the contracts and export the corresponding environment configuration before rebuilding the web application.

**Note:** To scan QR codes using a phone, the web application must be accessible from the phone. Configure `NEXT_PUBLIC_BASE_URL` with your LAN IP address or deployed application URL.

## Metrics and Evaluation

The project evaluates the following parameters:

- Smart contract deployment gas consumption
- Credential issuance and revocation gas costs
- Transaction confirmation time
- Credential verification time
- QR payload size
- On-chain storage per credential
- Detection accuracy for genuine, tampered, forged-issuer, and revoked credentials

Detailed results are maintained in the `blockchain/metrics/` directory.

## Security and Privacy

- **Privacy:** Only cryptographic hashes are stored on-chain. Student names, academic marks, and DID-related credential information remain off-chain.
- **Tamper Detection:** Modifying credential data invalidates the issuer's signature and credential hash.
- **Issuer Authentication:** Only wallets approved through the `IssuerRegistry` can anchor credentials on-chain.
- **Revocation:** Credentials can be revoked by their original issuer, with revocation time recorded on-chain.
- **Prototype Limitations:** The current implementation targets test networks. Production-grade issuer key rotation, key recovery, and student identity recovery require additional implementation.

## Future Improvements

- Production-grade key management and recovery
- Integration with university information systems
- Scalable off-chain credential storage
- Deployment to a production blockchain network
- Enhanced authentication and access control

---

**Digital Credential Passport**  
Blockchain-based academic credential issuance, ownership, and verification.