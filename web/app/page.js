import Link from "next/link";
import { config, addressUrl } from "@/lib/config";

const short = (a) => (a ? `${a.slice(0, 8)}…${a.slice(-6)}` : "not configured");
const Addr = ({ a }) => (addressUrl(a) && a ? <a className="mono" href={addressUrl(a)} target="_blank" rel="noreferrer">{short(a)}</a> : <span className="mono">{short(a)}</span>);

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Verify a certificate in seconds,<br />not days.</h1>
        <p>Universities sign credentials, anchor only a fingerprint on Ethereum, and students carry them as QR codes. Anyone can scan one and see if it is genuine, revoked or forged.</p>
        <div className="row">
          <Link className="btn" href="/verify">Verify a credential</Link>
          <Link className="btn btn-ghost" href="/issuer">Issue one (university)</Link>
        </div>
      </section>

      <section className="grid grid-3" style={{ marginTop: 22 }}>
        <Link href="/issuer" className="card role-card">
          <div className="who">Issuer</div><h3>University portal</h3>
          <p className="muted">Connect the university wallet, sign a credential, and record it on the blockchain with MetaMask. Revoke any time.</p>
        </Link>
        <Link href="/passport" className="card role-card">
          <div className="who">Holder</div><h3>Student passport</h3>
          <p className="muted">Sign in with your wallet to see every credential issued to your DID, each with its own QR code.</p>
        </Link>
        <Link href="/verify" className="card role-card">
          <div className="who">Verifier</div><h3>Scan &amp; verify</h3>
          <p className="muted">Scan a QR with the camera. The result is Valid, Revoked, Tampered or Unknown issuer, with the on-chain proof.</p>
        </Link>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>How it works</h2>
          <ol className="steps">
            <li><b>Sign.</b> The university signs the credential with its DID key (a W3C Verifiable Credential).</li>
            <li><b>Anchor.</b> Only the credential&apos;s hash goes on-chain, from an approved issuer wallet.</li>
            <li><b>Share.</b> The student gets a QR code holding the signed credential.</li>
            <li><b>Verify.</b> The scanner checks the signature, then the blockchain record and revocation status.</li>
          </ol>
        </div>
        <div className="card">
          <h2>Live deployment</h2>
          <table className="kv"><tbody>
            <tr><th>Network</th><td style={{ textTransform: "capitalize" }}>{config.networkName} (chain {config.chainId})</td></tr>
            <tr><th>IssuerRegistry</th><td><Addr a={config.issuerRegistry} /></td></tr>
            <tr><th>CredentialRegistry</th><td><Addr a={config.credentialRegistry} /></td></tr>
            <tr><th>DID registry (ERC-1056)</th><td><Addr a={config.didRegistry} /></td></tr>
          </tbody></table>
          <p className="muted small" style={{ marginTop: 12 }}>No personal data is stored on-chain. Only hashes, the issuer address and timestamps.</p>
        </div>
      </section>
    </>
  );
}
