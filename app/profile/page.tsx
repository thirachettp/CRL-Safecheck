"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MobileShell from "@/components/MobileShell";
import LoginSheet from "@/components/LoginSheet";
import ProfileFields, { ProfileForm, toForm, problems } from "@/components/ProfileFields";
import { useUser } from "@/components/identity";
import { api } from "@/components/lib";
import { IBack } from "@/components/Icons";

export default function ProfilePage() {
  const router = useRouter();
  const { user, ready, login, register, remember, logout } = useUser();
  const [f, setF] = useState<ProfileForm | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api(`/api/profile?code=${encodeURIComponent(user.code)}`)
      .then((r: any) => setF(toForm({ ...r.profile, code: user.code })))
      .catch(() => setF(toForm({ code: user.code })));
  }, [user]);

  async function save() {
    if (!f || !user) return;
    const miss = problems(f);
    if (miss.length) return setMsg({ k: "err", t: `กรอกให้ครบ: ${miss.join(", ")}` });
    setBusy(true);
    try {
      const r = await api<{ code: string; name: string }>("/api/profile", { method: "POST", json: { ...f, code: user.code } });
      remember({ code: r.code, name: r.name });
      setMsg({ k: "ok", t: "บันทึกแล้ว" });
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
    finally { setBusy(false); }
  }
  async function delMedical() {
    await api("/api/profile", { method: "POST", json: { code: user!.code, action: "delete-medical" } });
    setF({ ...f!, consent: false, blood: "" });
    setMsg({ k: "ok", t: "ลบข้อมูลทางการแพทย์แล้ว" });
  }

  return (
    <MobileShell>
      <div className="m-top row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <Link href="/" className="back" aria-label="กลับ"><IBack /></Link>
        <b className="grow">โปรไฟล์ของฉัน</b>
        {user && <button className="lk" onClick={() => { logout(); router.push("/"); }}>ออกจากระบบ</button>}
      </div>
      {ready && !user && <LoginSheet onLogin={login} onRegister={register} onClose={() => router.push("/")} />}
      {user && f && (
        <>
          <div className="m-body" style={{ padding: 14, gap: 14 }}>
            <p className="muted small" style={{ padding: "0 4px" }}>ช่องที่มี * จำเป็น · ข้อมูลนี้ใช้ระบุตัวตนและช่วยค้นหาตอนเกิดเหตุเท่านั้น</p>
            <ProfileFields f={f} set={setF} codeLocked onDeleteMedical={delMedical} />
            {msg && <p className={`notice ${msg.k}`}>{msg.t}</p>}
          </div>
          <div className="m-foot"><button className="btn btn-pri btn-block" style={{ minHeight: 50 }} onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div>
        </>
      )}
    </MobileShell>
  );
}
