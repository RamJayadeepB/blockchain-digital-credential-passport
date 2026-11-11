// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IssuerRegistry
/// @notice A list of institutions (issuers) that are allowed to issue credentials.
///         Only the admin (the account that deployed this contract) can add or remove issuers.
contract IssuerRegistry {
    struct Issuer {
        string name;      // e.g. "Amrita Vishwa Vidyapeetham"
        string did;       // e.g. "did:ethr:sepolia:0xAbc..."
        bool active;      // false once the admin removes the issuer
        uint40 addedAt;   // block timestamp when the issuer was added
    }

    address public immutable admin;                 // set once in the constructor
    mapping(address => Issuer) private issuers;     // issuer wallet address => details

    event IssuerAdded(address indexed issuer, string name, string did);
    event IssuerRemoved(address indexed issuer);

    error NotAdmin();
    error AlreadyActive();
    error NotActive();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Admin approves a new issuer wallet.
    function addIssuer(address issuer, string calldata name, string calldata did) external onlyAdmin {
        if (issuers[issuer].active) revert AlreadyActive();
        issuers[issuer] = Issuer(name, did, true, uint40(block.timestamp));
        emit IssuerAdded(issuer, name, did);
    }

    /// @notice Admin removes an issuer. Credentials it already issued stay on-chain,
    ///         but verifiers will see that the issuer is no longer active.
    function removeIssuer(address issuer) external onlyAdmin {
        if (!issuers[issuer].active) revert NotActive();
        issuers[issuer].active = false;
        emit IssuerRemoved(issuer);
    }

    function isActiveIssuer(address issuer) external view returns (bool) {
        return issuers[issuer].active;
    }

    function getIssuer(address issuer) external view returns (Issuer memory) {
        return issuers[issuer];
    }
}
