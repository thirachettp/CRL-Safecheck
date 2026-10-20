"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdmin, useUser } from "./identity";
import { IFlag, ISearch, IPlus, IUser, IAlert } from "./Icons";

/** เมนูล่างบนมือถือ (บน PC ใช้เมนูด้านบน) */
export default function BottomNav() {
  const path = usePathname();
  const { user } = useUser();
  const { admin } = useAdmin();
  const items = [
    { href: "/?stay=1", match: "/", label: "หน้าแรก", icon: <IAlert size={20} /> },
    { href: "/search", match: "/search", label: "ค้นหาคน", icon: <ISearch size={20} /> },
    { href: "/review", match: "/review", label: "ตรวจทานธง", icon: <IFlag size={20} /> },
    ...(admin ? [{ href: "/injury", match: "/injury", label: "ผู้บาดเจ็บ", icon: <IPlus size={20} /> }] : []),
    { href: "/profile", match: "/profile", label: user ? "โปรไฟล์" : "เข้าสู่ระบบ", icon: <IUser size={20} /> },
  ];
  return (
    <nav className="bnav" aria-label="เมนูหลัก">
      {items.map((it) => {
        const on = it.match === "/" ? path === "/" : path.startsWith(it.match);
        return (
          <Link key={it.href} href={it.href} className={`bnav-i${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
            {it.icon}<span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
