# Smart contract walkthrough (for the viva)

Everyone on the team should be able to explain every line below. Two contracts, about 130 lines including comments.

## Big picture

- **IssuerRegistry** = the list of universities we trust. Only the admin can change it.
- **CredentialRegistry** = for every credential, a fingerprint (hash) plus who issued it, when, and whether it was revoked.
- The actual credential (name, CGPA, degree) is **not** on-chain. It is a signed JWT held by the student and put in the QR code.

---

## IssuerRegistry.sol

```solidity
struct Issuer { string name; string did; bool active; uint40 addedAt; }
```
One record per university. `did` is its decentralized identifier, e.g. `did:ethr:0xaa36a7:0xAbc…`. `uint40` holds a Unix timestamp (enough until year 36,000) and uses less storage than `uint256`.

```solidity
address public immutable admin;
```
The deployer's address. `immutable` means it is written into the contract's bytecode at deployment and can never change. Reading it costs almost no gas.

```solidity
mapping(address => Issuer) private issuers;
```
A hash table: wallet address → Issuer. Any address not added returns an empty record (`active = false`).

```solidity
modifier onlyAdmin() { if (msg.sender != admin) revert NotAdmin(); _; }
```
`msg.sender` = the address that sent the current transaction. If it is not the admin, the transaction is reverted (cancelled, all changes undone). `_;` means "now run the function body".

```solidity
error NotAdmin(); ... revert NotAdmin();
```
Custom errors are cheaper than `require(..., "string")` because they don't store an error message string.

```solidity
event IssuerAdded(address indexed issuer, string name, string did);
```
Events are logs stored in the transaction receipt, not in contract storage. They are cheap and are what Etherscan's "Events" tab shows. `indexed` lets apps filter logs by that field.

- `addIssuer(address, name, did)`: admin only; fails if already active; stores the record; emits `IssuerAdded`.
- `removeIssuer(address)`: admin only; sets `active = false`. Old credentials stay on-chain, but verifiers see the issuer is no longer approved.
- `isActiveIssuer`, `getIssuer`: `view` functions, which read and never write, so they are free to call.

---

## CredentialRegistry.sol

```solidity
struct Credential {
    address issuer;      // 20 bytes
    uint40 issuedAt;     //  5 bytes
    uint40 revokedAt;    //  5 bytes   -> these three share ONE 32-byte slot
    bytes32 subjectHash; // 32 bytes   -> second slot
}
```
**Storage packing.** The EVM stores data in 32-byte slots, and writing a new slot costs about 20,000 gas. Solidity packs consecutive small fields into one slot, so 20 + 5 + 5 = 30 bytes fits in one. Each credential costs **2 slots = 64 bytes** on-chain. `revokedAt = 0` means not revoked, so we don't need a separate `bool`.

`subjectHash` is `keccak256(studentDID)`. It ties the credential to the student without putting the DID on-chain.

```solidity
IssuerRegistry public immutable issuerRegistry;
```
The address of the other contract, fixed at deploy time. `CredentialRegistry` asks it "is this wallet an approved issuer?"

```solidity
mapping(bytes32 => Credential) private credentials;   // storage slot 0
uint256 public totalIssued;                           // storage slot 1
uint256 public totalRevoked;                          // storage slot 2
```
The key is the credential hash = `keccak256(signed JWT)`. Changing even one character of the JWT gives a completely different hash.

**Where does a mapping entry live?** At slot `keccak256(abi.encode(key, 0))`, where 0 is the mapping's slot number. The struct's second field is at that slot + 1. `scripts/show-storage.js` computes exactly this and reads the raw slots with `eth_getStorageAt`.

### issue(credentialHash, subjectHash)
1. `issuerRegistry.isActiveIssuer(msg.sender)`: only approved universities can issue (`NotActiveIssuer`).
2. `credentials[hash].issuer != address(0)`: the same credential can't be registered twice (`AlreadyIssued`). An empty record has issuer = zero address.
3. Store `Credential(msg.sender, block.timestamp, 0, subjectHash)`. `block.timestamp` is the block's time, set by the network, not by us.
4. `totalIssued++` and emit `CredentialIssued`.

Gas: about 79,500 per credential. The very first issue costs about 96,600 because `totalIssued` goes from 0 to non-zero, which is a new slot write.

### revoke(credentialHash)
`Credential storage c = credentials[hash];`: `storage` gives a reference to the on-chain record, so editing `c` edits the blockchain directly (`memory` would be a temporary copy).
Checks: the credential exists (`NotFound`), the caller is the original issuer (`NotOriginalIssuer`), and it's not already revoked (`AlreadyRevoked`). Then it sets `revokedAt` and emits `CredentialRevoked`. Gas: about 34,000 (it rewrites an existing slot, which is cheaper than creating one).

### verify(credentialHash) — `view`
Returns `exists, issuer, issuedAt, revoked, revokedAt, issuerActive, subjectHash`. Free to call (no transaction, no gas) because it only reads. The verifier app calls this after checking the signature.

---

## Off-chain verification logic (`lib/credential.js`)

1. **Signature check:** resolve the issuer's `did:ethr` (via the ERC-1056 DID registry) and check the JWT signature. Fails → **TAMPERED**.
2. **On-chain check:** `verify(keccak256(jwt))`.
   - not found → **UNKNOWN_ISSUER** (someone signed it, but no approved university registered it)
   - on-chain issuer ≠ signer, or student hash mismatch → **TAMPERED**
   - issuer removed by admin → **UNKNOWN_ISSUER**
   - `revoked` → **REVOKED**
   - otherwise → **VALID**

---

## Likely viva questions

| Question | Answer |
|---|---|
| What is `msg.sender`? | The address that called the function, i.e. whoever signed the transaction. |
| Why store only the hash? | Privacy (no personal data on a public chain), lower cost (32 bytes vs KBs), and it still proves the document is unchanged. |
| Why keccak256? | It's Ethereum's built-in hash. A one-bit change in the input gives a completely different output, and it's infeasible to find two inputs with the same hash. |
| What is gas? Who pays? | The fee for computation and storage on Ethereum. The issuer pays when issuing or revoking; verification is free. |
| `view` vs normal function? | `view` only reads state, needs no transaction and costs no gas. Normal functions change state and need a signed transaction. |
| `storage` vs `memory`? | `storage` = a reference to on-chain data; `memory` = a temporary copy that disappears after the call. |
| Why two contracts? | Separation of concerns: who is trusted (IssuerRegistry) vs what was issued (CredentialRegistry). The issuer list can change without touching credentials. |
| Can the admin fake a credential? | Only by approving itself as an issuer, which is public and visible in `IssuerAdded` events. It also can't alter or delete existing credentials. |
| What if a university's key is stolen? | The admin removes that issuer, so all its credentials show UNKNOWN_ISSUER until re-issued. Key rotation via the DID registry is future work. |
| What is a DID? | A decentralized identifier controlled by the holder's key, e.g. `did:ethr:<chain>:<address>`. Its DID document lists the public key used to check signatures. |
| What is a Verifiable Credential? | The W3C standard format for a signed claim (issuer, subject, claims, proof). Ours is encoded as a JWT. |
| Why events? | Cheap permanent logs that apps and Etherscan can search. They give the full history (issued at block X, revoked at block Y). |
| Why `uint40` timestamps? | Enough range, and three fields fit in one 32-byte slot. That saves about 20,000 gas per credential. |
| What is a revert? | The transaction fails and every change it made is undone. The gas already used is still paid. |
