"use client";
import { useState } from "react";
import { IClose } from "./Icons";

/** เข้าสู่ระบบด้วยรหัสพนักงาน (ต้นแบบ ยังไม่ใช่ Microsoft SSO) */
export default function LoginSheet({ onLogin, onClose }: { onLogin: (code: string) => Promise<unknown>; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onLogin(code.trim());
      onClose();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={go}>
        <div className="row">
          <b className="grow" style={{ fontSize: 17 }}>เข้าสู่ระบบ</b>
          <button type="button" className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button>
        </div>
        <label className="lb">รหัสพนักงาน
          <input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus placeholder="เช่น 20076487" />
        </label>
        <p className="muted xs">ใช้ระบุว่าใครแจ้งเหตุและใครระบุสถานะ ระบบจำไว้ในเครื่องนี้</p>
        {err && <p className="notice err">{err}</p>}
        <button className="btn btn-pri btn-lg" type="submit" disabled={busy || !code.trim()}>{busy ? "กำลังตรวจ…" : "เข้าสู่ระบบ"}</button>
      </form>
    </div>
  );
}
