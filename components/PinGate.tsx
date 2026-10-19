"use client";
import { useState } from "react";
import { ILock } from "./Icons";
import { useAdmin, useUser, type Admin } from "./identity";
import LoginSheet from "./LoginSheet";

/** ขอรหัส Admin / Safety Officer ก่อนแสดงเนื้อหา */
export default function PinGate({ roles = ["admin", "safety"], title, children }: {
  roles?: ("admin" | "safety")[]; title: string; children: (a: Admin) => React.ReactNode;
}) {
  const { admin, ready, unlock } = useAdmin();
  const { user } = useUser();
  const [showLogin, setShowLogin] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!ready) return null;
  if (admin && roles.includes(admin.role)) return <>{children(admin)}</>;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const a = await unlock(pin);
      if (!roles.includes(a.role)) setErr("รหัสนี้ไม่มีสิทธิ์เข้าหน้านี้");
    } catch (x: any) {
      setErr(x.message);
    }
    setPin("");
  }
  return (
    <>
    {showLogin && <LoginSheet onClose={() => setShowLogin(false)} />}
    <form onSubmit={go} className="card" style={{ maxWidth: 420, margin: "40px auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row"><ILock size={20} color="#1F3A5F" /><b style={{ fontSize: 17 }}>{title}</b></div>
      {user ? (
        <p className="notice warn">บัญชี {user.name} ({user.code}) {admin && !roles.includes(admin.role) ? "มีสิทธิ์ไม่พอสำหรับหน้านี้" : "เป็นผู้ใช้ทั่วไป"} · ให้ Admin ปรับบทบาท หรือใช้ PIN</p>
      ) : (
        <>
          <button type="button" className="btn btn-pri btn-lg" onClick={() => setShowLogin(true)}>เข้าสู่ระบบด้วยบัญชี</button>
          <p className="muted xs" style={{ textAlign: "center" }}>บัญชีที่ได้บทบาท {roles.includes("safety") ? "Admin / Safety Officer" : "Admin"} เข้าได้เลย · หรือใช้ PIN ด้านล่าง</p>
        </>
      )}
      <p className="muted small">ใส่ PIN {roles.includes("safety") ? "Admin หรือ Safety Officer" : "Admin"}</p>
      <input className="in mono" type="password" inputMode="numeric" autoComplete="off" value={pin}
        onChange={(e) => setPin(e.target.value)} aria-label="รหัส" style={{ fontSize: 22, letterSpacing: ".3em", height: 52 }} autoFocus />
      {err && <p className="notice err">{err}</p>}
      <button className="btn btn-lg" type="submit" disabled={pin.length < 4}>เข้าด้วย PIN</button>
    </form>
    </>
  );
}
