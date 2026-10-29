"use client";
// เมนูหลักชุดเดียว ใช้ทั้ง PC (แถบบน) และมือถือ (แถบล่าง + เมนูเพิ่มเติม) ลำดับ/ชื่อ/ไอคอนเหมือนกัน
import { IAlert, ISearch, IFlag, IChart, IPlus, IDb, IGear } from "./Icons";
import type { Role } from "./identity";

export type NavItem = { href: string; match: string; label: string; icon: (p: { size?: number }) => React.ReactElement; roles?: Role[]; primary?: boolean };

export const NAV: NavItem[] = [
  { href: "/?stay=1", match: "/", label: "หน้าแรก", icon: IAlert, primary: true },
  { href: "/search", match: "/search", label: "ค้นหาคน", icon: ISearch, primary: true },
  { href: "/review", match: "/review", label: "ตรวจทานธง", icon: IFlag, primary: true },
  { href: "/dashboard", match: "/dashboard", label: "Dashboard", icon: IChart, primary: true },
  { href: "/injury", match: "/injury", label: "ผู้บาดเจ็บ", icon: IPlus, roles: ["admin", "safety"] },
  { href: "/sources", match: "/sources", label: "แหล่งข้อมูล", icon: IDb, roles: ["admin"] },
  { href: "/admin", match: "/admin", label: "ตั้งค่า", icon: IGear, roles: ["admin"] },
];

export const isOn = (it: NavItem, path: string) => (it.match === "/" ? path === "/" : path.startsWith(it.match));
export const allowed = (it: NavItem, role: Role | null) => !it.roles || (!!role && it.roles.includes(role));
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", safety: "Safety Officer", lp: "Loss Prevention", user: "ผู้ใช้ทั่วไป" };
