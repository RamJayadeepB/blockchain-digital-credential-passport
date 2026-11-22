import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { ES256KSigner } from "did-jwt";
import { createVerifiableCredentialJwt } from "did-jwt-vc";
import { readAuth, issuerWallet } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
const didFor = (a) => `did:ethr:${ethers.toQuantity(CHAIN_ID)}:${ethers.getAddress(a)}`;
const clean = (v, max = 120) => String(v ?? "").trim().slice(0, max);

// The university's signing service: checks the caller is the issuer wallet, then signs the credential.
export async function POST(request) {
  try {
    const caller = readAuth(request);
    const wallet = issuerWallet();
    if (!caller) return NextResponse.json({ error: "Please sign in with your wallet first." }, { status: 401 });
    if (caller !== wallet.address) {
      return NextResponse.json({ error: `This wallet (${caller}) is not the university's signing wallet.` }, { status: 403 });
    }

    const b = await request.json();
    if (!ethers.isAddress(b.studentAddress)) return NextResponse.json({ error: "Student wallet address is not valid." }, { status: 400 });
    const studentName = clean(b.studentName);
    if (!studentName) return NextResponse.json({ error: "Student name is required." }, { status: 400 });

    const studentDid = didFor(b.studentAddress);
    const issuer = {
      did: didFor(wallet.address),
      signer: ES256KSigner(ethers.getBytes(wallet.privateKey)),
      alg: "ES256K",
    };
    const payload = {
      sub: studentDid,
      nbf: Math.floor(Date.now() / 1000),
      jti: `urn:uuid:${crypto.randomUUID()}`,
      vc: {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", "AcademicCredential"],
        credentialSubject: {
          name: studentName,
          rollNo: clean(b.rollNo, 40),
          degree: clean(b.degree, 60),
          program: clean(b.program, 100),
          institution: clean(b.institution, 120),
          cgpa: clean(b.cgpa, 10),
          graduationYear: Number(b.graduationYear) || undefined,
        },
      },
    };
    const jwt = await createVerifiableCredentialJwt(payload, issuer);
    return NextResponse.json({
      jwt,
      issuerDid: issuer.did,
      studentDid,
      credentialHash: ethers.keccak256(ethers.toUtf8Bytes(jwt)),
      subjectHash: ethers.keccak256(ethers.toUtf8Bytes(studentDid)),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
