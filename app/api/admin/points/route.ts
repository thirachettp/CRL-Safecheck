import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { touchPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** จุดรวมพลและจุดสำรอง */
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "set-flags") {
    // กำหนดธงที่ใช้จุดนี้: ธงที่เลือกย้ายมาจุดนี้ · ธงที่เอาออกจะเป็น "ไม่ระบุจุด"
    const code = String(b.code);
    const flags: number[] = (Array.isArray(b.flags) ? b.flags : []).map(Number).filter(Number.isInteger);
    if (!(await q(`SELECT 1 FROM assembly_points WHERE code = $1`, [code])).length) return fail("ไม่พบจุดรวมพลนี้");
    await q(`UPDATE evac_plan SET assembly_point = NULL, updated_at = now()
             WHERE assembly_point = $1 AND NOT (flag_no = ANY($2::int[]))`, [code, flags]);
    await q(`UPDATE flag_leaders SET assembly_point = NULL WHERE assembly_point = $1 AND NOT (flag_no = ANY($2::int[]))`, [code, flags]);
    await q(`UPDATE evac_plan SET assembly_point = $1, updated_at = now()
             WHERE flag_no = ANY($2::int[]) AND assembly_point IS DISTINCT FROM $1`, [code, flags]);
    await q(`UPDATE flag_leaders SET assembly_point = $1 WHERE flag_no = ANY($2::int[])`, [code, flags]);
    await touchPlan();
    return ok({ saved: true });
  }
  if (b.action === "delete") {
    // จุดที่ยังมีธงใช้อยู่ ต้องย้ายธงไปจุดอื่นก่อน (move_to)
    const code = String(b.code);
    const used = await q<{ flag_no: number }>(
      `SELECT DISTINCT flag_no FROM evac_plan WHERE assembly_point = $1 AND NOT removed AND flag_no IS NOT NULL
       UNION SELECT flag_no FROM flag_leaders WHERE assembly_point = $1 ORDER BY 1`, [code]);
    const to = b.move_to ? String(b.move_to) : null;
    if (used.length && !to) return fail(`จุดนี้มีธง ${used.map((u) => u.flag_no).join(", ")} ใช้อยู่ เลือกจุดที่จะย้ายไปก่อน`);
    if (to === code) return fail("เลือกจุดปลายทางอื่น");
    if (to) {
      await q(`UPDATE evac_plan SET assembly_point = $2, updated_at = now() WHERE assembly_point = $1`, [code, to]);
      await q(`UPDATE flag_leaders SET assembly_point = $2 WHERE assembly_point = $1`, [code, to]);
    }
    await q(`UPDATE assembly_points SET backup = NULL WHERE backup = $1`, [code]);
    await q(`DELETE FROM assembly_points WHERE code = $1`, [code]);
    if (to) await touchPlan();
    return ok({ deleted: true, moved: used.length });
  }
  const code = String(b.code ?? "").trim();
  if (!code || !String(b.name ?? "").trim()) return fail("ระบุรหัสจุดและชื่อ");
  await q(
    `INSERT INTO assembly_points (code, name, backup, sort) VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, backup = EXCLUDED.backup, sort = EXCLUDED.sort`,
    [code, b.name.trim(), b.backup || null, Number(b.sort) || 0]);
  return ok({ saved: true });
});
