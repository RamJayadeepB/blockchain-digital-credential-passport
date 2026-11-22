"use client";
const LABEL = { VALID: "Valid", REVOKED: "Revoked", TAMPERED: "Tampered", UNKNOWN_ISSUER: "Unknown issuer", LOADING: "Checking…", NOT_FOUND: "Not on-chain" };
export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status || "LOADING"}`}>{LABEL[status] || status || "Checking…"}</span>;
}
