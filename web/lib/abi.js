export const issuerRegistryAbi = [
  "function admin() view returns (address)",
  "function isActiveIssuer(address) view returns (bool)",
  "function getIssuer(address) view returns (tuple(string name, string did, bool active, uint40 addedAt))",
];

export const credentialRegistryAbi = [
  "function issue(bytes32 credentialHash, bytes32 subjectHash)",
  "function revoke(bytes32 credentialHash)",
  "function verify(bytes32 credentialHash) view returns (bool exists, address issuer, uint40 issuedAt, bool revoked, uint40 revokedAt, bool issuerActive, bytes32 subjectHash)",
  "function totalIssued() view returns (uint256)",
  "function totalRevoked() view returns (uint256)",
];
