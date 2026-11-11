const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

describe("Credential Passport contracts", function () {
  async function deployFixture() {
    const [admin, university, otherUniversity, outsider] = await ethers.getSigners();

    const issuerRegistry = await ethers.deployContract("IssuerRegistry");
    const credentialRegistry = await ethers.deployContract("CredentialRegistry", [await issuerRegistry.getAddress()]);

    await issuerRegistry.addIssuer(university.address, "Amrita Vishwa Vidyapeetham", `did:ethr:0x7a69:${university.address}`);
    await issuerRegistry.addIssuer(otherUniversity.address, "Other University", `did:ethr:0x7a69:${otherUniversity.address}`);

    const credHash = h("signed.credential.jwt");
    const subjectHash = h("did:ethr:0x7a69:0xStudent");
    return { admin, university, otherUniversity, outsider, issuerRegistry, credentialRegistry, credHash, subjectHash };
  }

  describe("IssuerRegistry", function () {
    it("sets the deployer as admin", async function () {
      const { issuerRegistry, admin } = await loadFixture(deployFixture);
      expect(await issuerRegistry.admin()).to.equal(admin.address);
    });

    it("stores issuer details and emits IssuerAdded", async function () {
      const { issuerRegistry, outsider } = await loadFixture(deployFixture);
      await expect(issuerRegistry.addIssuer(outsider.address, "New College", "did:ethr:x"))
        .to.emit(issuerRegistry, "IssuerAdded")
        .withArgs(outsider.address, "New College", "did:ethr:x");
      const issuer = await issuerRegistry.getIssuer(outsider.address);
      expect(issuer.name).to.equal("New College");
      expect(issuer.active).to.equal(true);
    });

    it("blocks non-admins from adding issuers", async function () {
      const { issuerRegistry, outsider } = await loadFixture(deployFixture);
      await expect(issuerRegistry.connect(outsider).addIssuer(outsider.address, "Fake", "did"))
        .to.be.revertedWithCustomError(issuerRegistry, "NotAdmin");
    });

    it("rejects adding an issuer twice", async function () {
      const { issuerRegistry, university } = await loadFixture(deployFixture);
      await expect(issuerRegistry.addIssuer(university.address, "Again", "did"))
        .to.be.revertedWithCustomError(issuerRegistry, "AlreadyActive");
    });

    it("lets the admin remove an issuer", async function () {
      const { issuerRegistry, university } = await loadFixture(deployFixture);
      await expect(issuerRegistry.removeIssuer(university.address))
        .to.emit(issuerRegistry, "IssuerRemoved").withArgs(university.address);
      expect(await issuerRegistry.isActiveIssuer(university.address)).to.equal(false);
      await expect(issuerRegistry.removeIssuer(university.address))
        .to.be.revertedWithCustomError(issuerRegistry, "NotActive");
    });
  });

  describe("Issuing", function () {
    it("anchors a credential hash and emits CredentialIssued", async function () {
      const { credentialRegistry, university, credHash, subjectHash } = await loadFixture(deployFixture);
      await expect(credentialRegistry.connect(university).issue(credHash, subjectHash))
        .to.emit(credentialRegistry, "CredentialIssued")
        .withArgs(credHash, university.address, subjectHash);

      const r = await credentialRegistry.verify(credHash);
      expect(r.exists).to.equal(true);
      expect(r.issuer).to.equal(university.address);
      expect(r.revoked).to.equal(false);
      expect(r.issuerActive).to.equal(true);
      expect(r.subjectHash).to.equal(subjectHash);
      expect(await credentialRegistry.totalIssued()).to.equal(1n);
    });

    it("rejects issuers that are not approved", async function () {
      const { credentialRegistry, outsider, credHash, subjectHash } = await loadFixture(deployFixture);
      await expect(credentialRegistry.connect(outsider).issue(credHash, subjectHash))
        .to.be.revertedWithCustomError(credentialRegistry, "NotActiveIssuer");
    });

    it("rejects issuing the same credential twice", async function () {
      const { credentialRegistry, university, otherUniversity, credHash, subjectHash } = await loadFixture(deployFixture);
      await credentialRegistry.connect(university).issue(credHash, subjectHash);
      await expect(credentialRegistry.connect(otherUniversity).issue(credHash, subjectHash))
        .to.be.revertedWithCustomError(credentialRegistry, "AlreadyIssued");
    });
  });

  describe("Revoking", function () {
    it("lets the original issuer revoke and records the time", async function () {
      const { credentialRegistry, university, credHash, subjectHash } = await loadFixture(deployFixture);
      await credentialRegistry.connect(university).issue(credHash, subjectHash);
      await time.increase(60);
      await expect(credentialRegistry.connect(university).revoke(credHash))
        .to.emit(credentialRegistry, "CredentialRevoked").withArgs(credHash, university.address);

      const r = await credentialRegistry.verify(credHash);
      expect(r.revoked).to.equal(true);
      expect(r.revokedAt).to.be.greaterThan(r.issuedAt);
      expect(await credentialRegistry.totalRevoked()).to.equal(1n);
    });

    it("blocks other issuers from revoking", async function () {
      const { credentialRegistry, university, otherUniversity, credHash, subjectHash } = await loadFixture(deployFixture);
      await credentialRegistry.connect(university).issue(credHash, subjectHash);
      await expect(credentialRegistry.connect(otherUniversity).revoke(credHash))
        .to.be.revertedWithCustomError(credentialRegistry, "NotOriginalIssuer");
    });

    it("rejects revoking unknown or already revoked credentials", async function () {
      const { credentialRegistry, university, credHash, subjectHash } = await loadFixture(deployFixture);
      await expect(credentialRegistry.connect(university).revoke(credHash))
        .to.be.revertedWithCustomError(credentialRegistry, "NotFound");
      await credentialRegistry.connect(university).issue(credHash, subjectHash);
      await credentialRegistry.connect(university).revoke(credHash);
      await expect(credentialRegistry.connect(university).revoke(credHash))
        .to.be.revertedWithCustomError(credentialRegistry, "AlreadyRevoked");
    });
  });

  describe("Verifying", function () {
    it("returns exists=false for unknown hashes", async function () {
      const { credentialRegistry } = await loadFixture(deployFixture);
      const r = await credentialRegistry.verify(h("never issued"));
      expect(r.exists).to.equal(false);
      expect(r.issuerActive).to.equal(false);
    });

    it("flags credentials whose issuer was later removed", async function () {
      const { issuerRegistry, credentialRegistry, university, credHash, subjectHash } = await loadFixture(deployFixture);
      await credentialRegistry.connect(university).issue(credHash, subjectHash);
      await issuerRegistry.removeIssuer(university.address);
      const r = await credentialRegistry.verify(credHash);
      expect(r.exists).to.equal(true);
      expect(r.issuerActive).to.equal(false);
    });
  });

  describe("Storage layout (used by the storage demo)", function () {
    it("packs issuer, issuedAt and revokedAt into one slot", async function () {
      const { credentialRegistry, university, credHash, subjectHash } = await loadFixture(deployFixture);
      await credentialRegistry.connect(university).issue(credHash, subjectHash);
      const addr = await credentialRegistry.getAddress();
      const base = BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [credHash, 0])));
      const slot0 = await ethers.provider.getStorage(addr, base);
      const slot1 = await ethers.provider.getStorage(addr, base + 1n);
      expect(ethers.getAddress("0x" + slot0.slice(-40))).to.equal(university.address);
      expect(slot1).to.equal(subjectHash);
      expect(await ethers.provider.getStorage(addr, 1)).to.equal(ethers.toBeHex(1, 32)); // totalIssued
    });
  });
});
