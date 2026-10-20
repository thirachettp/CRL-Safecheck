// สิทธิ์ใช้งาน
// 1) บัญชีผู้ใช้ (รหัสพนักงาน + รหัสผ่าน) มีบทบาท user / safety / admin — token อายุ 30 วัน ตรวจบทบาทกับฐานข้อมูลทุกครั้ง
// 2) PIN ของผู้ยืนยัน (ระบบเดิม) ยังใช้ได้ — token อายุ 12 ชม.
// ระบบจริงควรเปลี่ยนเป็น Sign in with Microsoft
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { q, one } from "./db";

export type Role = "admin" | "safety";
export type UserRole = Role | "user";
export type Actor = { id: number; name: string; role: Role; code?: string };
export type Session = { code: string; name: string; role: UserRole };

const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PIN || "dev-only-secret";

export function hashPin(pin: string, salt = randomBytes(8).toString("hex")) {
  return `${salt}:${createHash("sha256").update(`${salt}:${pin}`).digest("hex")}`;
}

function checkPin(pin: string, stored: string | null) {
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  const a = Buffer.from(hashPin(pin, salt).split(":")[1]);
  const b = Buffer.from(h ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

type Payload = { id: number; name: string; role: UserRole; code?: string; v?: number; exp: number };

function readToken(token: string | null): Payload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = createHmac("sha256", secret()).update(body).digest("base64url");
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!p.exp || p.exp < Date.now()) return null;
  return p;
}

/** ใช้เฉพาะ token แบบ PIN (ไม่แตะฐานข้อมูล) */
export function verifyToken(token: string | null): Actor | null {
  const p = readToken(token);
  if (!p || p.code || p.role === "user") return null;
  return { id: p.id, name: p.name, role: p.role };
}

/** รหัสพนักงานที่เป็น Admin เสมอ (ตั้งใน Vercel: ADMIN_CODES=รหัส1,รหัส2) ใช้เปิด Admin คนแรก */
/** บัญชี admin ในตัว: ชื่อผู้ใช้ ADMIN_USER (ค่าตั้งต้น "admin") รหัสผ่าน ADMIN_PASSWORD ตั้งใน Vercel */
export const builtinAdmin = () =>
  process.env.ADMIN_PASSWORD ? (process.env.ADMIN_USER || "admin").trim().toLowerCase() : null;
export const bootstrapAdmins = () => {
  const list = (process.env.ADMIN_CODES ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const b = builtinAdmin();
  return b ? [...list, b] : list;
};
export const effectiveRole = (code: string, dbRole: string | null): UserRole =>
  bootstrapAdmins().includes(code) ? "admin" : (["admin", "safety"].includes(dbRole ?? "") ? (dbRole as Role) : "user");

/** อายุการเข้าสู่ระบบ: ผู้ใช้ทั่วไป 30 วัน · Admin / Safety 12 ชม. (กันเครื่อง PC ส่วนกลางค้างสิทธิ์ Admin) */
export const SESSION_HOURS = { user: 30 * 24, staff: 12 };

export function signUser(s: { code: string; name: string; role: UserRole; pw_ver: number }) {
  const h = s.role === "user" ? SESSION_HOURS.user : SESSION_HOURS.staff;
  return sign({ id: 0, code: s.code, name: s.name, role: s.role, v: s.pw_ver, exp: Date.now() + h * 3600 * 1000 });
}

/** ตรวจ token ของบัญชีผู้ใช้กับฐานข้อมูล (บทบาทปัจจุบัน และรีเซ็ตรหัสผ่านแล้ว token เก่าใช้ไม่ได้) */
export async function sessionOf(req: Request): Promise<Session | null> {
  const p = readToken(req.headers.get("x-admin-token"));
  if (!p?.code) return null;
  const r = await one<any>(`SELECT code, name, role, pw_ver, must_change_pw, email FROM profiles WHERE code = $1 AND password_hash IS NOT NULL`, [p.code]);
  if (!r || r.pw_ver !== (p.v ?? 0)) return null;
  // บัญชี admin ในตัว ใช้ได้เฉพาะตอนที่ยังตั้ง ADMIN_PASSWORD อยู่
  if (String(r.email ?? "").endsWith("@safecheck.local") && r.code !== builtinAdmin()) return null;
  // ยังใช้รหัสชั่วคราวจาก Admin อยู่ = ยังไม่ให้สิทธิ์ Admin/Safety จนกว่าจะตั้งรหัสใหม่
  return { code: r.code, name: r.name || r.code, role: r.must_change_pw ? "user" : effectiveRole(r.code, r.role) };
}

export async function requireUser(req: Request): Promise<Session> {
  const s = await sessionOf(req);
  if (!s) {
    const e: any = new Error("ต้องเข้าสู่ระบบก่อน");
    e.status = 401;
    throw e;
  }
  return s;
}

/** ตรวจ PIN: ผู้ยืนยันในระบบ หรือ ADMIN_PIN จาก env (ใช้ตั้งค่าครั้งแรก) */
export async function login(pin: string) {
  pin = String(pin ?? "").trim();
  if (pin.length < 4) return null;
  const rows = await q<any>(`SELECT id, name, role, pin_hash FROM confirmers`);
  let actor: Actor | null = null;
  for (const r of rows) if (checkPin(pin, r.pin_hash)) actor = { id: r.id, name: r.name, role: r.role };
  if (!actor && process.env.ADMIN_PIN && pin === process.env.ADMIN_PIN) actor = { id: 0, name: "Admin", role: "admin" };
  if (!actor) return null;
  return { ...actor, token: sign({ ...actor, exp: Date.now() + 12 * 3600 * 1000 }) };
}

export function actorOf(req: Request) {
  return verifyToken(req.headers.get("x-admin-token"));
}

/** ต้องเป็นบทบาทที่กำหนด ไม่งั้นโยน error 401/403 (รับทั้ง token PIN และ token บัญชีผู้ใช้) */
export async function requireRole(req: Request, roles: Role[] = ["admin", "safety"]): Promise<Actor> {
  let a: Actor | null = actorOf(req);
  if (!a) {
    const s = await sessionOf(req);
    if (s) {
      if (s.role === "user") {
        const e: any = new Error("บัญชีนี้ไม่มีสิทธิ์ Admin / Safety");
        e.status = 403;
        throw e;
      }
      a = { id: 0, name: s.name, role: s.role, code: s.code };
    }
  }
  if (!a || !roles.includes(a.role)) {
    const e: any = new Error(a ? "สิทธิ์ไม่พอสำหรับคำสั่งนี้" : "ต้องใส่รหัส Admin / Safety Officer");
    e.status = a ? 403 : 401;
    throw e;
  }
  return a;
}

/** ใครกำลังดู: anon = ไม่ได้เข้าสู่ระบบ · user = บัญชีทั่วไป · staff = Admin / Safety (บัญชีหรือ PIN) */
export type Viewer = "anon" | "user" | "staff";
export async function viewerOf(req: Request): Promise<Viewer> {
  if (actorOf(req)) return "staff";
  const s = await sessionOf(req);
  if (!s) return "anon";
  return s.role === "user" ? "user" : "staff";
}
