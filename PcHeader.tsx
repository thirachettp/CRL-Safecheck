"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IFlag, ILock } from "./Icons";
import { useAdmin } from "./identity";

const TABS = [
  { href: "/admin", label: "ตั้งค่า" },
  { href: "/review", label: "ตรวจทานธง" },
  { href: "/search", label: "ค้นหา" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sources", label: "แหล่งข้อมูล" },
];

export default function PcHeader() {
  const path = usePathname();
  const { admin, lock } = useAdmin();
  return (
    <header className="pc-header">
      <Link href="/" className="brand"><IFlag size={26} color="#1F3A5F" />CRL SafeCheck</Link>
      <nav className="tabs" aria-label="เมนูหลัก">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`tab${path.startsWith(t.href) ? " on" : ""}`}
            aria-current={path.startsWith(t.href) ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <div className="grow" />
      {admin ? (
        <button className="chip grey" style={{ fontSize: 13, padding: "6px 12px", border: 0, cursor: "pointer", font: "inherit", fontWeight: 600 }}
          onClick={lock} title="ล็อกรหัส">
          <ILock size={14} />{admin.role === "admin" ? "Admin" : "Safety Officer"} · {admin.name} · ล็อก
        </button>
      ) : (
        <span className="chip grey" style={{ fontSize: 13, padding: "6px 12px" }}><ILock size={14} />Admin · เข้าด้วยรหัส</span>
      )}
    </header>
  );
}
