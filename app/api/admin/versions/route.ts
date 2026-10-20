import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { saveVersion, rollback, renameVersion } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** บันทึกชุดธงปัจจุบันเป็นเวอร์ชันใหม่ หรือย้อนกลับ */
export const POST = handle(async (req: Request) => {
  const actor = await requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "save") return ok({ version: await saveVersion(String(b.note ?? "บันทึกหลังตรวจทาน"), actor.name, b.name) });
  if (b.action === "rename") { await renameVersion(Number(b.id), String(b.name ?? "")); return ok({ ok: true }); }
  if (b.action === "rollback") return ok({ version: await rollback(Number(b.id), actor.name) });
  return fail("ไม่รู้จักคำสั่ง");
});
