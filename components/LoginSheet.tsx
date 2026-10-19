"use client";
import { useState } from "react";
import { IClose } from "./Icons";
import ProfileFields, { ProfileForm, toForm, problems } from "./ProfileFields";

/**
 * เข้าสู่ระบบด้วยรหัสพนักงาน (ต้นแบบ ยังไม่ใช่ Microsoft SSO)
 * ถ้ายังไม่มีบัญชี → เปิดฟอร์มลงทะเบียน (ข้อมูลตามหน้าโปรไฟล์ 2b) โดยเติมค่าจากแผนอพยพให้ก่อน
 */
export default function LoginSheet({ onLogin, onRegister, onClose }: {
  onLogin: (code: string) => Promise<unknown>;
  onRegister: (f: ProfileForm) => Promise<unknown>;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"code" | "register">("code");
  const [f, setF] = useState<ProfileForm>(toForm(null));
  const [inPlan, setInPlan] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onLogin(code.trim());
      onClose();
    } catch (x: any) {
      if (x.status === 404 && x.data?.needRegister) {
        setF(toForm({ ...x.data.prefill, code: code.trim() }));
        setInPlan(!!x.data.inPlan);
        setStep("register");
      } else setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems(f).length) return;
    setBusy(true);
    setErr(null);
    try {
      await onRegister({ ...f, code: f.code.trim(), email: f.email.trim() });
      onClose();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  const miss = tried ? problems(f) : [];
  const close = (
    <button type="button" className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button>
  );

  if (step === "register")
    return (
      <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <form className="sheet" onSubmit={submit} style={{ background: "var(--bg)", maxHeight: "94dvh" }} noValidate>
          <div className="row">
            <b className="grow" style={{ fontSize: 17 }}>สร้างบัญชีใหม่</b>
            {close}
          </div>
          <p className="muted small">
            ยังไม่มีบัญชีสำหรับรหัส <b className="mono">{code.trim()}</b> กรอกข้อมูลครั้งเดียว ใช้ระบุตัวตนตอนแจ้งเหตุและช่วยค้นหาตัวตอนเกิดเหตุ
            {inPlan ? " · เติมข้อมูลจากชุดธงให้แล้ว ตรวจและแก้ให้ถูกต้อง" : ""}
          </p>
          <ProfileFields f={f} set={setF} />
          {miss.length > 0 && <p className="notice err">กรอกให้ครบ: {miss.join(", ")}</p>}
          {err && <p className="notice err">{err}</p>}
          <div className="row" style={{ gap: 8, flexWrap: "nowrap", position: "sticky", bottom: -16, background: "var(--bg)", padding: "8px 0 4px" }}>
            <button type="button" className="btn" onClick={() => { setStep("code"); setErr(null); setTried(false); }}>ย้อนกลับ</button>
            <button className="btn btn-pri btn-lg grow" type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "สร้างบัญชีและเข้าสู่ระบบ"}</button>
          </div>
        </form>
      </div>
    );

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={go}>
        <div className="row">
          <b className="grow" style={{ fontSize: 17 }}>เข้าสู่ระบบ</b>
          {close}
        </div>
        <label className="lb">รหัสพนักงาน
          <input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus placeholder="เช่น 20076487" />
        </label>
        <p className="muted xs">ใช้ระบุว่าใครแจ้งเหตุและใครระบุสถานะ ระบบจำไว้ในเครื่องนี้ · ยังไม่มีบัญชี ระบบจะพาไปลงทะเบียน</p>
        {err && <p className="notice err">{err}</p>}
        <button className="btn btn-pri btn-lg" type="submit" disabled={busy || !code.trim()}>{busy ? "กำลังตรวจ…" : "ถัดไป"}</button>
      </form>
    </div>
  );
}
