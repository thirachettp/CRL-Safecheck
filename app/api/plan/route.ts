import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { importPlan, planOverview } from "@/lib/plan";
import type { PlanPerson, FlagLeader } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok(await planOverview()));

/** นำเข้าแผนจาก Excel (Admin) — แทนที่ชุดเดิมและบันทึกเป็นเวอร์ชันใหม่ */
export const POST = handle(async (req: Request) => {
  const actor = requireRole(req, ["admin"]);
  const b = (await req.json()) as { people: PlanPerson[]; leaders: FlagLeader[]; files?: number };
  if (!Array.isArray(b.people) || !b.people.length) return fail("ไม่มีรายชื่อให้บันทึก");
  return ok(await importPlan(b.people, b.leaders ?? [], actor.name, b.files ?? 0));
});
