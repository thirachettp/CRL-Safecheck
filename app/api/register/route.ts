import { one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { validateProfile, saveProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** สร้างบัญชีใหม่ (ครั้งแรกที่เข้าสู่ระบบ) */
export const POST = handle(async (req: Request) => {
  const p = await validateProfile(await req.json(), { requireAll: true });
  const exist = await one<any>(`SELECT 1 FROM profiles WHERE code = $1 AND email IS NOT NULL`, [p.code]);
  if (exist) return fail("รหัสพนักงานนี้ลงทะเบียนแล้ว ให้เข้าสู่ระบบด้วยรหัสนี้ได้เลย", 409);
  return ok(await saveProfile(p), 201);
});
