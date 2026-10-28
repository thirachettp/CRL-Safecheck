"use client";
// QR สำหรับให้ผู้ร่วมซ้อมสแกนไปรีวิว: โชว์หลังจบการซ้อม และอยู่ในแท็บรีวิวของ Admin
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { IClose } from "./Icons";

export default function ReviewQR({ incidentId, title = "ซ้อมเสร็จแล้ว ให้ทุกคนสแกนเพื่อรีวิว" }: { incidentId?: number; title?: string }) {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const u = `${window.location.origin}/feedback${incidentId ? `?i=${incidentId}` : ""}`;
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#17191C", light: "#FFFFFF" } }).then(setSvg).catch(() => {});
  }, [incidentId]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMsg("คัดลอกลิงก์แล้ว"); }
    catch { setMsg("คัดลอกไม่ได้ เลือกลิงก์แล้วคัดลอกเอง"); }
    setTimeout(() => setMsg(null), 2500);
  }
  async function download() {
    const png = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a");
    a.href = png; a.download = "CRL-SafeCheck-Review-QR.png"; a.click();
  }
  if (!url) return null;
  return (
    <>
      <div className="card row" style={{ padding: 14, gap: 14, flexWrap: "nowrap" }}>
        <button type="button" onClick={() => setOpen(true)} aria-label="ขยาย QR code" className="qr-thumb" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{title}</b>
          <div className="muted xs mono" style={{ marginTop: 2, wordBreak: "break-all" }}>{url.replace(/^https?:\/\//, "")}</div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button className="btn btn-sm btn-pri" onClick={() => setOpen(true)}>ขยาย QR</button>
            <button className="btn btn-sm" onClick={copy}>คัดลอกลิงก์</button>
            <button className="btn btn-sm" onClick={download}>ดาวน์โหลด QR</button>
          </div>
          {msg && <div className="xs" style={{ marginTop: 6, color: "#166534", fontWeight: 600 }}>{msg}</div>}
        </div>
      </div>
      {open && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="row" style={{ width: "100%" }}><b className="grow" style={{ fontSize: 17, textAlign: "left" }}>สแกนเพื่อรีวิว SafeCheck</b>
              <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={() => setOpen(false)} aria-label="ปิด"><IClose size={16} /></button></div>
            <div className="qr-big" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="mono small" style={{ wordBreak: "break-all" }}>{url}</div>
            <p className="muted xs" style={{ margin: 0 }}>ไม่ต้องเข้าสู่ระบบ ใช้เวลาประมาณ 3 นาที</p>
          </div>
        </div>
      )}
    </>
  );
}
