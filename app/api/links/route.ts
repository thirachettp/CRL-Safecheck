import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const r = await q(`SELECT count(*)::int AS n FROM person_links`);
  const unmatched = await q(
    `SELECT lower(c.email) AS email, max(c.full_name) AS name, count(*)::int AS checkins
     FROM div_checkins c LEFT JOIN person_links l ON lower(l.email) = lower(c.email)
     WHERE l.email IS NULL GROUP BY lower(c.email) ORDER BY max(c.submitted_at) DESC LIMIT 100`,
  );
  return ok({ links: r[0].n, unmatched });
});

/** จับคู่อีเมล ↔ รหัสพนักงาน (ทางแก้มือ จนกว่าจะดึง employeeId จาก Entra ได้) */
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const { rows } = (await req.json()) as { rows: { email: string; emp_id: string }[] };
  const clean = (rows ?? [])
    .map((r) => ({ email: String(r.email ?? "").trim().toLowerCase(), emp: String(r.emp_id ?? "").trim() }))
    .filter((r) => r.email.includes("@") && /^\d{5,10}$/.test(r.emp));
  if (!clean.length) return fail("ไม่มีคู่อีเมล-รหัสพนักงานที่ถูกต้อง");
  await q(
    `INSERT INTO person_links (email, emp_id) SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (email) DO UPDATE SET emp_id = EXCLUDED.emp_id`,
    [clean.map((r) => r.email), clean.map((r) => r.emp)],
  );
  return ok({ saved: clean.length });
});
