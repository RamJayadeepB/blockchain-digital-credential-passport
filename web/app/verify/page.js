"use client";
import { useCallback, useEffect, useState } from "react";
import { config, txUrl, addressUrl } from "@/lib/config";
import { verifyCredentialJwt, tamperJwt, readRawStorage, fmtTime, STATUS } from "@/lib/verify";
import Scanner from "@/components/Scanner";

const TITLE = { VALID: "Valid credential", REVOKED: "Credential revoked", TAMPERED: "Tampered credential", UNKNOWN_ISSUER: "Unknown issuer" };
const JWT_RE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const extractJwt = (text) => {
  const t = String(text || "").trim();
  const token = t.includes("#") ? t.slice(t.lastIndexOf("#") + 1) : t;
  return JWT_RE.test(token) ? token : null;
};
const Tick = ({ ok }) => (ok === undefined ? <span className="tick na">–</span> : ok ? <span className="tick yes">✓</span> : <span className="tick no">✗</span>);

export default function VerifyPage() {
  const [original, setOriginal] = useState("");
  const [current, setCurrent] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [raw, setRaw] = useState(null);
  const [edited, setEdited] = useState(false);

  const run = useCallback(async (token) => {
    setBusy(true); setError(""); setRaw(null);
    try {
      setCurrent(token);
      setResult(await verifyCredentialJwt(token));
    } catch (e) {
      setResult(null);
      setError(`Could not complete the check: ${e?.shortMessage || e?.message || e}`);
    }
    setBusy(false);
  }, []);

  const load = useCallback((text) => {
    const token = extractJwt(text);
    if (!token) { setError("That does not look like a credential QR or link."); return; }
    setError(""); setEdited(false);
    setOriginal(token);
    history.replaceState(null, "", `#${token}`);
    run(token);
  }, [run]);

  useEffect(() => {
    const read = () => { const h = window.location.hash.slice(1); if (h) load(h); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [load]);

  function simulateTamper() {
    const t = tamperJwt(original, (p) => { p.vc.credentialSubject.cgpa = "9.99"; });
    setEdited(true);
    run(t);
  }
  function undoTamper() { setEdited(false); run(original); }

  async function showStorage() {
    try { setRaw(await readRawStorage(result.credentialHash)); } catch (e) { setError(`Could not read storage: ${e.message}`); }
  }

  const c = result?.credential;
  const o = result?.onChain;
  return (
    <>
      <h1>Verify a credential</h1>
      <p className="muted">Scan the QR code from a student&apos;s passport. The check runs in your browser: signature first, then the blockchain.</p>

      {!result && !busy && (
        <div className="grid grid-2">
          <div className="card"><h3>Scan</h3><Scanner onResult={load} /></div>
          <div className="card">
            <h3>Or paste a link</h3>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the verify link or the credential text" />
            <div style={{ marginTop: 10 }}><button className="btn" onClick={() => load(paste)} disabled={!paste.trim()}>Verify</button></div>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {busy && <div className="card"><p style={{ margin: 0 }}>Checking the signature and the blockchain…</p></div>}

      {result && !busy && (
        <>
          <div className={`result result-${result.status}`}>
            <h2>{result.status === "VALID" ? "✓ " : result.status === "REVOKED" ? "⊘ " : "✗ "}{TITLE[result.status]}</h2>
            <p>{result.reason}</p>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3>Credential</h3>
              <table className="kv"><tbody>
                <tr><th>Name</th><td>{c?.name || "-"}</td></tr>
                <tr><th>Roll number</th><td>{c?.rollNo || "-"}</td></tr>
                <tr><th>Degree</th><td>{c?.degree} · {c?.program}</td></tr>
                <tr><th>Institution</th><td>{c?.institution}</td></tr>
                <tr><th>CGPA / Year</th><td>{c?.cgpa} · {c?.graduationYear}</td></tr>
                <tr><th>Issuer DID</th><td className="mono">{c?.issuer}</td></tr>
                <tr><th>Holder DID</th><td className="mono">{c?.subject}</td></tr>
              </tbody></table>
            </div>
            <div className="card">
              <h3>Checks</h3>
              <ul className="checks">
                <li><Tick ok={result.checks.signature} /> Issuer&apos;s signature matches the credential</li>
                <li><Tick ok={result.checks.anchored} /> Hash is recorded on the blockchain</li>
                <li><Tick ok={result.checks.issuerApproved} /> Issuer is approved in the registry</li>
                <li><Tick ok={result.checks.notRevoked} /> Not revoked</li>
              </ul>
              <p className="muted small" style={{ margin: "12px 0 0" }}>
                {result.timingsMs.total} ms total (signature {result.timingsMs.signature} ms{result.timingsMs.chain !== undefined ? `, blockchain ${result.timingsMs.chain} ms` : ""}). Reading the blockchain is free.
              </p>
            </div>
          </div>

          {o?.exists && (
            <div className="card">
              <h3>Blockchain record</h3>
              <table className="kv"><tbody>
                <tr><th>Credential hash</th><td className="mono">{result.credentialHash}</td></tr>
                <tr><th>Recorded by</th><td className="mono">{addressUrl(o.issuer) ? <a href={addressUrl(o.issuer)} target="_blank" rel="noreferrer">{o.issuer}</a> : o.issuer}</td></tr>
                <tr><th>Recorded at</th><td>{fmtTime(o.issuedAt)}</td></tr>
                <tr><th>Revoked at</th><td>{o.revoked ? fmtTime(o.revokedAt) : "Not revoked"}</td></tr>
                <tr><th>Contract</th><td className="mono">{addressUrl(config.credentialRegistry) ? <a href={addressUrl(config.credentialRegistry)} target="_blank" rel="noreferrer">{config.credentialRegistry}</a> : config.credentialRegistry}</td></tr>
              </tbody></table>
              <p className="muted small">The chain stores 64 bytes per credential. The name, marks and DID stay in the signed credential.</p>
              <details onToggle={(e) => e.currentTarget.open && !raw && showStorage()}>
                <summary>Show raw blockchain storage</summary>
                {raw ? (
                  <table className="kv"><tbody>
                    <tr><th>Slot rule</th><td className="mono">{raw.slotKeyFormula}</td></tr>
                    <tr><th>Struct slot 0</th><td className="mono">{raw.slot0Index}</td></tr>
                    <tr><th>Raw value</th><td className="mono">{raw.slot0}</td></tr>
                    <tr><th>→ issuer (20 bytes)</th><td className="mono">{raw.issuer}</td></tr>
                    <tr><th>→ issuedAt (5 bytes)</th><td>{raw.issuedAt} ({fmtTime(raw.issuedAt)})</td></tr>
                    <tr><th>→ revokedAt (5 bytes)</th><td>{raw.revokedAt ? `${raw.revokedAt} (${fmtTime(raw.revokedAt)})` : "0 (not revoked)"}</td></tr>
                    <tr><th>Struct slot 1</th><td className="mono">{raw.slot1Index}</td></tr>
                    <tr><th>→ subjectHash (32 bytes)</th><td className="mono">{raw.slot1}</td></tr>
                  </tbody></table>
                ) : <p className="muted small">Reading storage…</p>}
              </details>
            </div>
          )}

          <div className="card">
            <h3>Demo tools</h3>
            <div className="row">
              {!edited
                ? <button className="btn btn-ghost btn-sm" onClick={simulateTamper}>Simulate tampering: change CGPA to 9.99</button>
                : <button className="btn btn-ghost btn-sm" onClick={undoTamper}>Restore the original credential</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => { setResult(null); setError(""); setOriginal(""); setEdited(false); history.replaceState(null, "", "/verify"); }}>Verify another</button>
            </div>
            {edited && <p className="note">You are now checking an edited copy. The signature no longer matches, so it is flagged as tampered.</p>}
          </div>
        </>
      )}
    </>
  );
}
