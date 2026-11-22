import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { decodeJWT } from "did-jwt";
import { readAuth, issuerWallet } from "@/lib/serverAuth";
import { listAll, listBySubject, save } from "@/lib/store";

export const dynamic = "force-dynamic";

const addressInDid = (did) => /(0x[0-9a-fA-F]{40})$/.exec(did || "")?.[1];

// GET ?scope=issuer            -> everything the university issued (issuer wallet only)
// GET ?did=did:ethr:...        -> the credentials of that student (only that student's wallet)
export async function GET(request) {
  const caller = readAuth(request);
  if (!caller) return NextResponse.json({ error: "Please sign in with your wallet." }, { status: 401 });
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("scope") === "issuer") {
      if (caller !== issuerWallet().address) return NextResponse.json({ error: "Not the issuer wallet." }, { status: 403 });
      return NextResponse.json({ credentials: listAll() });
    }
    const did = url.searchParams.get("did") || "";
    const owner = addressInDid(did);
    if (!owner || ethers.getAddress(owner) !== caller) return NextResponse.json({ error: "You can only open your own passport." }, { status: 403 });
    return NextResponse.json({ credentials: listBySubject(did) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { jwt, txHash }: issuer saves the credential to the student's passport after the on-chain transaction.
export async function POST(request) {
  try {
    const caller = readAuth(request);
    if (!caller || caller !== issuerWallet().address) return NextResponse.json({ error: "Not the issuer wallet." }, { status: 403 });
    const { jwt, txHash } = await request.json();
    const { payload } = decodeJWT(jwt);
    const s = payload.vc?.credentialSubject || {};
    save({
      credentialHash: ethers.keccak256(ethers.toUtf8Bytes(jwt)),
      jwt,
      subjectDid: payload.sub,
      issuerDid: payload.iss,
      studentName: s.name, rollNo: s.rollNo, degree: s.degree, program: s.program,
      institution: s.institution, cgpa: s.cgpa, graduationYear: s.graduationYear,
      issuedAt: new Date((payload.nbf || 0) * 1000).toISOString(),
      txHash: txHash || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
