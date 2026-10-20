import { requireRole } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/http";
import { storeCheckins } from "@/lib/sources";
import type { FormCheckin } from "@/lib/parsers";

export const dynamic = "force-dynamic";

/** ทางสำรองตอนยังไม่มี app registration: อัปโหลด Excel ที่ sync กับฟอร์ม (parse ในเบราว์เซอร์) */
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const { rows, batchId } = (await req.json()) as { rows: FormCheckin[]; batchId: string };
  if (!Array.isArray(rows)) return fail("รูปแบบข้อมูลไม่ถูกต้อง");
  return ok(await storeCheckins(rows, "xlsx", batchId || `xlsx-${Date.now()}`));
});
