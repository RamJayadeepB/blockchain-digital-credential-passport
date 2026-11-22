"use client";
import { useCallback, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { config, txUrl } from "@/lib/config";
import { connectWallet, getAuthHeader, writeCredentialRegistry, verifyLink } from "@/lib/wallet";
import { getIssuerInfo, readCredentialRegistry, STATUS } from "@/lib/verify";
import QrCard from "@/components/QrCard";
import StatusBadge from "@/components/StatusBadge";

const STEPS = ["Sign in with your wallet", "University signs the credential", "Confirm the transaction in MetaMask", "Waiting for the blockchain to confirm", "Saving to the student's passport"];
const prettyError = (e) => (e?.code === "ACTION_REJECTED" ? "You rejected the request in your wallet." : e?.shortMessage || e?.reason || e?.message || String(e));

const emptyForm = { studentAddress: "", studentName: "", rollNo: "", degree: "B.Tech", program: "Computer Science and Engineering", institution: "", cgpa: "", graduationYear: "2027" };

export default function IssuerPage() {
  const [wallet, setWallet] = useState(null);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [busyHash, setBusyHash] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const refresh = useCallback(async (w) => {
    try {
      const auth = await getAuthHeader(w.signer);
      const res = await fetch("/api/credentials?scope=issuer", { headers: { "x-wallet-auth": auth } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const reg = readCredentialRegistry();
      const rows = await Promise.all(data.credentials.map(async (c) => {
        const r = await reg.verify(c.credentialHash);
        return { ...c, status: !r.exists ? "NOT_FOUND" : r.revoked ? STATUS.REVOKED : STATUS.VALID };
      }));
      setList(rows);
    } catch (e) {
      setError(prettyError(e));
    }
  }, []);

  async function connect() {
    setError("");
    try {
      const w = await connectWallet();
      setWallet(w);
      const i = await getIssuerInfo(w.address);
      setInfo(i);
      if (i?.active) setForm((f) => ({ ...f, institution: f.institution || i.name }));
      if (i?.active) refresh(w);
    } catch (e) {
      setError(prettyError(e));
    }
  }

  async function issue(e) {
    e.preventDefault();
    setError(""); setResult(null);
    const started = performance.now();
    try {
      setStep(1);
      const auth = await getAuthHeader(wallet.signer);
      setStep(2);
      const res = await fetch("/api/sign", { method: "POST", headers: { "content-type": "application/json", "x-wallet-auth": auth }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(3);
      const tx = await writeCredentialRegistry(wallet.signer).issue(data.credentialHash, data.subjectHash);
      setStep(4);
      const t0 = performance.now();
      const rc = await tx.wait();
      const confirmMs = Math.round(performance.now() - t0);
      setStep(5);
      await fetch("/api/credentials", { method: "POST", headers: { "content-type": "application/json", "x-wallet-auth": auth }, body: JSON.stringify({ jwt: data.jwt, txHash: rc.hash }) });
      setResult({ ...data, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed.toString(), fee: ethers.formatEther(rc.gasUsed * rc.gasPrice), confirmMs, totalMs: Math.round(performance.now() - started) });
      setStep(0);
      refresh(wallet);
    } catch (err) {
      setError(prettyError(err));
      setStep(0);
    }
  }

  async function revoke(hash) {
    setError(""); setBusyHash(hash);
    try {
      const tx = await writeCredentialRegistry(wallet.signer).revoke(hash);
      await tx.wait();
      await refresh(wallet);
    } catch (err) {
      setError(prettyError(err));
    }
    setBusyHash("");
  }

  const approved = info?.active;

  return (
    <>
      <h1>University portal</h1>
      <p className="muted">Issue a signed credential and record its hash on the blockchain. Only wallets approved in the IssuerRegistry can do this.</p>

      <div className="card">
        {!wallet ? (
          <div className="row spread">
            <div><h3>1. Connect the university wallet</h3><p className="muted small" style={{ margin: 0 }}>MetaMask on the {config.networkName} network.</p></div>
            <button className="btn" onClick={connect}>Connect MetaMask</button>
          </div>
        ) : (
          <div className="wallet">
            <span className="dot" /> <b>Connected</b> <span className="mono">{wallet.address}</span>
            {approved
              ? <><StatusBadge status="VALID" /> <span>Approved issuer: <b>{info.name}</b></span></>
              : <><StatusBadge status="UNKNOWN_ISSUER" /> <span className="muted small">This wallet is not approved yet. The admin must run <code>add-issuer</code>.</span></>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {wallet && approved && (
        <form className="card" onSubmit={issue}>
          <h3>2. Create a credential</h3>
          <div className="form-grid">
            <label className="field"><span>Student name</span><input type="text" required value={form.studentName} onChange={set("studentName")} placeholder="Full name" /></label>
            <label className="field"><span>Roll number</span><input type="text" value={form.rollNo} onChange={set("rollNo")} placeholder="BL.EN.U4CSE23…" /></label>
            <label className="field"><span>Degree</span><input type="text" value={form.degree} onChange={set("degree")} /></label>
            <label className="field"><span>Program</span><input type="text" value={form.program} onChange={set("program")} /></label>
            <label className="field"><span>Institution</span><input type="text" value={form.institution} onChange={set("institution")} /></label>
            <label className="field"><span>CGPA</span><input type="text" value={form.cgpa} onChange={set("cgpa")} placeholder="8.11" /></label>
            <label className="field"><span>Graduation year</span><input type="number" value={form.graduationYear} onChange={set("graduationYear")} /></label>
            <label className="field"><span>Student wallet address (becomes their DID)</span>
              <input type="text" required value={form.studentAddress} onChange={set("studentAddress")} placeholder="0x…" />
            </label>
          </div>
          <div className="row" style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, studentAddress: wallet.address }))}>Use my connected address</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, studentAddress: ethers.Wallet.createRandom().address }))}>Random demo student</button>
          </div>
          <button className="btn" disabled={step > 0}>{step > 0 ? "Working…" : "Sign & record on blockchain"}</button>
          {step > 0 && (
            <ol className="progress">
              {STEPS.map((s, i) => <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""}>{i + 1 < step ? "✓ " : i + 1 === step ? "→ " : "· "}{s}</li>)}
            </ol>
          )}
        </form>
      )}

      {result && (
        <div className="card">
          <div className="row spread"><h3>Credential issued</h3><StatusBadge status="VALID" /></div>
          <div className="cred">
            <table className="kv"><tbody>
              <tr><th>Transaction</th><td className="mono">{txUrl(result.txHash) ? <a href={txUrl(result.txHash)} target="_blank" rel="noreferrer">{result.txHash}</a> : result.txHash}</td></tr>
              <tr><th>Block</th><td>{result.block}</td></tr>
              <tr><th>Gas used</th><td>{Number(result.gasUsed).toLocaleString()}</td></tr>
              <tr><th>Fee</th><td>{result.fee} ETH</td></tr>
              <tr><th>Confirmation time</th><td>{result.confirmMs} ms</td></tr>
              <tr><th>Credential hash (on-chain)</th><td className="mono">{result.credentialHash}</td></tr>
              <tr><th>Student DID</th><td className="mono">{result.studentDid}</td></tr>
              <tr><th>Verify link</th><td><Link className="link" href={`/verify#${result.jwt}`}>Open in verifier</Link></td></tr>
            </tbody></table>
            <QrCard value={verifyLink(result.jwt)} size={280} filename="credential-qr.png" />
          </div>
        </div>
      )}

      {wallet && approved && (
        <div className="card">
          <div className="row spread"><h3>Issued credentials</h3><button className="btn btn-ghost btn-sm" onClick={() => refresh(wallet)}>Refresh</button></div>
          {list.length === 0 ? <p className="muted">Nothing issued yet.</p> : (
            <div className="table-wrap"><table className="list">
              <thead><tr><th>Student</th><th>Degree</th><th>Issued</th><th>Status</th><th></th></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.credentialHash}>
                  <td><b>{c.studentName}</b><br /><span className="mono muted">{c.credentialHash.slice(0, 14)}…</span></td>
                  <td>{c.degree}<br /><span className="muted small">CGPA {c.cgpa}</span></td>
                  <td className="small">{new Date(c.issuedAt).toLocaleString()}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><div className="row">
                    <Link className="btn btn-ghost btn-sm" href={`/verify#${c.jwt}`}>Verify</Link>
                    {c.status === STATUS.VALID && <button className="btn btn-danger btn-sm" disabled={busyHash === c.credentialHash} onClick={() => revoke(c.credentialHash)}>{busyHash === c.credentialHash ? "Revoking…" : "Revoke"}</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </>
  );
}
