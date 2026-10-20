"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IFlag, ILock, IUser, IDown } from "./Icons";
import { useAdmin, useUser, type Role } from "./identity";
import { NAV, isOn, allowed, ROLE_LABEL } from "./nav";
import LoginSheet from "./LoginSheet";
import BottomNav from "./BottomNav";

/** บทบาทที่ใช้งานอยู่ในเครื่องนี้ตอนนี้ (บัญชี หรือ PIN) */
export function useRole(): Role | null {
  const { user } = useUser();
  const { admin } = useAdmin();
  return admin?.role ?? user?.role ?? null;
}

/** หัวหน้าเว็บ · solo = หน้าที่ไม่ได้อยู่ใน MobileShell (มือถือจะแสดงแถบบนแบบย่อ + เมนูล่าง) */
export default function PcHeader({ solo = true }: { solo?: boolean }) {
  const path = usePathname();
  const role = useRole();
  return (
    <>
      <header className={`pc-header${solo ? " solo" : ""}`}>
        <Link href="/?stay=1" className="brand"><IFlag size={26} color="#1F3A5F" />CRL SafeCheck</Link>
        <nav className="tabs pc-nav" aria-label="เมนูหลัก">
          {NAV.map((t) => {
            const on = isOn(t, path);
            const ok = allowed(t, role);
            return (
              <Link key={t.href} href={t.href} className={`tab${on ? " on" : ""}${ok ? "" : " locked"}`} aria-current={on ? "page" : undefined}
                title={ok ? undefined : `เฉพาะ ${t.roles!.map((r) => ROLE_LABEL[r]).join(" / ")}`}>
                {t.label}{!ok && <ILock size={12} />}
              </Link>
            );
          })}
        </nav>
        <div className="grow" />
        <AccountButton />
      </header>
      {solo && <BottomNav />}
    </>
  );
}

/** ปุ่มบัญชีมุมขวาบน: เข้าสู่ระบบ / ชื่อ · บทบาท ▾ (โปรไฟล์, ออกจากระบบ) */
export function AccountButton() {
  const router = useRouter();
  const { user, ready, logout } = useUser();
  const { admin, lock } = useAdmin();
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!ready) return <span style={{ width: 120 }} />;
  const pinOnly = admin && !admin.viaAccount;
  if (!user && !pinOnly) {
    return (
      <>
        <button className="acct" onClick={() => setLogin(true)}><IUser size={16} />เข้าสู่ระบบ</button>
        {login && <LoginSheet onClose={() => setLogin(false)} />}
      </>
    );
  }
  const name = user?.name ?? admin!.name;
  const role = (admin?.role ?? user?.role)!;
  return (
    <div className="acct-wrap" ref={box}>
      <button className={`acct${role !== "user" ? " staff" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <IUser size={16} /><span className="ellip" style={{ maxWidth: 160 }}>{name}</span>
        <span className={`chip sm ${role === "admin" ? "err" : role === "safety" ? "warn" : "grey"}`}>{pinOnly ? `PIN ${ROLE_LABEL[role]}` : ROLE_LABEL[role]}</span>
        <IDown size={14} />
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="muted xs" style={{ padding: "8px 12px 4px" }}>
            {pinOnly ? "เข้าด้วย PIN · หมดอายุใน 12 ชม. หรือเมื่อปิดแท็บ" : `รหัส ${user!.code}${role !== "user" ? " · สิทธิ์ " + ROLE_LABEL[role] + " หมดอายุใน 12 ชม." : ""}`}
          </div>
          {user && <Link href="/profile" className="acct-i" onClick={() => setOpen(false)}>โปรไฟล์ของฉัน</Link>}
          {!user && <button className="acct-i" onClick={() => { setOpen(false); setLogin(true); }}>เข้าสู่ระบบด้วยบัญชี</button>}
          {pinOnly && user && <button className="acct-i" onClick={() => { lock(); setOpen(false); }}>ล็อก PIN</button>}
          <button className="acct-i del" onClick={() => { setOpen(false); if (user) logout(); else lock(); router.push("/?stay=1"); }}>
            {user ? "ออกจากระบบ" : "ล็อก PIN"}
          </button>
        </div>
      )}
      {login && <LoginSheet onClose={() => setLogin(false)} />}
    </div>
  );
}
