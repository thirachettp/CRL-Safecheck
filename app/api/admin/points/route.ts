import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** จุดรวมพลและจุดสำรอง */
export const POST = handle(async (req: Request) => {
  requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "delete") {
    await q(`DELETE FROM assembly_points WHERE code = $1`, [String(b.code)]);
    return ok({ deleted: true });
  }
  const code = String(b.code ?? "").trim();
  if (!code || !String(b.name ?? "").trim()) return fail("ระบุรหัสจุดและชื่อ");
  await q(
    `INSERT INTO assembly_points (code, name, backup, sort) VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, backup = EXCLUDED.backup, sort = EXCLUDED.sort`,
    [code, b.name.trim(), b.backup || null, Number(b.sort) || 0]);
  return ok({ saved: true });
});
