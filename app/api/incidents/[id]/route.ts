import { notify } from "@/lib/push";
import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { requireRole, viewerOf } from "@/lib/auth";
import { getIncident, getPeople, confirmIncident, cancelIncident, closeIncident, mergeIntoIncident } from "@/lib/incident";
import { sourceStates, fanOutSync } from "@/lib/sources";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const incident = await getIncident(id);
  if (!incident) return fail("ไม่พบเหตุการณ์", 404);
  const [people, points, leaders, announcements, codes, sources, emer, target] = await Promise.all([
    getPeople(id),
    q(`SELECT * FROM assembly_points ORDER BY sort, code`),
    q(`SELECT flag_no, leader_name, assembly_point, area FROM flag_leaders ORDER BY flag_key(flag_no), flag_no`),
    q(`SELECT * FROM incident_announcements WHERE incident_id = $1 ORDER BY at`, [id]),
    q(`SELECT * FROM announce_codes ORDER BY sort, id`),
    sourceStates(),
    // ผู้ติดต่อฉุกเฉินจากโปรไฟล์ (ไม่ส่งข้อมูลทางการแพทย์ไปหน้าทั่วไป)
    q(`SELECT code, emer_name, emer_tel, tel FROM profiles`),
    getSetting<number>("count_target_sec", 300),
  ]);
  const em = new Map(emer.map((e: any) => [e.code, e]));
  // ไม่ได้เข้าสู่ระบบ: ไม่เห็นเบอร์โทร ผู้ติดต่อฉุกเฉิน อีเมล · อาการ/รพ. เห็นเฉพาะ Admin / Safety
  const viewer = await viewerOf(req);
  const ppl = people.map((p: any) => {
    const e: any = p.emp_id ? em.get(p.emp_id) : null;
    const full = { ...p, emer: e?.emer_name ? `${e.emer_name}${e.emer_tel ? ` · ${e.emer_tel}` : ""}` : null, tel: p.tel ?? e?.tel ?? null };
    if (viewer !== "staff") { full.symptoms = null; full.hospital = null; }
    if (viewer === "anon") { full.tel = null; full.emer = null; full.email = null; }
    return full;
  });
  return ok({ incident, people: ppl, points, leaders, announcements, codes, sources, target, viewer, now: new Date().toISOString() });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  if (b.action === "confirm") {
    const actor = await requireRole(req, ["admin", "safety"]);
    await confirmIncident(id, actor, Array.isArray(b.closedPoints) ? b.closedPoints.map(String) : []);
    const inc = await getIncident(id);
    const pushed = await notify("all", { title: `🚨 เหตุฉุกเฉิน: ${inc?.kind ?? ""} ${inc?.area ?? ""}`.trim(),
      body: "อพยพไปที่จุดรวมพลทันที แล้วกดปลอดภัยในแอป" + ((inc?.closed_points?.length ?? 0) ? " · บางจุดรวมพลปิด ดูจุดสำรองในแอป" : ""),
      url: "/search", tag: `incident-${id}`, urgent: true }).catch(() => null);
    fanOutSync(25_000).then(() => mergeIntoIncident(id, "sync")).catch(() => {});
    return ok({ id, pushed });
  }
  if (b.action === "cancel") {
    await cancelIncident(id, String(b.by ?? ""));
    return ok({ cancelled: true });
  }
  if (b.action === "close") {
    const actor = await requireRole(req, ["admin", "safety"]);
    const r = await closeIncident(id, actor);
    const m = r.summary;
    const head = m.mode === "real" ? `✅ เหตุการณ์สิ้นสุด${m.kind ? `: ${m.kind}` : ""}` : `🏁 จบการซ้อมอพยพ${m.title ? ` · ${m.title}` : ""}`;
    const body = [
      `นับได้ ${m.safe + m.inj}/${m.pool} คน (${m.pct}%) · ${m.full ? "นับครบใน" : "ใช้เวลา"} ${m.duration} นาที`,
      [m.inj && `บาดเจ็บ ${m.inj}`, m.inside && `ยังอยู่ในคลัง ${m.inside}`, m.unk && `ยังไม่ทราบ ${m.unk}`].filter(Boolean).join(" · "),
    ].filter(Boolean).join("\n");
    const pushed = await notify("all", { title: head, body, url: `/dashboard?id=${id}`, tag: `incident-${id}` }).catch(() => null);
    return ok({ ...r, pushed });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
