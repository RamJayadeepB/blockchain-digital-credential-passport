"use client";
import { useEffect, useRef, useState } from "react";

// Camera / image QR scanner built on html5-qrcode (loaded only in the browser).
export default function Scanner({ onResult }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const instance = useRef(null);

  async function start() {
    setError("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      instance.current = new Html5Qrcode("qr-reader");
      setRunning(true);
      await instance.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text) => { stop(); onResult(text); },
        () => {}
      );
    } catch (e) {
      setRunning(false);
      setError(`Could not open the camera: ${e?.message || e}. You can upload a screenshot of the QR instead.`);
    }
  }
  async function stop() {
    try { await instance.current?.stop(); instance.current?.clear(); } catch {}
    setRunning(false);
  }
  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const text = await new Html5Qrcode("qr-reader-file").scanFile(file, false);
      onResult(text);
    } catch {
      setError("No QR code found in that image.");
    }
  }
  useEffect(() => () => { instance.current?.stop?.().catch(() => {}); }, []);

  return (
    <div className="scanner">
      <div id="qr-reader" className={running ? "qr-reader on" : "qr-reader"} />
      <div id="qr-reader-file" style={{ display: "none" }} />
      <div className="row">
        {!running ? <button className="btn" onClick={start}>Scan with camera</button> : <button className="btn btn-ghost" onClick={stop}>Stop camera</button>}
        <label className="btn btn-ghost">
          Upload QR image
          <input type="file" accept="image/*" onChange={onFile} hidden />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
