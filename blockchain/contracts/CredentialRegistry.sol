// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IssuerRegistry.sol";

/// @title CredentialRegistry
/// @notice Stores a fingerprint (keccak256 hash) of every issued credential, plus who issued it
///         and whether it has been revoked. No personal data is ever stored on-chain.
contract CredentialRegistry {
    // Packed into 2 storage slots:
    //   slot 0 -> issuer (20 bytes) + issuedAt (5 bytes) + revokedAt (5 bytes) = 30 bytes
    //   slot 1 -> subjectHash (32 bytes)
    struct Credential {
        address issuer;       // wallet that issued it
        uint40 issuedAt;      // block timestamp of issue
        uint40 revokedAt;     // 0 = valid, otherwise block timestamp of revocation
        bytes32 subjectHash;  // keccak256 of the student's DID (not the DID itself)
    }

    IssuerRegistry public immutable issuerRegistry;
    mapping(bytes32 => Credential) private credentials;   // credentialHash => record
    uint256 public totalIssued;
    uint256 public totalRevoked;

    event CredentialIssued(bytes32 indexed credentialHash, address indexed issuer, bytes32 subjectHash);
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer);

    error NotActiveIssuer();
    error AlreadyIssued();
    error NotFound();
    error NotOriginalIssuer();
    error AlreadyRevoked();

    constructor(IssuerRegistry registry) {
        issuerRegistry = registry;
    }

    /// @notice An approved issuer anchors the hash of a signed credential.
    function issue(bytes32 credentialHash, bytes32 subjectHash) external {
        if (!issuerRegistry.isActiveIssuer(msg.sender)) revert NotActiveIssuer();
        if (credentials[credentialHash].issuer != address(0)) revert AlreadyIssued();

        credentials[credentialHash] = Credential(msg.sender, uint40(block.timestamp), 0, subjectHash);
        totalIssued++;
        emit CredentialIssued(credentialHash, msg.sender, subjectHash);
    }

    /// @notice Only the issuer that created a credential can revoke it.
    function revoke(bytes32 credentialHash) external {
        Credential storage c = credentials[credentialHash];
        if (c.issuer == address(0)) revert NotFound();
        if (c.issuer != msg.sender) revert NotOriginalIssuer();
        if (c.revokedAt != 0) revert AlreadyRevoked();

        c.revokedAt = uint40(block.timestamp);
        totalRevoked++;
        emit CredentialRevoked(credentialHash, msg.sender);
    }

    /// @notice Free (no gas) read used by verifiers.
    function verify(bytes32 credentialHash)
        external
        view
        returns (bool exists, address issuer, uint40 issuedAt, bool revoked, uint40 revokedAt, bool issuerActive, bytes32 subjectHash)
    {
        Credential memory c = credentials[credentialHash];
        exists = c.issuer != address(0);
        issuer = c.issuer;
        issuedAt = c.issuedAt;
        revoked = c.revokedAt != 0;
        revokedAt = c.revokedAt;
        issuerActive = exists && issuerRegistry.isActiveIssuer(c.issuer);
        subjectHash = c.subjectHash;
    }
}
