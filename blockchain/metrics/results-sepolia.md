# Metrics - sepolia (chainId 11155111)

10 runs, 2026-11-15T17:53:41.890Z

## Gas and cost
| Operation | Gas used | Fee (ETH, mean) |
|---|---|---|
| Deploy IssuerRegistry | 3794399 | - |
| Deploy CredentialRegistry | 2503901 | - |
| issue() | 257076.4 | 4.216052e-12 |
| revoke() | 42371.6 | 7.20317e-13 |
| verify() (read-only call) | 0 | 0 |

Mean gas price during issue(): 1.64e-8 gwei. On-chain storage per credential: 64 bytes (2 slots).

## Time (ms)
| Metric | Mean | Median | Min | Max |
|---|---|---|---|---|
| Sign credential (off-chain) | 10.46 | 2.02 | 1.4 | 87.98 |
| issue() confirmation | 17020.53 | 12041.46 | 4111.96 | 36144.05 |
| revoke() confirmation | 11756.81 | 11943.47 | 11409.86 | 12011.75 |
| Verify (valid credential) | 169.81 | 166.6 | 152.5 | 226.1 |
| Verify (revoked credential) | 161.68 | 160.1 | 152.5 | 172.2 |

## Size
Signed credential (JWT): 854 characters. Full QR payload: 883 characters.

## Detection accuracy
| Case | Correct result |
|---|---|
| Genuine credentials accepted as VALID | 5/5 (100%) |
| Tampered credentials flagged TAMPERED | 20/20 (100%) |
| Forged-issuer credentials flagged UNKNOWN_ISSUER | 5/5 (100%) |
| Revoked credentials flagged REVOKED | 5/5 (100%) |
