import { one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { prefillFor } from "@/lib/profile";

export const dynamic = "force-dynamic";

/**
 * เข้าสู่ระบบแบบระบุตัวตน (ต้นแบบ ยังไม่มีรหัสผ่าน):
 * มีบัญชีที่ลงทะเบียนครบแล้ว → เข้าได้เลย, ยังไม่มี → ตอบ needRegister พร้อมค่าตั้งต้นจากแผนอพยพ
 */
export const POST = handle(async (req: Request) => {
  const code = String((await req.json()).code ?? "").trim();
  if (!code) return fail("กรอกรหัสพนักงาน");
  const pr = await one<any>(`SELECT code, name FROM profiles WHERE code = $1 AND email IS NOT NULL`, [code]);
  if (pr) return ok({ code, name: pr.name || code });
  const { inPlan, prefill } = await prefillFor(code);
  return Response.json({ error: "ยังไม่มีบัญชี กรุณาลงทะเบียน", needRegister: true, inPlan, prefill }, { status: 404 });
});
