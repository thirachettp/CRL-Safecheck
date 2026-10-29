"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAdmin, useUser } from "./identity";
import { IMenu, ILock, IUser, IClose } from "./Icons";
import { NAV, isOn, allowed, ROLE_LABEL } from "./nav";
import LoginSheet from "./LoginSheet";

/** เมนูล่างบนมือถือ: 4 เมนูหลักเหมือนแถบบนของ PC + "เมนู" รวมที่เหลือและบัญชี */
export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();
  const { admin, lock } = useAdmin();
  const role = admin?.role ?? user?.role ?? null;
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(false);
  const primary = NAV.filter((n) => n.primary);
  const more = NAV.filter((n) => !n.primary);
  const moreOn = more.some((n) => isOn(n, path)) || path.startsWith("/profile");
  const pinOnly = admin && !admin.viaAccount;
  return (
    <>
      <nav className="bnav" aria-label="เมนูหลัก">
        {primary.map((it) => {
          const on = isOn(it, path);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className={`bnav-i${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
              <Icon size={20} /><span>{it.label}</span>
            </Link>
          );
        })}
        <button className={`bnav-i${moreOn ? " on" : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <IMenu size={20} /><span>เมนู</span>
        </button>
      </nav>
      {open && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" role="dialog" aria-label="เมนู">
            <div className="row"><b className="grow" style={{ fontSize: 17 }}>เมนู</b>
              <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={() => setOpen(false)} aria-label="ปิด"><IClose size={16} /></button></div>
            <div className="card" style={{ padding: 14 }}>
              {user || pinOnly ? (
                <>
                  <div className="row" style={{ gap: 8 }}><IUser size={18} /><b className="grow">{user?.name ?? admin!.name}</b>
                    <span className={`chip sm ${role === "admin" ? "err" : role === "safety" || role === "lp" ? "warn" : "grey"}`}>{pinOnly ? `PIN ${ROLE_LABEL[role!]}` : ROLE_LABEL[role!]}</span></div>
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    {user && <Link href="/profile" className="btn btn-sm grow" onClick={() => setOpen(false)}>โปรไฟล์ของฉัน</Link>}
                    <button className="btn btn-sm grow" style={{ color: "#9F1239" }}
                      onClick={() => { setOpen(false); if (user) logout(); else lock(); router.push("/?stay=1"); }}>{user ? "ออกจากระบบ" : "ล็อก PIN"}</button>
                  </div>
                </>
              ) : (
                <button className="btn btn-pri btn-block" onClick={() => setLogin(true)}>เข้าสู่ระบบ</button>
              )}
            </div>
            <div className="card">
              {more.map((it) => {
                const ok = allowed(it, role);
                const Icon = it.icon;
                return (
                  <Link key={it.href} href={it.href} className={`menu-i${isOn(it, path) ? " on" : ""}`} onClick={() => setOpen(false)}>
                    <Icon size={18} /><span className="grow">{it.label}</span>
                    {!ok && <span className="muted xs row" style={{ gap: 4 }}><ILock size={12} />{it.roles!.map((r) => ROLE_LABEL[r]).join(" / ")}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {login && <LoginSheet onClose={() => { setLogin(false); setOpen(false); }} />}
    </>
  );
}
