import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { requireRole, hashPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  requireRole(req, ["admin"]);
  return ok({ confirmers: await q(`SELECT id, name, role, pin_hash IS NOT NULL AS has_pin FROM confirmers ORDER BY role, name`) });
});

/** เพิ่ม/แก้ผู้ยืนยัน Incident และตั้งรหัส */
export const POST = handle(async (req: Request) => {
  requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "delete") {
    await q(`DELETE FROM confirmers WHERE id = $1`, [Number(b.id)]);
    return ok({ deleted: true });
  }
  if (b.pin && !/^\d{4,8}$/.test(String(b.pin))) return fail("รหัสต้องเป็นตัวเลข 4–8 หลัก");
  if (b.id) {
    await q(`UPDATE confirmers SET name = COALESCE($2, name), role = COALESCE($3, role),
               pin_hash = COALESCE($4, pin_hash) WHERE id = $1`,
      [Number(b.id), b.name || null, b.role || null, b.pin ? hashPin(String(b.pin)) : null]);
    return ok({ saved: true });
  }
  if (!String(b.name ?? "").trim() || !["admin", "safety"].includes(b.role)) return fail("ระบุชื่อและบทบาท");
  await q(`INSERT INTO confirmers (name, role, pin_hash) VALUES ($1, $2, $3)`,
    [b.name.trim(), b.role, b.pin ? hashPin(String(b.pin)) : null]);
  return ok({ saved: true });
});
