import { q, one } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { validateProfile, saveProfile, prefillFor } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** โปรไฟล์ของคนที่เข้าสู่ระบบอยู่ (ดู/แก้ได้เฉพาะของตัวเอง) */
export const GET = handle(async (req: Request) => {
  const s = await requireUser(req);
  const { prefill } = await prefillFor(s.code);
  const cc = prefill.cost_center ? await one<any>(`SELECT code, name FROM cost_centers WHERE code = $1`, [prefill.cost_center]) : null;
  return ok({ profile: prefill, cost_center: cc, role: s.role });
});

/** แก้โปรไฟล์: ข้อมูลหลักบังคับเหมือนตอนลงทะเบียน กรุ๊ปเลือดเก็บเฉพาะเมื่อยินยอม */
export const POST = handle(async (req: Request) => {
  const s = await requireUser(req);
  const b = await req.json();
  if (b.action === "delete-medical") {
    await q(`UPDATE profiles SET blood = NULL, consent_at = NULL, updated_at = now() WHERE code = $1`, [s.code]);
    return ok({ deleted: true });
  }
  const saved = await saveProfile(await validateProfile({ ...b, code: s.code }, { requireAll: true }));
  return ok({ saved: true, ...saved, role: s.role });
});
