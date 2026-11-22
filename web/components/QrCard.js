"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrCard({ value, size = 360, filename = "credential-qr.png" }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: "L", margin: 2, width: size }).then((u) => live && setSrc(u)).catch(() => {});
    return () => { live = false; };
  }, [value, size]);
  if (!src) return <div className="qr qr-empty" style={{ width: size, height: size }}>Generating QR…</div>;
  return (
    <div className="qr-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={src} alt="QR code containing the signed credential" width={size} height={size} />
      <a className="link small" href={src} download={filename}>Download QR image</a>
    </div>
  );
}
