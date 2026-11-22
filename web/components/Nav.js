import Link from "next/link";
import { config } from "@/lib/config";

export default function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand"><span className="brand-mark">◈</span> Credential Passport</Link>
        <nav className="nav-links">
          <Link href="/issuer">Issuer</Link>
          <Link href="/passport">Student passport</Link>
          <Link href="/verify">Verify</Link>
          <span className="net" title="Network this site is connected to">{config.networkName}</span>
        </nav>
      </div>
    </header>
  );
}
