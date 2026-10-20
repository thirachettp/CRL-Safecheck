import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { importPlan, planOverview } from "@/lib/plan";
import type { PlanPerson, FlagLeader } from "@/lib/parsers";

export const dynamic = "force-dynamic";

/** Admin ได้ภาพรวมเต็ม · คนอื่นได้แค่รายการธงและจุดรวมพล (ไม่มีชื่อคน) */
export const GET = handle(async (req: Request) => {
  const admin = await requireRole(req, ["admin"]).catch(() => null);
  if (admin) return ok(await planOverview());
  const [flags, points] = await Promise.all([
    q(`SELECT flag_no, max(assembly_point) AS assembly_point, mode() WITHIN GROUP (ORDER BY area) AS area, count(*)::int AS people
       FROM evac_plan WHERE NOT removed AND flag_no IS NOT NULL GROUP BY flag_no ORDER BY flag_no`),
    q(`SELECT code, name, backup, sort FROM assembly_points ORDER BY sort, code`),
  ]);
  return ok({ flags, points });
});

/** นำเข้าแผนจาก Excel (Admin) — แทนที่ชุดเดิมและบันทึกเป็นเวอร์ชันใหม่ */
export const POST = handle(async (req: Request) => {
  const actor = await requireRole(req, ["admin"]);
  const b = (await req.json()) as { people: PlanPerson[]; leaders: FlagLeader[]; files?: number; name?: string };
  if (!Array.isArray(b.people) || !b.people.length) return fail("ไม่มีรายชื่อให้บันทึก");
  return ok(await importPlan(b.people, b.leaders ?? [], actor.name, b.files ?? 0, b.name));
});
