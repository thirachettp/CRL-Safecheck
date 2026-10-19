// รหัสของผู้ยืนยัน Incident (Admin / Safety Officer)
// ต้นแบบ: PIN + token ลงลายมือชื่อ HMAC อายุ 12 ชม. ระบบจริงควรเปลี่ยนเป็น Sign in with Microsoft
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { q } from "./db";

export type Role = "admin" | "safety";
export type Actor = { id: number; name: string; role: Role };

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

export function verifyToken(token: string | null): Actor | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = createHmac("sha256", secret()).update(body).digest("base64url");
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!p.exp || p.exp < Date.now()) return null;
  return { id: p.id, name: p.name, role: p.role };
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

/** ต้องเป็นบทบาทที่กำหนด ไม่งั้นโยน error 401 */
export function requireRole(req: Request, roles: Role[] = ["admin", "safety"]): Actor {
  const a = actorOf(req);
  if (!a || !roles.includes(a.role)) {
    const e: any = new Error(a ? "สิทธิ์ไม่พอสำหรับคำสั่งนี้" : "ต้องใส่รหัส Admin / Safety Officer");
    e.status = a ? 403 : 401;
    throw e;
  }
  return a;
}
