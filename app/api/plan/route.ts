import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import type { PlanPerson, FlagLeader } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [flags, leaders, total, files] = await Promise.all([
    q(`SELECT flag_no, max(assembly_point) AS assembly_point, count(*)::int AS people,
         count(*) FILTER (WHERE gender = 'ชาย')::int AS male,
         count(*) FILTER (WHERE gender = 'หญิง')::int AS female,
         string_agg(DISTINCT area, ', ') AS areas
       FROM evac_plan GROUP BY flag_no ORDER BY flag_no NULLS LAST`),
    q(`SELECT * FROM flag_leaders ORDER BY flag_no`),
    q(`SELECT count(*)::int AS n, max(updated_at) AS at FROM evac_plan`),
    q(`SELECT count(DISTINCT source_file)::int AS n FROM evac_plan`),
  ]);
  return ok({ flags, leaders, total: total[0].n, updated_at: total[0].at, files: files[0].n });
});

/** แทนที่แผนอพยพทั้งชุด (เหตุการณ์ที่เปิดอยู่ไม่กระทบ เพราะใช้ snapshot ของตัวเอง) */
export const POST = handle(async (req: Request) => {
  const body = (await req.json()) as { people: PlanPerson[]; leaders: FlagLeader[] };
  if (!Array.isArray(body.people) || body.people.length === 0) return fail("ไม่มีรายชื่อให้บันทึก");
  const P = body.people;
  await q(`DELETE FROM evac_plan`);
  await q(
    `INSERT INTO evac_plan (emp_id, prefix, first_name, last_name, gender, cost_center, area,
       assembly_point, flag_no, flag_no_old, role, source_file)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
       $8::text[], $9::int[], $10::int[], $11::text[], $12::text[])
     ON CONFLICT (emp_id) DO NOTHING`,
    [
      P.map((p) => p.emp_id), P.map((p) => p.prefix), P.map((p) => p.first_name), P.map((p) => p.last_name),
      P.map((p) => p.gender), P.map((p) => p.cost_center), P.map((p) => p.area), P.map((p) => p.assembly_point),
      P.map((p) => p.flag_no), P.map((p) => p.flag_no_old), P.map((p) => p.role), P.map((p) => p.source_file),
    ],
  );
  const L = body.leaders ?? [];
  await q(`DELETE FROM flag_leaders`);
  if (L.length) {
    await q(
      `INSERT INTO flag_leaders (flag_no, assembly_point, flag_no_old, leader_name, cost_center, area, note)
       SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT (flag_no) DO NOTHING`,
      [L.map((l) => l.flag_no), L.map((l) => l.assembly_point), L.map((l) => l.flag_no_old),
       L.map((l) => l.leader_name), L.map((l) => l.cost_center), L.map((l) => l.area), L.map((l) => l.note)],
    );
  }
  return ok({ saved: P.length, leaders: L.length });
});
