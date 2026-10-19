import { q, one } from "./db";
import { computePresence } from "./presence";
import { getSetting } from "./settings";

export type Status = "pending" | "safe" | "injured" | "trapped" | "absent";
export const STATUSES: Status[] = ["pending", "safe", "injured", "trapped", "absent"];

export type Incident = {
  id: number;
  mode: "real" | "drill";
  title: string | null;
  div_sites: string[] | null;
  include_plan: boolean;
  opened_at: string;
  closed_at: string | null;
  first_full_at: string | null;
};

export type Person = {
  person_key: string;
  emp_id: string | null;
  email: string | null;
  name: string;
  gender: string | null;
  area: string | null;
  flag_no: number | null;
  assembly_point: string | null;
  is_leader: boolean;
  presence: "plan" | "div" | "kiosk" | "manual";
  plate: string | null;
  presence_site: string | null;
  presence_since: string | null;
  still_in_source: boolean;
  status: Status;
  status_by: string | null;
  status_at: string | null;
  added_by: string;
  added_at: string;
};

type Candidate = Omit<Person, "status" | "status_by" | "status_at" | "added_by" | "added_at" | "still_in_source">;

/** สร้างรายชื่อผู้ที่ควรอยู่ในเคส จากแผนอพยพ + ใครอยู่ในพื้นที่ตอนนี้ */
async function buildCandidates(inc: Incident, now = new Date()): Promise<Candidate[]> {
  const [plan, links, checkins, vehicles, driverFlag, leaders] = await Promise.all([
    q<any>(`SELECT * FROM evac_plan`),
    q<any>(`SELECT lower(email) AS email, emp_id FROM person_links`),
    q<any>(
      `SELECT lower(email) AS email, full_name, gender, site, submitted_at
       FROM div_checkins WHERE submitted_at > $1::timestamptz - interval '48 hours'
       ORDER BY submitted_at`,
      [now.toISOString()],
    ),
    q<any>(`SELECT * FROM driver_presence ORDER BY checkin_at NULLS LAST`),
    getSetting<number | null>("driver_flag", null),
    q<any>(`SELECT flag_no, assembly_point FROM flag_leaders`),
  ]);

  const linkMap = new Map<string, string>(links.map((l) => [l.email, l.emp_id]));
  const planMap = new Map<string, any>(plan.map((p) => [p.emp_id, p]));
  const sites = (inc.div_sites ?? []).map((s) => s.toUpperCase());

  // จัดกลุ่มเช็กอินตามอีเมล แล้วคำนวณสถานะด้วยกฎเข้า/ออก
  const byEmail = new Map<string, any[]>();
  for (const c of checkins) {
    const list = byEmail.get(c.email) ?? [];
    list.push(c);
    byEmail.set(c.email, list);
  }
  const present = new Map<string, { site: string | null; since: Date; row: any }>();
  for (const [email, list] of byEmail) {
    const p = computePresence(list.map((c) => ({ at: new Date(c.submitted_at), site: c.site })), now);
    if (p.state !== "in") continue;
    if (sites.length && !sites.includes((p.site ?? "").toUpperCase())) continue;
    present.set(email, { site: p.site, since: p.since, row: list[list.length - 1] });
  }

  const out = new Map<string, Candidate>();
  const fromPlan = (p: any): Candidate => ({
    person_key: `emp:${p.emp_id}`,
    emp_id: p.emp_id,
    email: null,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.emp_id,
    gender: p.gender,
    area: p.area,
    flag_no: p.flag_no,
    assembly_point: p.assembly_point,
    is_leader: /ผู้นำ/.test(p.role ?? ""),
    presence: "plan",
    presence_site: null,
    presence_since: null,
    plate: null,
  });

  if (inc.include_plan) for (const p of plan) out.set(`emp:${p.emp_id}`, fromPlan(p));

  for (const [email, pr] of present) {
    const emp = linkMap.get(email);
    const planRow = emp ? planMap.get(emp) : null;
    if (planRow) {
      const c = out.get(`emp:${emp}`) ?? fromPlan(planRow);
      out.set(c.person_key, {
        ...c,
        email,
        presence: "div",
        presence_site: pr.site,
        presence_since: pr.since.toISOString(),
      });
    } else {
      // อยู่ในพื้นที่แต่จับคู่กับแผนอพยพไม่ได้ → ไม่ระบุธง
      out.set(`div:${email}`, {
        person_key: `div:${email}`,
        emp_id: emp ?? null,
        email,
        name: pr.row.full_name || email,
        gender: pr.row.gender,
        area: null,
        flag_no: null,
        assembly_point: null,
        is_leader: false,
        presence: "div",
        presence_site: pr.site,
        presence_since: pr.since.toISOString(),
        plate: null,
      });
    }
  }

  // คนขับจาก KIOS: หนึ่งคันหนึ่งคน key = ทะเบียนรถ ไปรวมที่ธงที่ตั้งไว้ (ไม่ตั้ง = ไม่ระบุธง)
  const dflag = driverFlag ?? null;
  const dap = dflag === null ? null : leaders.find((l) => l.flag_no === dflag)?.assembly_point ?? null;
  for (const v of vehicles) {
    out.set(`plate:${v.plate}`, {
      person_key: `plate:${v.plate}`,
      emp_id: null,
      email: null,
      name: v.driver_name ? `${v.driver_name}` : `คนขับรถ ${v.plate_display ?? v.plate}`,
      gender: null,
      area: ["คนขับ", v.company].filter(Boolean).join(" "),
      flag_no: dflag,
      assembly_point: dap,
      is_leader: false,
      presence: "kiosk",
      presence_site: v.zone,
      presence_since: v.checkin_at ? new Date(v.checkin_at).toISOString() : null,
      plate: v.plate_display ?? v.plate,
    });
  }
  return [...out.values()];
}

/**
 * merge ผลลง incident_people ตามกฎ:
 * - บวกอย่างเดียว ห้ามลบ
 * - ห้ามทับสถานะที่คนกดแล้ว (อัปเดตแค่ข้อมูลตำแหน่ง)
 * - คนที่หายจากแหล่งข้อมูล ติดป้าย still_in_source=false
 */
export async function mergeIntoIncident(incidentId: number, addedBy: "snapshot" | "sync") {
  const inc = await getIncident(incidentId);
  if (!inc) throw new Error("ไม่พบเหตุการณ์");
  if (inc.closed_at) return { added: 0 };
  const cands = await buildCandidates(inc);

  const ins = await q(
    `INSERT INTO incident_people (incident_id, person_key, emp_id, email, name, gender, area, flag_no,
       assembly_point, is_leader, presence, presence_site, presence_since, added_by, plate)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
       $8::int[], $9::text[], $10::bool[], $11::text[], $12::text[], $13::timestamptz[], $14::text[], $15::text[])
     ON CONFLICT (incident_id, person_key) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, incident_people.email),
       presence = CASE WHEN EXCLUDED.presence IN ('div','kiosk') THEN EXCLUDED.presence ELSE incident_people.presence END,
       presence_site = COALESCE(EXCLUDED.presence_site, incident_people.presence_site),
       presence_since = COALESCE(EXCLUDED.presence_since, incident_people.presence_since),
       still_in_source = true
     RETURNING (xmax = 0) AS inserted`,
    [
      incidentId,
      cands.map((c) => c.person_key),
      cands.map((c) => c.emp_id),
      cands.map((c) => c.email),
      cands.map((c) => c.name),
      cands.map((c) => c.gender),
      cands.map((c) => c.area),
      cands.map((c) => c.flag_no),
      cands.map((c) => c.assembly_point),
      cands.map((c) => c.is_leader),
      cands.map((c) => c.presence),
      cands.map((c) => c.presence_site),
      cands.map((c) => c.presence_since),
      cands.map(() => addedBy),
      cands.map((c) => c.plate),
    ],
  );

  await q(
    `UPDATE incident_people SET still_in_source = false
     WHERE incident_id = $1 AND added_by <> 'manual' AND NOT (person_key = ANY($2::text[]))`,
    [incidentId, cands.map((c) => c.person_key)],
  );
  return { added: ins.filter((r: any) => r.inserted).length };
}

export async function openIncident(opts: { mode: "real" | "drill"; title?: string; divSites?: string[]; includePlan?: boolean }) {
  const inc = await one<{ id: number }>(
    `INSERT INTO incidents (mode, title, div_sites, include_plan) VALUES ($1, $2, $3, $4) RETURNING id`,
    [opts.mode, opts.title || null, opts.divSites?.length ? opts.divSites : null, opts.includePlan ?? true],
  );
  await mergeIntoIncident(Number(inc!.id), "snapshot");
  return Number(inc!.id);
}

export async function getIncident(id: number): Promise<Incident | null> {
  const r = await one<any>(`SELECT * FROM incidents WHERE id = $1`, [id]);
  if (!r) return null;
  return {
    ...r,
    id: Number(r.id),
    opened_at: new Date(r.opened_at).toISOString(),
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    first_full_at: r.first_full_at ? new Date(r.first_full_at).toISOString() : null,
  };
}

export async function listIncidents(): Promise<(Incident & { total: number; pending: number })[]> {
  const rows = await q<any>(
    `SELECT i.*, count(p.*)::int AS total, count(p.*) FILTER (WHERE p.status = 'pending')::int AS pending
     FROM incidents i LEFT JOIN incident_people p ON p.incident_id = i.id
     GROUP BY i.id ORDER BY i.opened_at DESC LIMIT 50`,
  );
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    opened_at: new Date(r.opened_at).toISOString(),
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    first_full_at: r.first_full_at ? new Date(r.first_full_at).toISOString() : null,
  }));
}

export async function getPeople(incidentId: number, flag?: number | "none"): Promise<Person[]> {
  const where =
    flag === undefined ? "" : flag === "none" ? "AND flag_no IS NULL" : "AND flag_no = $2";
  const params: unknown[] = [incidentId];
  if (typeof flag === "number") params.push(flag);
  const rows = await q<any>(
    `SELECT * FROM incident_people WHERE incident_id = $1 ${where}
     ORDER BY flag_no NULLS LAST, is_leader DESC, name`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    presence_since: r.presence_since ? new Date(r.presence_since).toISOString() : null,
    status_at: r.status_at ? new Date(r.status_at).toISOString() : null,
    added_at: new Date(r.added_at).toISOString(),
  }));
}

export async function setStatus(incidentId: number, personKey: string, status: Status, by: string) {
  if (!STATUSES.includes(status)) throw new Error("สถานะไม่ถูกต้อง");
  const inc = await getIncident(incidentId);
  if (!inc || inc.closed_at) throw new Error("เหตุการณ์ปิดแล้ว");
  const prev = await one<{ status: string }>(
    `SELECT status FROM incident_people WHERE incident_id = $1 AND person_key = $2`,
    [incidentId, personKey],
  );
  if (!prev) throw new Error("ไม่พบรายชื่อนี้ในเหตุการณ์");
  await q(
    `UPDATE incident_people SET status = $3, status_by = $4, status_at = now()
     WHERE incident_id = $1 AND person_key = $2`,
    [incidentId, personKey, status, by || null],
  );
  // เก็บ log ทุกการเปลี่ยน ห้าม overwrite ทิ้ง
  await q(
    `INSERT INTO status_log (incident_id, person_key, from_status, to_status, by_name) VALUES ($1, $2, $3, $4, $5)`,
    [incidentId, personKey, prev.status, status, by || null],
  );
  // บันทึกเวลาที่นับครบครั้งแรก (ใช้วัดผลการซ้อม)
  await q(
    `UPDATE incidents SET first_full_at = now()
     WHERE id = $1 AND first_full_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM incident_people WHERE incident_id = $1 AND status = 'pending')`,
    [incidentId],
  );
}

export async function addManualPerson(
  incidentId: number,
  p: { name: string; gender?: string | null; flag_no?: number | null; note?: string; by?: string },
) {
  const key = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  await q(
    `INSERT INTO incident_people (incident_id, person_key, name, gender, flag_no, area, presence, added_by, status_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual', 'manual', $7)`,
    [incidentId, key, p.name.trim(), p.gender || null, p.flag_no ?? null, p.note || null, p.by || null],
  );
  return key;
}

export async function closeIncident(incidentId: number) {
  await q(`UPDATE incidents SET closed_at = now() WHERE id = $1 AND closed_at IS NULL`, [incidentId]);
}
