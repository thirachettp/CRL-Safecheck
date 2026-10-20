import { requireRole } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/http";
import { storeCheckins } from "@/lib/sources";
import { normalizeGender } from "@/lib/parsers";

export const dynamic = "force-dynamic";

/** จำลองคนส่งฟอร์มหนึ่งครั้ง ใช้ทดสอบกฎเข้า/ออก */
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const b = await req.json();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return fail("กรอกอีเมลให้ถูกต้อง");
  const at = b.at ? new Date(b.at) : new Date();
  if (isNaN(at.getTime())) return fail("เวลาไม่ถูกต้อง");
  const id = `test-${Date.now()}`;
  const r = await storeCheckins(
    [{ response_id: id, email, full_name: b.name || null, gender: normalizeGender(b.gender), site: b.site || null, submitted_at: at.toISOString() }],
    "test",
    id,
  );
  return ok(r);
});
