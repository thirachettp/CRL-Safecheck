import { one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { validateProfile, saveProfile } from "@/lib/profile";
import { passwordProblem } from "@/lib/password";
import { setPasswordAtRegister } from "@/lib/account";

export const dynamic = "force-dynamic";

/** สร้างบัญชีใหม่ (ครั้งแรกที่เข้าสู่ระบบ) พร้อมตั้งรหัสผ่าน */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const p = await validateProfile(b, { requireAll: true });
  const pwErr = passwordProblem(String(b.password ?? ""), p.code);
  if (pwErr) return fail(pwErr);
  const exist = await one<any>(`SELECT 1 FROM profiles WHERE code = $1 AND email IS NOT NULL`, [p.code]);
  if (exist) return fail("รหัสพนักงานนี้ลงทะเบียนแล้ว ให้เข้าสู่ระบบด้วยรหัสนี้ได้เลย", 409);
  await saveProfile(p);
  return ok(await setPasswordAtRegister(p.code, String(b.password)), 201);
});
