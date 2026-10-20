import { q, one } from "./db";
import { UserError } from "./errors";
import { hashPassword, verifyPassword, passwordProblem, tempPassword } from "./password";
import { effectiveRole, signUser, bootstrapAdmins, builtinAdmin, type UserRole } from "./auth";
import { timingSafeEqual } from "node:crypto";

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** สร้าง/อัปเดตแถวของบัญชี admin ในตัว ให้รหัสผ่านตรงกับ ADMIN_PASSWORD เสมอ */
async function syncBuiltinAdmin(code: string) {
  const pw = process.env.ADMIN_PASSWORD!;
  const r = await one<any>(`SELECT password_hash FROM profiles WHERE code = $1`, [code]);
  if (r && (await verifyPassword(pw, r.password_hash))) return;
  const h = await hashPassword(pw);
  await q(
    `INSERT INTO profiles (code, name, first_name, email, role, password_hash, pw_ver)
     VALUES ($1, 'ผู้ดูแลระบบ', 'ผู้ดูแลระบบ', $1 || '@safecheck.local', 'admin', $2, 1)
     ON CONFLICT (code) DO UPDATE SET password_hash = EXCLUDED.password_hash, pw_ver = profiles.pw_ver + 1,
       role = 'admin', must_change_pw = false, email = COALESCE(profiles.email, EXCLUDED.email)`, [code, h]);
}

const MAX_FAIL = 5;
const LOCK_MIN = 15;

const log = (code: string, action: string, detail: string | null, by: string | null) =>
  q(`INSERT INTO account_log (code, action, detail, by_code) VALUES ($1, $2, $3, $4)`, [code, action, detail, by]);

function err(msg: string, status = 400, extra: object = {}) {
  return Object.assign(new UserError(msg), { status, payload: extra });
}

async function issue(code: string) {
  const r = await one<any>(`SELECT code, name, role, pw_ver, must_change_pw FROM profiles WHERE code = $1`, [code]);
  const role = effectiveRole(r.code, r.role);
  return { code: r.code, name: r.name || r.code, role, mustChange: !!r.must_change_pw, token: signUser({ code: r.code, name: r.name || r.code, role, pw_ver: r.pw_ver }) };
}

/** ขั้นแรกของการเข้าสู่ระบบ: บอกว่ารหัสนี้ต้องทำอะไรต่อ */
export async function accountState(code: string): Promise<"password" | "setup" | "register"> {
  if (builtinAdmin() && code.toLowerCase() === builtinAdmin()) return "password";
  const r = await one<any>(`SELECT email, password_hash FROM profiles WHERE code = $1`, [code]);
  if (!r?.email) return "register";
  return r.password_hash ? "password" : "setup";
}

export async function login(code: string, password: string) {
  const b = builtinAdmin();
  if (b && code.toLowerCase() === b) {
    code = b;
    const lock = await one<any>(`SELECT failed_logins, locked_until FROM profiles WHERE code = $1`, [code]);
    if (lock?.locked_until && new Date(lock.locked_until) > new Date()) throw err("ใส่รหัสผ่านผิดหลายครั้ง ล็อกไว้ 15 นาที", 423);
    if (!sameText(password, process.env.ADMIN_PASSWORD!)) {
      const n = (lock?.failed_logins ?? 0) + 1;
      if (lock) await q(`UPDATE profiles SET failed_logins = $2, locked_until = CASE WHEN $2 >= ${MAX_FAIL} THEN now() + interval '${LOCK_MIN} minutes' END WHERE code = $1`, [code, n >= MAX_FAIL ? 0 : n]);
      throw err(`รหัสผ่านไม่ถูกต้อง`, 401);
    }
    await syncBuiltinAdmin(code);
    await q(`UPDATE profiles SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE code = $1`, [code]);
    return issue(code);
  }
  const r = await one<any>(`SELECT code, email, password_hash, failed_logins, locked_until FROM profiles WHERE code = $1 AND email IS NOT NULL`, [code]);
  if (!r) throw err("ไม่พบบัญชีนี้ กรุณาลงทะเบียน", 404, { needRegister: true });
  if (String(r.email).endsWith("@safecheck.local")) throw err("บัญชี admin ในตัวปิดใช้งานอยู่ (ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน Vercel)", 403);
  if (!r.password_hash) throw err("บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน", 409, { needSetup: true });
  if (r.locked_until && new Date(r.locked_until) > new Date()) {
    const m = Math.ceil((new Date(r.locked_until).getTime() - Date.now()) / 60e3);
    throw err(`ใส่รหัสผ่านผิดหลายครั้ง ล็อกไว้อีก ${m} นาที หรือให้ Admin รีเซ็ตรหัสผ่าน`, 423);
  }
  if (!(await verifyPassword(password, r.password_hash))) {
    const n = (r.failed_logins ?? 0) + 1;
    await q(`UPDATE profiles SET failed_logins = $2, locked_until = CASE WHEN $2 >= ${MAX_FAIL} THEN now() + interval '${LOCK_MIN} minutes' END WHERE code = $1`, [code, n >= MAX_FAIL ? 0 : n]);
    if (n >= MAX_FAIL) await log(code, "locked", null, null);
    throw err(n >= MAX_FAIL ? `ใส่รหัสผ่านผิด ${MAX_FAIL} ครั้ง ล็อก ${LOCK_MIN} นาที` : `รหัสผ่านไม่ถูกต้อง (เหลืออีก ${MAX_FAIL - n} ครั้ง)`, 401);
  }
  await q(`UPDATE profiles SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE code = $1`, [code]);
  return issue(code);
}

/** บัญชีที่ลงทะเบียนก่อนมีรหัสผ่าน: ยืนยันด้วยอีเมลที่ลงทะเบียนไว้ แล้วตั้งรหัสผ่าน */
export async function setupPassword(code: string, email: string, password: string) {
  const r = await one<any>(`SELECT email, password_hash FROM profiles WHERE code = $1`, [code]);
  if (!r?.email) throw err("ไม่พบบัญชีนี้ กรุณาลงทะเบียน", 404);
  if (r.password_hash) throw err("บัญชีนี้ตั้งรหัสผ่านแล้ว ถ้าลืมให้ Admin รีเซ็ต", 409);
  if (String(email ?? "").trim().toLowerCase() !== String(r.email).toLowerCase()) throw err("อีเมลไม่ตรงกับที่ลงทะเบียนไว้", 401);
  const p = passwordProblem(password, code);
  if (p) throw err(p);
  await q(`UPDATE profiles SET password_hash = $2, pw_ver = pw_ver + 1, must_change_pw = false, last_login_at = now() WHERE code = $1`, [code, await hashPassword(password)]);
  await log(code, "setup", null, code);
  return issue(code);
}

/** ตั้งรหัสผ่านตอนลงทะเบียน (เรียกหลังบันทึกโปรไฟล์แล้ว) */
export async function setPasswordAtRegister(code: string, password: string) {
  await q(`UPDATE profiles SET password_hash = $2, pw_ver = pw_ver + 1, must_change_pw = false, last_login_at = now() WHERE code = $1`, [code, await hashPassword(password)]);
  await log(code, "register", null, code);
  return issue(code);
}

export async function changePassword(code: string, oldPw: string, newPw: string) {
  if (builtinAdmin() && code === builtinAdmin()) throw err("รหัสผ่านของบัญชีนี้ตั้งใน Vercel (ADMIN_PASSWORD) เปลี่ยนที่นั่นแทน");
  const r = await one<any>(`SELECT password_hash FROM profiles WHERE code = $1`, [code]);
  if (!(await verifyPassword(oldPw, r?.password_hash ?? null))) throw err("รหัสผ่านเดิมไม่ถูกต้อง", 401);
  if (oldPw === newPw) throw err("รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม");
  const p = passwordProblem(newPw, code);
  if (p) throw err(p);
  await q(`UPDATE profiles SET password_hash = $2, pw_ver = pw_ver + 1, must_change_pw = false WHERE code = $1`, [code, await hashPassword(newPw)]);
  await log(code, "change", null, code);
  return issue(code); // token ใหม่ (token เก่าทุกเครื่องหมดอายุ)
}

// ---------- Admin: ปรับบทบาท และรีเซ็ตรหัสผ่าน เท่านั้น ----------

export async function listUsers(term: string) {
  const t = term.trim();
  const rows = await q<any>(
    `SELECT p.code, p.name, p.cost_center, c.name AS cc_name, p.email, p.role, p.password_hash IS NOT NULL AS has_password,
       p.must_change_pw, p.locked_until > now() AS locked, p.last_login_at
     FROM profiles p LEFT JOIN cost_centers c ON c.code = p.cost_center
     WHERE p.email IS NOT NULL AND ($1 = '' OR p.code ILIKE '%' || $1 || '%' OR p.name ILIKE '%' || $1 || '%' OR p.email ILIKE '%' || $1 || '%')
     ORDER BY (p.role <> 'user') DESC, p.name LIMIT 100`, [t]);
  const boot = bootstrapAdmins();
  return rows.map((r) => ({ ...r, role: effectiveRole(r.code, r.role), fixed_admin: boot.includes(r.code) }));
}

export async function setRole(code: string, role: UserRole, by: string) {
  if (!["user", "safety", "admin"].includes(role)) throw err("บทบาทไม่ถูกต้อง");
  if (bootstrapAdmins().includes(code) && role !== "admin") throw err("รหัสนี้ถูกกำหนดเป็น Admin ใน ADMIN_CODES ของ Vercel แก้ที่นั่นแทน");
  if (code === by && role !== "admin") throw err("ลดสิทธิ์ตัวเองไม่ได้ ให้ Admin คนอื่นทำ");
  const r = await one<any>(`UPDATE profiles SET role = $2 WHERE code = $1 AND email IS NOT NULL RETURNING code`, [code, role]);
  if (!r) throw err("ไม่พบบัญชีนี้", 404);
  await log(code, "role", role, by);
  return { code, role };
}

/** ได้รหัสผ่านชั่วคราว (แสดงครั้งเดียว) ผู้ใช้ต้องเปลี่ยนเองตอนเข้าครั้งถัดไป และ token เก่าทุกเครื่องใช้ไม่ได้ */
export async function resetPassword(code: string, by: string) {
  if (builtinAdmin() && code === builtinAdmin()) throw err("รหัสผ่านของบัญชีนี้ตั้งใน Vercel (ADMIN_PASSWORD) เปลี่ยนที่นั่นแทน");
  const tmp = tempPassword();
  const r = await one<any>(
    `UPDATE profiles SET password_hash = $2, pw_ver = pw_ver + 1, must_change_pw = true, failed_logins = 0, locked_until = NULL
     WHERE code = $1 AND email IS NOT NULL RETURNING code`, [code, await hashPassword(tmp)]);
  if (!r) throw err("ไม่พบบัญชีนี้", 404);
  await log(code, "reset", null, by);
  return { code, temp: tmp };
}
