import { handle, ok, fail } from "@/lib/http";
import { prefillFor } from "@/lib/profile";
import { accountState, login, setupPassword } from "@/lib/account";

export const dynamic = "force-dynamic";

/**
 * เข้าสู่ระบบ: รหัสพนักงาน + รหัสผ่าน
 * - ส่งแค่ code → บอกขั้นต่อไป (password / setup / register)
 * - code + password → token อายุ 30 วัน
 * - action "setup" (บัญชีเก่าที่ยังไม่มีรหัสผ่าน) → ยืนยันอีเมลแล้วตั้งรหัสผ่าน
 */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const code = String(b.code ?? "").trim();
  if (!code) return fail("กรอกรหัสพนักงาน");
  if (b.action === "setup") return ok(await setupPassword(code, String(b.email ?? ""), String(b.password ?? "")));
  if (b.password === undefined || b.password === null || b.password === "") {
    const next = await accountState(code);
    if (next === "register") {
      const { inPlan, prefill } = await prefillFor(code);
      return Response.json({ error: "ยังไม่มีบัญชี กรุณาลงทะเบียน", needRegister: true, next, inPlan, prefill }, { status: 404 });
    }
    return ok({ next });
  }
  return ok(await login(code, String(b.password)));
});
