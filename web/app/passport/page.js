"use client";
import { useState } from "react";
import Link from "next/link";
import { config } from "@/lib/config";
import { connectWallet, getAuthHeader, verifyLink } from "@/lib/wallet";
import { readCredentialRegistry, didFor, STATUS } from "@/lib/verify";
import QrCard from "@/components/QrCard";
import StatusBadge from "@/components/StatusBadge";

const prettyError = (e) => (e?.code === "ACTION_REJECTED" ? "You rejected the request in your wallet." : e?.shortMessage || e?.message || String(e));

export default function PassportPage() {
  const [wallet, setWallet] = useState(null);
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function open() {
    setError("");
    try {
      const w = await connectWallet();
      setWallet(w);
      const did = didFor(w.address);
      const auth = await getAuthHeader(w.signer);
      const res = await fetch(`/api/credentials?did=${encodeURIComponent(did)}`, { headers: { "x-wallet-auth": auth } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const reg = readCredentialRegistry();
      const rows = await Promise.all(data.credentials.map(async (c) => {
        const r = await reg.verify(c.credentialHash);
        return { ...c, status: !r.exists ? "NOT_FOUND" : r.revoked ? STATUS.REVOKED : STATUS.VALID };
      }));
      setCreds(rows);
    } catch (e) {
      setError(prettyError(e));
    }
  }

  async function copy(text, id) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); } catch {}
  }

  return (
    <>
      <h1>Student passport</h1>
      <p className="muted">Your credentials live under your own DID. Sign in with the wallet that the university issued them to.</p>

      <div className="card">
        {!wallet ? (
          <div className="row spread">
            <div><h3>Open my passport</h3><p className="muted small" style={{ margin: 0 }}>Signing in is a free message signature. No transaction and no gas.</p></div>
            <button className="btn" onClick={open}>Connect MetaMask</button>
          </div>
        ) : (
          <div>
            <div className="wallet"><span className="dot" /> <b>Signed in</b> <span className="mono">{wallet.address}</span></div>
            <p className="muted small" style={{ margin: "8px 0 0" }}>Your DID: <span className="mono">{didFor(wallet.address)}</span></p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {creds && creds.length === 0 && (
        <div className="card"><h3>No credentials yet</h3><p className="muted">Nothing has been issued to this wallet on {config.networkName}. Ask the university to issue one to the address above.</p></div>
      )}

      {creds?.map((c) => {
        const link = verifyLink(c.jwt);
        return (
          <div className="card" key={c.credentialHash}>
            <div className="cred">
              <div>
                <div className="row spread"><h3>{c.degree} · {c.program}</h3><StatusBadge status={c.status} /></div>
                <table className="kv"><tbody>
                  <tr><th>Name</th><td>{c.studentName}</td></tr>
                  <tr><th>Roll number</th><td>{c.rollNo || "-"}</td></tr>
                  <tr><th>Institution</th><td>{c.institution}</td></tr>
                  <tr><th>CGPA / Year</th><td>{c.cgpa} · {c.graduationYear}</td></tr>
                  <tr><th>Issued</th><td>{new Date(c.issuedAt).toLocaleString()}</td></tr>
                  <tr><th>Credential hash</th><td className="mono">{c.credentialHash}</td></tr>
                </tbody></table>
                <div className="row" style={{ marginTop: 12 }}>
                  <Link className="btn btn-sm" href={`/verify#${c.jwt}`}>Verify this credential</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(link, c.credentialHash)}>{copied === c.credentialHash ? "Copied" : "Copy share link"}</button>
                </div>
              </div>
              <QrCard value={link} size={260} filename={`credential-${c.credentialHash.slice(2, 10)}.png`} />
            </div>
          </div>
        );
      })}
    </>
  );
}
