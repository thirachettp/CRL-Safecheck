"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MobileShell from "@/components/MobileShell";
import LoginSheet from "@/components/LoginSheet";
import { useUser } from "@/components/identity";
import { api } from "@/components/lib";
import { IBack, ILock, ICheck } from "@/components/Icons";

export default function ProfilePage() {
  const router = useRouter();
  const { user, ready, login, logout } = useUser();
  const [f, setF] = useState({ name: "", gender: "", tel: "", emer_name: "", emer_tel: "", consent: false, blood: "" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    api(`/api/profile?code=${encodeURIComponent(user.code)}`).then((r: any) => {
      const p = r.profile ?? {}, pl = r.plan ?? {};
      setF({ name: p.name ?? pl.name ?? user.name, gender: p.gender ?? pl.gender ?? "", tel: p.tel ?? pl.tel ?? "",
        emer_name: p.emer_name ?? "", emer_tel: p.emer_tel ?? "", consent: !!p.consent_at, blood: p.blood ?? "" });
    }).catch(() => {});
  }, [user]);

  async function save() {
    try {
      await api("/api/profile", { method: "POST", json: { code: user!.code, ...f } });
      setMsg({ k: "ok", t: "บันทึกแล้ว" });
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function delMedical() {
    await api("/api/profile", { method: "POST", json: { code: user!.code, action: "delete-medical" } });
    setF({ ...f, consent: false, blood: "" });
    setMsg({ k: "ok", t: "ลบข้อมูลทางการแพทย์แล้ว" });
  }

  return (
    <MobileShell>
      <div className="m-top row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <Link href="/" className="back" aria-label="กลับ"><IBack /></Link>
        <b className="grow">โปรไฟล์ของฉัน</b>
        {user && <button className="lk" onClick={() => { logout(); router.push("/"); }}>ออกจากระบบ</button>}
      </div>
      {ready && !user && <LoginSheet onLogin={login} onClose={() => router.push("/")} />}
      {user && (
        <>
          <div className="m-body" style={{ padding: 14, gap: 14 }}>
            <p className="muted small" style={{ padding: "0 4px" }}>ไม่บังคับ · ต้อง login เฉพาะตอนแจ้งเหตุ · ข้อมูลนี้ใช้เสริมตอนเกิดเหตุเท่านั้น</p>
            <div className="card stack" style={{ padding: 16 }}>
              <b>ข้อมูลพนักงาน</b>
              <label className="lb" style={{ fontSize: 13 }}>รหัสพนักงาน<input className="in mono" value={user.code} disabled style={{ background: "var(--bg)", color: "var(--muted)" }} /></label>
              <div className="muted xs" style={{ marginTop: -6 }}>ผูกกับรหัสที่ใช้เข้าสู่ระบบ · แก้ไม่ได้</div>
              <label className="lb" style={{ fontSize: 13 }}>ชื่อ-นามสกุล<input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <div className="lb" style={{ fontSize: 13 }}>เพศ
                <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "nowrap" }}>
                  {["ชาย", "หญิง", "ไม่ระบุ"].map((g) => <button key={g} className={`seg${f.gender === g ? " on" : ""}`} onClick={() => setF({ ...f, gender: g })}>{g}</button>)}
                </div>
              </div>
              <label className="lb" style={{ fontSize: 13 }}>เบอร์โทร<input className="in" inputMode="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} /></label>
            </div>
            <div className="card stack" style={{ padding: 16 }}>
              <b>ผู้ติดต่อฉุกเฉิน</b>
              <label className="lb" style={{ fontSize: 13 }}>ชื่อ / ความสัมพันธ์<input className="in" placeholder="เช่น สมศรี · คุณแม่" value={f.emer_name} onChange={(e) => setF({ ...f, emer_name: e.target.value })} /></label>
              <label className="lb" style={{ fontSize: 13 }}>เบอร์โทร<input className="in" inputMode="tel" placeholder="08x-xxx-xxxx" value={f.emer_tel} onChange={(e) => setF({ ...f, emer_tel: e.target.value })} /></label>
            </div>
            <div className="card stack" style={{ padding: 16, borderColor: "#FCA5A5" }}>
              <div className="row"><ILock size={18} color="#9F1239" /><b className="grow">ข้อมูลทางการแพทย์</b><span className="chip sm err">ข้อมูลอ่อนไหว</span></div>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <button className={`ck${f.consent ? " on" : ""}`} style={{ width: 28, height: 28, borderRadius: 7, background: f.consent ? "#1F3A5F" : undefined, borderColor: f.consent ? "#1F3A5F" : undefined }}
                  aria-pressed={f.consent} aria-label="ยินยอมให้เก็บข้อมูลทางการแพทย์" onClick={() => setF({ ...f, consent: !f.consent })}><ICheck size={16} /></button>
                <div className="small">ยินยอมให้เก็บกรุ๊ปเลือด เพื่อใช้เฉพาะตอนเกิดเหตุฉุกเฉิน · เห็นได้เฉพาะ Admin / Safety Officer ในหน้าผู้บาดเจ็บระหว่างเหตุการณ์ · ลบได้ทุกเมื่อ</div>
              </div>
              {f.consent && (
                <>
                  <div className="lb" style={{ fontSize: 13 }}>กรุ๊ปเลือด</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                    {["A", "B", "AB", "O"].map((b) => <button key={b} className={`rs${f.blood === b ? " on" : ""}`} style={{ height: 44, borderRadius: 10 }} onClick={() => setF({ ...f, blood: b })}>{b}</button>)}
                  </div>
                  <button className="lk del" style={{ alignSelf: "flex-start", padding: 0 }} onClick={delMedical}>ลบข้อมูลทางการแพทย์ทั้งหมด</button>
                </>
              )}
            </div>
            {msg && <p className={`notice ${msg.k}`}>{msg.t}</p>}
          </div>
          <div className="m-foot"><button className="btn btn-pri btn-block" style={{ minHeight: 50 }} onClick={save}>บันทึก</button></div>
        </>
      )}
    </MobileShell>
  );
}
