import { q, one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const p = await one<any>(`SELECT * FROM profiles WHERE code = $1`, [code]);
  const plan = await one<any>(`SELECT concat_ws(' ', first_name, last_name) AS name, gender, tel FROM evac_plan WHERE emp_id = $1`, [code]);
  return ok({ profile: p, plan });
});

/** โปรไฟล์ไม่บังคับ: เบอร์โทร ผู้ติดต่อฉุกเฉิน และกรุ๊ปเลือด (เก็บเฉพาะเมื่อยินยอม) */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const code = String(b.code ?? "").trim();
  if (!code) return fail("ต้องเข้าสู่ระบบก่อน", 401);
  if (b.action === "delete-medical") {
    await q(`UPDATE profiles SET blood = NULL, consent_at = NULL, updated_at = now() WHERE code = $1`, [code]);
    return ok({ deleted: true });
  }
  const blood = b.consent && ["A", "B", "AB", "O"].includes(b.blood) ? b.blood : null;
  await q(
    `INSERT INTO profiles (code, name, gender, tel, emer_name, emer_tel, blood, consent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8 THEN now() END)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, gender = EXCLUDED.gender, tel = EXCLUDED.tel,
       emer_name = EXCLUDED.emer_name, emer_tel = EXCLUDED.emer_tel, blood = EXCLUDED.blood,
       consent_at = CASE WHEN $8 THEN COALESCE(profiles.consent_at, now()) END, updated_at = now()`,
    [code, b.name || null, b.gender || null, b.tel || null, b.emer_name || null, b.emer_tel || null, blood, !!b.consent]);
  return ok({ saved: true });
});
