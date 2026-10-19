import { q } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { setInjury } from "@/lib/incident";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Safety เห็นกรุ๊ปเลือดของผู้บาดเจ็บที่ยินยอมไว้ (เฉพาะช่วงเหตุการณ์) */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireRole(req, ["admin", "safety"]);
  const id = Number((await params).id);
  const rows = await q(
    `SELECT p.person_key, pr.blood FROM incident_people p JOIN profiles pr ON pr.code = p.emp_id
     WHERE p.incident_id = $1 AND p.status = 'inj' AND pr.blood IS NOT NULL AND pr.consent_at IS NOT NULL`, [id]);
  return ok({ blood: Object.fromEntries(rows.map((r: any) => [r.person_key, r.blood])) });
});

/** Safety ระบุระดับสี อาการ และโรงพยาบาล */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const actor = await requireRole(req, ["admin", "safety"]);
  const id = Number((await params).id);
  const b = await req.json();
  await setInjury(id, String(b.person_key), { triage: b.triage || null, symptoms: b.symptoms ?? null, hospital: b.hospital ?? null }, actor);
  return ok({ ok: true });
});
