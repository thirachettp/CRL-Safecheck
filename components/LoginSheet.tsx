"use client";
import { useState } from "react";
import { IClose } from "./Icons";
import ProfileFields, { ProfileForm, toForm, problems } from "./ProfileFields";
import { useUser } from "./identity";

type Step = "code" | "password" | "setup" | "register" | "change";

/** ไม่บังคับรูปแบบ (เซิร์ฟเวอร์ตรวจซ้ำ) */
export function pwProblem(pw: string, _code: string) {
  if (!pw.length) return "กรอกรหัสผ่าน";
  if (pw.length > 128) return "ยาวเกินไป";
  return null;
}

/** ช่องตั้งรหัสผ่าน + ยืนยัน */
export function NewPassword({ code, pw, setPw, pw2, setPw2, show }: {
  code: string; pw: string; setPw: (v: string) => void; pw2: string; setPw2: (v: string) => void; show: boolean;
}) {
  const p = pw ? pwProblem(pw, code) : null;
  const mismatch = !!pw2 && pw !== pw2;
  return (
    <div className="card stack" style={{ padding: 16 }}>
      <b>ตั้งรหัสผ่าน</b>
      <label className="lb" style={{ fontSize: 13 }}>รหัสผ่านใหม่ <span style={{ color: "#9F1239" }}>*</span>
        <input className="in" type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <div className="xs" style={{ marginTop: -6, color: p ? "#9F1239" : "var(--muted)" }}>{p ?? "ตั้งอะไรก็ได้ที่จำได้"}</div>
      <label className="lb" style={{ fontSize: 13 }}>ยืนยันรหัสผ่าน <span style={{ color: "#9F1239" }}>*</span>
        <input className="in" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </label>
      {mismatch && <div className="xs" style={{ marginTop: -6, color: "#9F1239" }}>รหัสผ่านไม่ตรงกัน</div>}
    </div>
  );
}

/**
 * เข้าสู่ระบบด้วยรหัสพนักงาน + รหัสผ่าน
 * ยังไม่มีบัญชี → ลงทะเบียน (ข้อมูลตามหน้าโปรไฟล์ 2b + ตั้งรหัสผ่าน)
 * บัญชีเก่าที่ยังไม่มีรหัสผ่าน → ยืนยันอีเมลแล้วตั้งรหัสผ่าน
 * Admin รีเซ็ตรหัสผ่านให้ → เข้าด้วยรหัสชั่วคราว แล้วต้องตั้งรหัสใหม่
 */
export default function LoginSheet({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { check, login, setup, register, changePassword } = useUser();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [f, setF] = useState<ProfileForm>(toForm(null));
  const [inPlan, setInPlan] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const c = code.trim();
  const done = () => { onDone?.(); onClose(); };

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(null);
    try { await fn(); } catch (x: any) {
      if (x.status === 404 && x.data?.needRegister) { setF(toForm({ ...x.data.prefill, code: c })); setInPlan(!!x.data.inPlan); setStep("register"); }
      else if (x.status === 409 && x.data?.needSetup) setStep("setup");
      else setErr(x.message);
    } finally { setBusy(false); }
  }
  const go = (s: Step) => { setStep(s); setErr(null); setPw(""); setPw2(""); setTried(false); };
  const pwOk = !pwProblem(pw, c) && pw === pw2;

  const close = (
    <button type="button" className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button>
  );
  const head = (t: string) => <div className="row"><b className="grow" style={{ fontSize: 17 }}>{t}</b>{close}</div>;
  const showPw = (
    <label className="row xs muted" style={{ gap: 6 }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> แสดงรหัสผ่าน</label>
  );
  const errBox = err && <p className="notice err">{err}</p>;

  if (step === "register") {
    const miss = tried ? problems(f) : [];
    return (
      <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <form className="sheet" style={{ background: "var(--bg)", maxHeight: "94dvh" }} noValidate
          onSubmit={(e) => { e.preventDefault(); setTried(true); if (problems(f).length || !pwOk) return;
            run(async () => { await register({ ...f, code: f.code.trim(), email: f.email.trim(), password: pw }); done(); }); }}>
          {head("สร้างบัญชีใหม่")}
          <p className="muted small">
            ยังไม่มีบัญชีสำหรับรหัส <b className="mono">{c}</b> กรอกข้อมูลครั้งเดียว ใช้ระบุตัวตนตอนแจ้งเหตุและช่วยค้นหาตัวตอนเกิดเหตุ
            {inPlan ? " · เติมข้อมูลจากชุดธงให้แล้ว ตรวจและแก้ให้ถูกต้อง" : ""}
          </p>
          <ProfileFields f={f} set={setF} />
          <NewPassword code={f.code.trim()} pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} show={show} />
          {showPw}
          {miss.length > 0 && <p className="notice err">กรอกให้ครบ: {miss.join(", ")}</p>}
          {tried && !pwOk && <p className="notice err">ตรวจรหัสผ่านอีกครั้ง</p>}
          {errBox}
          <div className="row" style={{ gap: 8, flexWrap: "nowrap", position: "sticky", bottom: -16, background: "var(--bg)", padding: "8px 0 4px" }}>
            <button type="button" className="btn" onClick={() => go("code")}>ย้อนกลับ</button>
            <button className="btn btn-pri btn-lg grow" type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "สร้างบัญชีและเข้าสู่ระบบ"}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {step === "code" && (
        <form className="sheet" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await check(c); setStep(r.next); }); }}>
          {head("เข้าสู่ระบบ")}
          <label className="lb">รหัสพนักงาน (หรือ admin)
            <input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoComplete="username" autoFocus placeholder="เช่น 20076487" />
          </label>
          <p className="muted xs">ยังไม่มีบัญชี ระบบจะพาไปลงทะเบียน</p>
          {errBox}
          <button className="btn btn-pri btn-lg" type="submit" disabled={busy || !c}>{busy ? "กำลังตรวจ…" : "ถัดไป"}</button>
        </form>
      )}

      {step === "password" && (
        <form className="sheet" onSubmit={(e) => { e.preventDefault(); run(async () => {
          const u = await login(c, pw);
          if (u.mustChange) { setOldPw(pw); go("change"); } else done();
        }); }}>
          {head("เข้าสู่ระบบ")}
          <div className="small">รหัสพนักงาน <b className="mono">{c}</b> <button type="button" className="lk" onClick={() => go("code")}>เปลี่ยน</button></div>
          <input type="text" name="username" autoComplete="username" value={c} readOnly hidden />
          <label className="lb">รหัสผ่าน
            <input className="in" type={show ? "text" : "password"} autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          {showPw}
          <p className="muted xs">ลืมรหัสผ่าน ให้ Admin รีเซ็ตให้ จะได้รหัสชั่วคราวไว้เข้าครั้งเดียว</p>
          {errBox}
          <button className="btn btn-pri btn-lg" type="submit" disabled={busy || !pw}>{busy ? "กำลังตรวจ…" : "เข้าสู่ระบบ"}</button>
        </form>
      )}

      {step === "setup" && (
        <form className="sheet" style={{ background: "var(--bg)" }} onSubmit={(e) => { e.preventDefault(); setTried(true); if (!pwOk) return;
          run(async () => { await setup(c, email.trim(), pw); done(); }); }}>
          {head("ตั้งรหัสผ่านครั้งแรก")}
          <p className="muted small">บัญชี <b className="mono">{c}</b> ลงทะเบียนไว้ก่อนมีรหัสผ่าน ยืนยันด้วยอีเมลที่ใช้ลงทะเบียน แล้วตั้งรหัสผ่าน</p>
          <div className="card stack" style={{ padding: 16 }}>
            <label className="lb" style={{ fontSize: 13 }}>อีเมลที่ลงทะเบียนไว้
              <input className="in" type="email" autoComplete="email" placeholder="ชื่อ@central.co.th" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <NewPassword code={c} pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} show={show} />
          {showPw}
          {tried && !pwOk && <p className="notice err">ตรวจรหัสผ่านอีกครั้ง</p>}
          {errBox}
          <button className="btn btn-pri btn-lg" type="submit" disabled={busy || !email.trim()}>{busy ? "กำลังบันทึก…" : "ตั้งรหัสผ่านและเข้าสู่ระบบ"}</button>
        </form>
      )}

      {step === "change" && (
        <form className="sheet" style={{ background: "var(--bg)" }} onSubmit={(e) => { e.preventDefault(); setTried(true); if (!pwOk) return;
          run(async () => { await changePassword(oldPw, pw); done(); }); }}>
          {head("ตั้งรหัสผ่านใหม่")}
          <p className="notice warn">Admin รีเซ็ตรหัสผ่านให้ ต้องตั้งรหัสผ่านใหม่ของตัวเองก่อนใช้งาน</p>
          <NewPassword code={c} pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} show={show} />
          {showPw}
          {tried && !pwOk && <p className="notice err">ตรวจรหัสผ่านอีกครั้ง</p>}
          {errBox}
          <button className="btn btn-pri btn-lg" type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}</button>
        </form>
      )}
    </div>
  );
}
