"use client";
// แชร์แอปให้คนอื่น: QR code + ลิงก์ + ปุ่มแชร์ของเครื่อง + ดาวน์โหลด QR ไว้พิมพ์ติดบอร์ด
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { IClose } from "./Icons";

export default function ShareApp() {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const u = window.location.origin + "/";
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#17191C", light: "#FFFFFF" } }).then(setSvg).catch(() => {});
  }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMsg("คัดลอกลิงก์แล้ว"); }
    catch { setMsg("คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอกเอง"); }
    setTimeout(() => setMsg(null), 2500);
  }
  async function share() {
    try { await navigator.share({ title: "CRL SafeCheck", text: "แอปนับคนตอนซ้อมอพยพ/เกิดเหตุ CRL SafeCheck ลงทะเบียนด้วยรหัสพนักงาน", url }); }
    catch { /* ผู้ใช้ยกเลิก */ }
  }
  async function download() {
    const png = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a");
    a.href = png; a.download = "CRL-SafeCheck-QR.png"; a.click();
  }
  if (!url) return null;
  const canShare = typeof navigator !== "undefined" && !!(navigator as any).share;
  return (
    <>
      <div className="card row" style={{ padding: 14, gap: 12, flexWrap: "nowrap" }}>
        <button type="button" onClick={() => setOpen(true)} aria-label="ขยาย QR code" className="qr-thumb" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>ชวนคนอื่นใช้แอป</b>
          <div className="muted xs ellip mono" style={{ marginTop: 2 }}>{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {canShare && <button className="btn btn-sm btn-pri" onClick={share}>แชร์</button>}
            <button className="btn btn-sm" onClick={copy}>คัดลอกลิงก์</button>
            <button className="btn btn-sm" onClick={() => setOpen(true)}>QR</button>
          </div>
          {msg && <div className="xs" style={{ marginTop: 6, color: "#166534", fontWeight: 600 }}>{msg}</div>}
        </div>
      </div>
      {open && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="row" style={{ width: "100%" }}><b className="grow" style={{ fontSize: 17, textAlign: "left" }}>สแกนเพื่อเข้าแอป</b>
              <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={() => setOpen(false)} aria-label="ปิด"><IClose size={16} /></button></div>
            <div className="qr-big" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="mono small" style={{ wordBreak: "break-all" }}>{url}</div>
            <p className="muted xs" style={{ margin: 0 }}>เปิดแล้วลงทะเบียนด้วยรหัสพนักงาน · บน iPhone กดแชร์ → “เพิ่มไปยังหน้าจอโฮม” เพื่อใช้แบบแอปและรับแจ้งเตือน</p>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              {canShare && <button className="btn btn-pri" onClick={share}>แชร์</button>}
              <button className="btn" onClick={copy}>คัดลอกลิงก์</button>
              <button className="btn" onClick={download}>ดาวน์โหลด QR (ไว้พิมพ์)</button>
            </div>
            {msg && <div className="xs" style={{ color: "#166534", fontWeight: 600 }}>{msg}</div>}
          </div>
        </div>
      )}
    </>
  );
}
