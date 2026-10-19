import { q, one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { validateProfile, saveProfile, prefillFor } from "@/lib/profile";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!code) return fail("ต้องเข้าสู่ระบบก่อน", 401);
  const { prefill } = await prefillFor(code);
  const cc = prefill.cost_center ? await one<any>(`SELECT code, name FROM cost_centers WHERE code = $1`, [prefill.cost_center]) : null;
  return ok({ profile: prefill, cost_center: cc });
});

/** แก้โปรไฟล์: ข้อมูลหลักบังคับเหมือนตอนลงทะเบียน กรุ๊ปเลือดเก็บเฉพาะเมื่อยินยอม */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const code = String(b.code ?? "").trim();
  if (!code) return fail("ต้องเข้าสู่ระบบก่อน", 401);
  if (b.action === "delete-medical") {
    await q(`UPDATE profiles SET blood = NULL, consent_at = NULL, updated_at = now() WHERE code = $1`, [code]);
    return ok({ deleted: true });
  }
  const saved = await saveProfile(await validateProfile({ ...b, code }, { requireAll: true }));
  return ok({ saved: true, ...saved });
});
