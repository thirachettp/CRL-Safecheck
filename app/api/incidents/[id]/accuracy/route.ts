import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { viewerOf } from "@/lib/auth";
import { getIncident, getPeople } from "@/lib/incident";
import { computeAccuracy } from "@/lib/accuracy";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const slim = (p: any) => ({ person_key: p.person_key, name: p.name, emp_id: p.emp_id, flag_no: p.flag_no, cost_center: p.cost_center,
  status: p.status, here: p.here, note: p.added_by === "manual" ? "ไม่มีในรายชื่อ · เพิ่มเองระหว่างเหตุการณ์" : p.pred_note ?? p.status_note, status_by: p.status_by, status_at: p.status_at, presence: p.presence });

/** ความแม่นยำของระบบ: สิ่งที่ระบบคาด (มา/ไม่มา) เทียบกับที่ยืนยันจริง + ประวัติย้อนหลัง */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const viewer = await viewerOf(req);
  if (viewer === "anon") return fail("ต้องเข้าสู่ระบบก่อน", 401);
  const id = Number((await params).id);
  const inc = await getIncident(id);
  if (!inc) return fail("ไม่พบเหตุการณ์", 404);
  const people = await getPeople(id);
  const a = computeAccuracy(people as any, inc.mode === "real" ? "cc" : "flag");
  const staff = viewer === "staff";
  // ประวัติ: ความแม่นยำของเหตุการณ์ที่ผ่านมา (ไม่นับคนที่เพิ่มเอง)
  const history = await q<any>(
    `SELECT i.id, i.mode, i.title, i.kind, i.opened_at, i.state,
       count(p.*) FILTER (WHERE p.added_by <> 'manual')::int AS n,
       count(p.*) FILTER (WHERE p.added_by <> 'manual' AND ((p.here AND p.status IN ('safe','cmd','inj','in')) OR (NOT p.here AND p.status = 'gone')))::int AS correct,
       count(p.*) FILTER (WHERE p.added_by <> 'manual' AND ((p.here AND p.status = 'gone') OR (NOT p.here AND p.status IN ('safe','cmd','inj','in'))))::int AS wrong,
       count(p.*) FILTER (WHERE p.added_by <> 'manual' AND NOT p.here AND p.status IN ('safe','cmd','inj','in'))::int AS danger,
       count(p.*) FILTER (WHERE p.added_by = 'manual')::int AS missed
     FROM incidents i JOIN incident_people p ON p.incident_id = i.id
     WHERE i.state IN ('active','closed') GROUP BY i.id ORDER BY i.id DESC LIMIT 20`);
  return ok({
    incident: { id: inc.id, mode: inc.mode, state: inc.state },
    overall: a.overall, absent: a.absent, present: a.present,
    missed: { ...a.missed, people: staff ? a.missed.people.map(slim) : [] },
    byBasis: a.byBasis, byGroup: a.byGroup.slice(0, 15),
    danger: staff ? a.danger.map(slim) : [], wasted: staff ? a.wasted.map(slim) : [],
    history: history.map((h) => ({ ...h, id: Number(h.id), accuracy: h.correct + h.wrong ? Math.round((h.correct / (h.correct + h.wrong)) * 1000) / 10 : null })),
    staff,
  });
});
