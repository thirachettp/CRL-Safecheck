"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MobileShell from "@/components/MobileShell";
import LoginSheet, { NewPassword, pwProblem } from "@/components/LoginSheet";
import ProfileFields, { ProfileForm, toForm, problems } from "@/components/ProfileFields";
import { useUser } from "@/components/identity";
import { api } from "@/components/lib";
import { IBack } from "@/components/Icons";
import { NotifyCard } from "@/components/Notify";

const ROLE: Record<string, [string, string]> = { admin: ["err", "Admin"], safety: ["warn", "Safety Officer"], user: ["grey", "ผู้ใช้ทั่วไป"] };

export default function ProfilePage() {
  const router = useRouter();
  const { user, ready, remember, logout, changePassword } = useUser();
  const [f, setF] = useState<ProfileForm | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ k: string; t: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    api(`/api/profile`)
      .then((r: any) => setF(toForm({ ...r.profile, code: user.code })))
      .catch(() => setF(toForm({ code: user.code })));
  }, [user?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!f || !user) return;
    const miss = problems(f);
    if (miss.length) return setMsg({ k: "err", t: `กรอกให้ครบ: ${miss.join(", ")}` });
    setBusy(true);
    try {
      const r = await api<{ name: string }>("/api/profile", { method: "POST", json: f });
      remember({ name: r.name });
      setMsg({ k: "ok", t: "บันทึกแล้ว" });
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
    finally { setBusy(false); }
  }
  async function delMedical() {
    await api("/api/profile", { method: "POST", json: { action: "delete-medical" } });
    setF({ ...f!, consent: false, blood: "" });
    setMsg({ k: "ok", t: "ลบข้อมูลทางการแพทย์แล้ว" });
  }
  async function savePw() {
    setPwMsg(null);
    if (pwProblem(pw, user!.code) || pw !== pw2) return setPwMsg({ k: "err", t: "ตรวจรหัสผ่านใหม่อีกครั้ง" });
    try {
      await changePassword(oldPw, pw);
      setPwMsg({ k: "ok", t: "เปลี่ยนรหัสผ่านแล้ว เครื่องอื่นที่เคยเข้าไว้จะต้องเข้าสู่ระบบใหม่" });
      setOldPw(""); setPw(""); setPw2("");
    } catch (e: any) { setPwMsg({ k: "err", t: e.message }); }
  }

  return (
    <MobileShell>
      <div className="m-top row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <Link href="/" className="back" aria-label="กลับ"><IBack /></Link>
        <b className="grow">โปรไฟล์ของฉัน</b>
        {user && <button className="lk" onClick={() => { logout(); router.push("/"); }}>ออกจากระบบ</button>}
      </div>
      {ready && !user && <LoginSheet onClose={() => router.push("/")} />}
      {user && f && (
        <>
          <div className="m-body" style={{ padding: 14, gap: 14 }}>
            <div className="row" style={{ padding: "0 4px", gap: 8 }}>
              <span className="muted small grow">ช่องที่มี * จำเป็น · ใช้ระบุตัวตนและช่วยค้นหาตอนเกิดเหตุเท่านั้น</span>
              <span className={`chip sm ${ROLE[user.role]?.[0] ?? "grey"}`}>{ROLE[user.role]?.[1] ?? user.role}</span>
            </div>
            <NotifyCard />
            <ProfileFields f={f} set={setF} codeLocked onDeleteMedical={delMedical} />

            <div className="card stack" style={{ padding: 16 }}>
              <div className="row"><b className="grow">รหัสผ่าน</b>
                <button className="lk boxed" onClick={() => { setPwOpen(!pwOpen); setPwMsg(null); }}>{pwOpen ? "ยกเลิก" : "เปลี่ยนรหัสผ่าน"}</button></div>
              {pwOpen && (
                <>
                  <label className="lb" style={{ fontSize: 13 }}>รหัสผ่านปัจจุบัน
                    <input className="in" type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
                  </label>
                  <NewPassword code={user.code} pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} show={false} />
                  {pwMsg && <p className={`notice ${pwMsg.k}`}>{pwMsg.t}</p>}
                  <button className="btn btn-pri" onClick={savePw} disabled={!oldPw || !pw}>บันทึกรหัสผ่านใหม่</button>
                </>
              )}
              {!pwOpen && pwMsg && <p className={`notice ${pwMsg.k}`}>{pwMsg.t}</p>}
            </div>
            {msg && <p className={`notice ${msg.k}`}>{msg.t}</p>}
          </div>
          <div className="m-foot"><button className="btn btn-pri btn-block" style={{ minHeight: 50 }} onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div>
        </>
      )}
    </MobileShell>
  );
}
