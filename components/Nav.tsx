"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "ภาพรวม" },
  { href: "/incidents", label: "เหตุการณ์" },
  { href: "/setup", label: "ข้อมูลธงและการซ้อม" },
  { href: "/sources", label: "แหล่งข้อมูล" },
];

export default function Nav() {
  const path = usePathname();
  // หน้าผู้นำธงใช้เต็มจอบนมือถือ ไม่ต้องมีเมนู
  if (/^\/incidents\/\d+\/flag\//.test(path)) return null;
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden />
        SafeCheck
      </Link>
      <nav className="nav" aria-label="เมนูหลัก">
        {ITEMS.map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
