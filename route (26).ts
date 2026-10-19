import { one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

/** เข้าสู่ระบบแบบระบุตัวตน (ต้นแบบ): รหัสพนักงานที่มีในแผนอพยพหรือโปรไฟล์ */
export const POST = handle(async (req: Request) => {
  const code = String((await req.json()).code ?? "").trim();
  if (!code) return fail("กรอกรหัสพนักงาน");
  const p = await one<any>(
    `SELECT emp_id AS code, concat_ws(' ', first_name, last_name) AS name FROM evac_plan WHERE emp_id = $1 AND NOT removed`, [code]);
  const pr = await one<any>(`SELECT code, name FROM profiles WHERE code = $1`, [code]);
  if (!p && !pr) return fail("ไม่พบรหัสนี้ในชุดธง ตรวจรหัสอีกครั้ง หรือให้ Admin เพิ่มรายชื่อก่อน", 404);
  return ok({ code, name: pr?.name || p?.name || code });
});
