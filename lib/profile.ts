import { q, one } from "./db";
import { UserError } from "./errors";

export const PREFIXES = ["นาย", "นาง", "นางสาว"];
export const EMAIL_RE = /^[a-z0-9._%+-]+@central\.co\.th$/i;

export type ProfileInput = {
  code?: string; prefix?: string; first_name?: string; last_name?: string; cost_center?: string;
  email?: string; tel?: string; gender?: string; emer_name?: string; emer_tel?: string;
  consent?: boolean; blood?: string;
};

const s = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
export const cleanTel = (v: unknown) => s(v, 30).replace(/[^\d+]/g, "");

/** ตรวจข้อมูลที่จำเป็นตอนลงทะเบียน / แก้โปรไฟล์ — คืนค่าที่ทำความสะอาดแล้ว */
export async function validateProfile(b: ProfileInput, opts: { requireAll: boolean }) {
  const p = {
    code: s(b.code, 30),
    prefix: s(b.prefix, 30),
    first_name: s(b.first_name, 80),
    last_name: s(b.last_name, 80),
    cost_center: s(b.cost_center, 40),
    email: s(b.email, 120).toLowerCase(),
    tel: cleanTel(b.tel),
    gender: ["ชาย", "หญิง", "ไม่ระบุ"].includes(String(b.gender)) ? String(b.gender) : null,
    emer_name: s(b.emer_name) || null,
    emer_tel: cleanTel(b.emer_tel) || null,
    consent: !!b.consent,
    blood: b.consent && ["A", "B", "AB", "O"].includes(String(b.blood)) ? String(b.blood) : null,
  };
  if (!/^[A-Za-z0-9-]{3,30}$/.test(p.code)) throw new UserError("รหัสพนักงานไม่ถูกต้อง");
  if (opts.requireAll) {
    const miss = [
      !p.prefix && "คำนำหน้า", !p.first_name && "ชื่อ", !p.last_name && "นามสกุล",
      !p.cost_center && "Cost Center", !p.gender && "เพศ",
    ].filter(Boolean);
    if (miss.length) throw new UserError(`กรอกให้ครบ: ${miss.join(", ")}`);
  }
  if (p.email && !EMAIL_RE.test(p.email)) throw new UserError("อีเมลต้องเป็น @central.co.th");
  if (p.tel && !/^\+?\d{9,12}$/.test(p.tel)) throw new UserError("เบอร์โทรไม่ถูกต้อง (9–10 หลัก)");
  if (p.emer_tel && !/^\+?\d{9,12}$/.test(p.emer_tel)) throw new UserError("เบอร์ผู้ติดต่อฉุกเฉินไม่ถูกต้อง");
  if (p.cost_center && !(await one(`SELECT 1 FROM cost_centers WHERE code = $1`, [p.cost_center])))
    throw new UserError("เลือก Cost Center จากรายการ หรือกด “เพิ่ม Cost Center ใหม่” ก่อน");
  if (p.email) {
    const dup = await one<any>(`SELECT code FROM profiles WHERE lower(email) = $1 AND code <> $2`, [p.email, p.code]);
    if (dup) throw new UserError("อีเมลนี้ถูกใช้ลงทะเบียนกับรหัสพนักงานอื่นแล้ว");
  }
  return p;
}

export async function saveProfile(p: Awaited<ReturnType<typeof validateProfile>>) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
  await q(
    `INSERT INTO profiles (code, prefix, first_name, last_name, name, cost_center, email, tel, gender, emer_name, emer_tel, blood, consent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $13 THEN now() END)
     ON CONFLICT (code) DO UPDATE SET prefix = EXCLUDED.prefix, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
       name = EXCLUDED.name, cost_center = EXCLUDED.cost_center, email = EXCLUDED.email, tel = EXCLUDED.tel, gender = EXCLUDED.gender,
       emer_name = EXCLUDED.emer_name, emer_tel = EXCLUDED.emer_tel, blood = EXCLUDED.blood,
       consent_at = CASE WHEN $13 THEN COALESCE(profiles.consent_at, now()) END, updated_at = now()`,
    [p.code, p.prefix || null, p.first_name || null, p.last_name || null, name, p.cost_center || null, p.email || null,
      p.tel || null, p.gender, p.emer_name, p.emer_tel, p.blood, p.consent]);
  // ผูกอีเมลกับรหัสพนักงาน ให้การเช็คอิน MS Form จับคู่กับธงได้ (ไม่ทับลิงก์ที่ Admin ตั้งไว้)
  if (p.email)
    await q(`INSERT INTO person_links (email, emp_id, source) VALUES ($1, $2, 'register') ON CONFLICT (email) DO NOTHING`, [p.email, p.code]);
  return { code: p.code, name: name ?? p.code };
}

/** ค่าตั้งต้นจากแผนอพยพ ให้ผู้ใช้ไม่ต้องพิมพ์เองทั้งหมด */
export async function prefillFor(code: string) {
  const pl = await one<any>(
    `SELECT prefix, first_name, last_name, gender, cost_center, tel FROM evac_plan WHERE emp_id = $1 AND NOT removed`, [code]);
  const pr = await one<any>(`SELECT * FROM profiles WHERE code = $1`, [code]);
  const pick = (k: string) => pr?.[k] ?? pl?.[k] ?? "";
  let first = pick("first_name"), last = pick("last_name");
  if (!first && pr?.name) [first, last = ""] = String(pr.name).split(/\s+(.*)/);
  return {
    inPlan: !!pl,
    prefill: {
      code, prefix: pick("prefix"), first_name: first, last_name: last, cost_center: pick("cost_center"),
      gender: pick("gender"), tel: pick("tel"), email: pr?.email ?? "",
      emer_name: pr?.emer_name ?? "", emer_tel: pr?.emer_tel ?? "", consent: !!pr?.consent_at, blood: pr?.blood ?? "",
    },
  };
}
