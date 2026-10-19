"use client";
import { useState } from "react";
import { ILock } from "./Icons";
import { useAdmin, type Admin } from "./identity";

/** ขอรหัส Admin / Safety Officer ก่อนแสดงเนื้อหา */
export default function PinGate({ roles = ["admin", "safety"], title, children }: {
  roles?: ("admin" | "safety")[]; title: string; children: (a: Admin) => React.ReactNode;
}) {
  const { admin, ready, unlock } = useAdmin();
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
    <form onSubmit={go} className="card" style={{ maxWidth: 420, margin: "40px auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row"><ILock size={20} color="#1F3A5F" /><b style={{ fontSize: 17 }}>{title}</b></div>
      <p className="muted small">ใส่รหัส {roles.includes("safety") ? "Admin หรือ Safety Officer" : "Admin"}</p>
      <input className="in mono" type="password" inputMode="numeric" autoComplete="off" value={pin}
        onChange={(e) => setPin(e.target.value)} aria-label="รหัส" style={{ fontSize: 22, letterSpacing: ".3em", height: 52 }} autoFocus />
      {err && <p className="notice err">{err}</p>}
      <button className="btn btn-pri btn-lg" type="submit" disabled={pin.length < 4}>เข้าใช้งาน</button>
    </form>
  );
}
