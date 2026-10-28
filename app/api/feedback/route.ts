import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { cleanFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/** ส่งแบบรีวิว: ทุกคนส่งได้ ไม่ต้อง login · เครื่องเดิมส่งซ้ำ = ทับคำตอบเดิม */
export const POST = handle(async (req: Request) => {
  const r = cleanFeedback(await req.json().catch(() => null));
  if (!r.ok) return fail(r.error);
  const v = r.v;
  await q(
    `INSERT INTO feedback (client_id, incident_id, name, emp_id, site, answers, good, improve)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (client_id) DO UPDATE SET incident_id = EXCLUDED.incident_id, name = EXCLUDED.name, emp_id = EXCLUDED.emp_id,
       site = EXCLUDED.site, answers = EXCLUDED.answers, good = EXCLUDED.good, improve = EXCLUDED.improve, updated_at = now()`,
    [v.client_id, v.incident_id, v.name || null, v.emp_id || null, v.site || null, JSON.stringify(v.answers), v.good || null, v.improve || null],
  );
  return ok({ saved: true });
});

/** ผลรีวิวทั้งหมด: เฉพาะ Admin เท่านั้น (Safety Officer และผู้ใช้ทั่วไปดูไม่ได้) */
export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const rows = await q(
    `SELECT id, incident_id, name, emp_id, site, answers, good, improve, created_at, updated_at
     FROM feedback ORDER BY updated_at DESC LIMIT 2000`,
  );
  return ok({ rows });
});
