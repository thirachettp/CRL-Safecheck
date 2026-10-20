import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { saveVersion, activateVersion, renameVersion, overwriteVersion, deleteVersion } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** เวอร์ชันชุดธง: เพิ่ม (บันทึกเป็นเวอร์ชันใหม่) · เลือกใช้ · แก้ชื่อ · บันทึกทับ · ลบ */
export const POST = handle(async (req: Request) => {
  const actor = await requireRole(req, ["admin"]);
  const b = await req.json();
  const id = Number(b.id);
  switch (b.action) {
    case "save":
      return ok({ version: await saveVersion(String(b.note ?? "บันทึกหลังแก้ไข"), actor.name, b.name) });
    case "activate":
    case "rollback":
      await activateVersion(id);
      return ok({ version: id });
    case "rename":
      await renameVersion(id, String(b.name ?? ""));
      return ok({ ok: true });
    case "overwrite":
      await overwriteVersion(id, actor.name);
      return ok({ ok: true });
    case "delete":
      await deleteVersion(id);
      return ok({ ok: true });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
