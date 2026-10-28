import { normFlag } from "./flag";
import { normalizePlate } from "./kioskMap";
import { isLatin } from "./names";
import { codeKind, codePhrase, codeMeaning, cleanKinds, DEFAULT_KINDS, type CodeKind } from "./codes";
export type { CodeKind } from "./codes";
import { UserError } from "./errors";
import { q, one } from "./db";
import { outsourcePresent } from "./outsource";
import { computePresence } from "./presence";
import { getSetting } from "./settings";
import type { Actor } from "./auth";

// สถานะคนตาม Flow ใน mockup
export type Status = "unk" | "in" | "safe" | "inj" | "cmd" | "abs" | "gone";
export const STATUSES: Status[] = ["unk", "in", "safe", "inj", "cmd", "abs", "gone"];
export const EVACUATED: Status[] = ["safe", "inj", "cmd"]; // อพยพแล้ว
export const MISSING: Status[] = ["unk", "in"]; // ผู้สูญหาย
export const TRIAGE = ["green", "yellow", "red", "black"] as const;

export type Incident = {
  id: number;
  mode: "real" | "drill";
  state: "pending" | "active" | "closed" | "cancelled";
  title: string | null;
  kind: string | null;
  area: string | null;
  reported_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  closed_points: string[] | null;
  plan_version: number | null;
  plan_name?: string | null;
  div_sites: string[] | null;
  include_plan: boolean;
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  first_full_at: string | null;
};

const iso = (v: any) => (v ? new Date(v).toISOString() : null);

function rowToIncident(r: any): Incident {
  return {
    ...r,
    id: Number(r.id),
    opened_at: iso(r.opened_at)!,
    closed_at: iso(r.closed_at),
    confirmed_at: iso(r.confirmed_at),
    first_full_at: iso(r.first_full_at),
  };
}

/** วันที่ตามเวลาไทย ใช้กับ มา/ไม่มา วันนี้ */
export const bangkokDay = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

type Candidate = {
  person_key: string; emp_id: string | null; email: string | null; plate: string | null;
  name: string; gender: string | null; area: string | null; cost_center: string | null; cc_name: string | null;
  tel: string | null; flag_no: string | null; assembly_point: string | null; is_leader: boolean;
  presence: string; presence_site: string | null; presence_since: string | null; here: boolean; source: string;
  /** เหตุผลที่ระบบตัดสิน มา/ไม่มา (เทียบผลตรวจทานธงกับข้อมูลเข้า-ออก) */
  note?: string | null;
  /** ชื่อภาษาอังกฤษ (ชุดธง → โปรไฟล์ → ชื่อที่กรอกใน MS Form ถ้าเป็นภาษาอังกฤษ) */
  name_en?: string | null;
};

/** รายชื่อที่ควรอยู่ในเหตุการณ์: แผนอพยพ (หักคนที่ลบ) + คนที่อยู่ในพื้นที่จากแต่ละแหล่ง */
async function buildCandidates(inc: Incident, now = new Date()): Promise<Candidate[]> {
  const [plan, links, checkins, vehicles, driverFlag, att, ccNames, profiles, osPresent, osStaff] = await Promise.all([
    q<any>(`SELECT * FROM evac_plan WHERE NOT removed`),
    q<any>(`SELECT lower(email) AS email, emp_id FROM person_links`),
    q<any>(
      `SELECT lower(email) AS email, full_name, gender, site, submitted_at FROM div_checkins
       WHERE submitted_at > $1::timestamptz - interval '48 hours' ORDER BY submitted_at`,
      [now.toISOString()],
    ),
    q<any>(`SELECT * FROM driver_presence`),
    getSetting<string | number | null>("driver_flag", null).then((v) => normFlag(v)),
    q<any>(`SELECT person_key, here FROM attendance WHERE day = $1`, [bangkokDay(now)]),
    q<any>(`SELECT code AS cost_center, name FROM cost_centers
            UNION ALL
            SELECT cost_center, mode() WITHIN GROUP (ORDER BY area) FROM evac_plan
            WHERE cost_center IS NOT NULL AND cost_center NOT IN (SELECT code FROM cost_centers) GROUP BY cost_center`),
    q<any>(`SELECT code, tel, name_en FROM profiles WHERE tel IS NOT NULL OR name_en IS NOT NULL`),
    outsourcePresent(now),
    q<any>(`SELECT * FROM outsource_staff`),
  ]);
  // Outsource ที่ระบบรู้จัก (มีในรายชื่อ DC_FTE หรือเคยบันทึกเข้า-ออกใน 14 วัน) → บอกได้ว่าไม่อยู่
  const osKnown = new Set<string>([
    ...osStaff.map((x: any) => x.emp_id),
    ...(await q<{ emp_id: string }>(`SELECT DISTINCT emp_id FROM outsource_attendance WHERE received_at > now() - interval '14 days'`)).map((x) => x.emp_id),
  ]);
  const linkMap = new Map<string, string>(links.map((l) => [l.email, l.emp_id]));
  const planMap = new Map<string, any>(plan.map((p) => [p.emp_id, p]));
  const hereMap = new Map<string, boolean>(att.map((a) => [a.person_key, a.here]));
  const ccMap = new Map<string, string>(ccNames.map((c) => [c.cost_center, c.name]));
  const telMap = new Map<string, string>(profiles.map((p) => [p.code, p.tel]));
  const flagPoint = new Map<string, string>();
  for (const p of plan) if (p.flag_no != null && p.assembly_point && !flagPoint.has(p.flag_no)) flagPoint.set(p.flag_no, p.assembly_point);
  const sites = (inc.div_sites ?? []).map((s) => s.toUpperCase());

  const byEmail = new Map<string, any[]>();
  for (const c of checkins) byEmail.set(c.email, [...(byEmail.get(c.email) ?? []), c]);
  const present = new Map<string, { site: string | null; since: Date; row: any }>();
  for (const [email, list] of byEmail) {
    const p = computePresence(list.map((c) => ({ at: new Date(c.submitted_at), site: c.site })), now);
    if (p.state !== "in") continue;
    if (sites.length && !sites.includes((p.site ?? "").toUpperCase())) continue;
    present.set(email, { site: p.site, since: p.since, row: list[list.length - 1] });
  }

  // DIV+: อีเมลที่จับคู่รหัสแล้ว และมีการส่งฟอร์มใน 48 ชม. → บอกได้ว่าเข้า/ออก
  const divByEmp = new Map<string, { inNow: boolean; last: Date }>();
  for (const [email, list] of byEmail) {
    const emp = linkMap.get(email);
    if (!emp) continue;
    const last = new Date(list[list.length - 1].submitted_at);
    const prev = divByEmp.get(emp);
    divByEmp.set(emp, { inNow: (prev?.inNow ?? false) || present.has(email), last: prev && prev.last > last ? prev.last : last });
  }
  const osIn = new Map<string, any>(osPresent.map((a: any) => [a.emp_id, a]));
  const hhmm = (d: Date | string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  /** เทียบผลตรวจทานธง (มา/ไม่มา) กับข้อมูลเข้า-ออกจากระบบ */
  const decide = (emp: string, key: string): { here: boolean; note: string | null } => {
    const marked = hereMap.get(key); // true = มา, false = ไม่มา, undefined = ยังไม่ตรวจ
    const os = osIn.get(emp);
    const dv = divByEmp.get(emp);
    const sysIn = !!os || !!dv?.inNow;
    const sysKnown = sysIn || osKnown.has(emp) || !!dv;
    const where = os ? `Outsource เข้า ${hhmm(os.clock_in)}` : dv?.inNow ? `DIV+ เช็คอิน` : null;
    if (marked === false) {
      return sysIn ? { here: true, note: `ตรวจทานว่าไม่มา แต่ระบบเห็นว่าอยู่ (${where}) ต้องนับ` } : { here: false, note: "ตรวจทานธง: ไม่มา" };
    }
    if (marked === true) return { here: true, note: null };
    if (sysKnown && !sysIn) return { here: false, note: osKnown.has(emp) ? "ระบบ: Outsource ไม่ได้ Clock in / Clock out แล้ว" : `ระบบ: DIV+ เช็คเอาท์แล้ว (ล่าสุด ${hhmm(dv!.last)})` };
    return { here: true, note: null };
  };

  const out = new Map<string, Candidate>();
  const fromPlan = (p: any): Candidate => {
    const key = `emp:${p.emp_id}`;
    const dc = decide(p.emp_id, key);
    return {
      person_key: key, emp_id: p.emp_id, email: null, plate: null,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.emp_id,
      gender: p.gender, area: p.area, cost_center: p.cost_center, cc_name: p.cost_center ? ccMap.get(p.cost_center) ?? null : null,
      tel: p.tel ?? telMap.get(p.emp_id) ?? null, flag_no: p.flag_no,
      assembly_point: p.assembly_point ?? (p.flag_no != null ? flagPoint.get(p.flag_no) ?? null : null),
      is_leader: /^\s*ผู้นำ/.test(p.role ?? ""), presence: "plan", presence_site: null, presence_since: null,
      here: dc.here, note: dc.note, source: p.added_manually ? "เพิ่มจากหน้าตรวจทาน" : "แผนอพยพ (Excel)",
    };
  };
  if (inc.include_plan) for (const p of plan) out.set(`emp:${p.emp_id}`, fromPlan(p));

  for (const [email, pr] of present) {
    const emp = linkMap.get(email);
    const planRow = emp ? planMap.get(emp) : null;
    if (planRow) {
      const c = out.get(`emp:${emp}`) ?? fromPlan(planRow);
      out.set(c.person_key, { ...c, email, presence: "div", presence_site: pr.site, presence_since: pr.since.toISOString(), source: "MS Form" });
    } else {
      const key = `div:${email}`;
      out.set(key, {
        person_key: key, emp_id: emp ?? null, email, plate: null, name: pr.row.full_name || email, gender: pr.row.gender,
        area: null, cost_center: null, cc_name: null, tel: null, flag_no: null, assembly_point: null, is_leader: false,
        presence: "div", presence_site: pr.site, presence_since: pr.since.toISOString(), here: hereMap.get(key) ?? true, source: "MS Form",
      });
    }
  }

  // Outsource จาก Power Apps: เข้างานภายใน 14 ชม. และยังไม่ออก
  const staffMap = new Map<string, any>(osStaff.map((s) => [s.emp_id, s]));
  for (const a of osPresent) {
    const planRow = planMap.get(a.emp_id);
    if (planRow) {
      const c = out.get(`emp:${a.emp_id}`) ?? fromPlan(planRow);
      out.set(c.person_key, { ...c, presence: "outsource", presence_site: a.site, presence_since: a.clock_in, source: "Outsource (Power Apps)" });
      continue;
    }
    const st = staffMap.get(a.emp_id);
    const key = `os:${a.emp_id}`;
    const cc = st?.cost_center ?? null;
    out.set(key, {
      person_key: key, emp_id: a.emp_id, email: null, plate: null,
      name: [st?.first_name, st?.last_name].filter(Boolean).join(" ") || `Outsource ${a.emp_id}`, gender: null,
      area: "Outsource", cost_center: cc, cc_name: cc ? ccMap.get(cc) ?? null : null, tel: telMap.get(a.emp_id) ?? null,
      flag_no: null, assembly_point: null, is_leader: false,
      presence: "outsource", presence_site: a.site, presence_since: a.clock_in, here: hereMap.get(key) ?? true, source: "Outsource (Power Apps)",
    });
  }

  // ทะเบียนรถที่ลงทะเบียนไว้ในโปรไฟล์ → รู้ว่าเป็นใคร
  const plates = (await q<any>(`SELECT code, name, cost_center, tel, plate FROM profiles WHERE plate IS NOT NULL AND plate <> ''`))
    .map((p) => ({ ...p, key: normalizePlate(p.plate) })).filter((p) => p.key.length >= 4);
  const byPlate = (vp: string) => plates.find((p) => vp === p.key || (vp.startsWith(p.key) && !/^\d/.test(vp.slice(p.key.length))));

  // คนขับจาก KIOS: หนึ่งคันหนึ่งคน key = ทะเบียนรถ
  for (const v of vehicles) {
    const key = `plate:${v.plate}`;
    const owner = String(v.plate).startsWith("ID-") ? undefined : byPlate(String(v.plate));
    const ownerPlan = owner ? planMap.get(owner.code) : null;
    if (owner && ownerPlan) {
      // เป็นพนักงานในชุดธง: ใช้แถวของคนนั้น (ไม่สร้างคนขับซ้ำ)
      const c = out.get(`emp:${owner.code}`) ?? fromPlan(ownerPlan);
      out.set(c.person_key, { ...c, plate: v.plate_display ?? v.plate, presence: "kiosk", presence_site: v.zone, presence_since: iso(v.checkin_at),
        here: true, note: null, source: "Driver (KIOS) · ทะเบียนตรงโปรไฟล์" });
      continue;
    }
    out.set(key, {
      person_key: key, emp_id: owner?.code ?? null, email: null, plate: v.plate_display ?? v.plate,
      name: owner?.name || v.driver_name || `คนขับรถ ${v.plate_display ?? v.plate}`, gender: null,
      area: ["คนขับ", v.company].filter(Boolean).join(" "), cost_center: owner?.cost_center ?? "DRIVER", cc_name: owner ? null : "คนขับ (KIOS)",
      tel: owner?.tel ?? v.phone, flag_no: driverFlag ?? null, assembly_point: driverFlag != null ? flagPoint.get(driverFlag) ?? null : null,
      is_leader: false, presence: "kiosk", presence_site: v.zone, presence_since: iso(v.checkin_at),
      here: hereMap.get(key) ?? true, source: "Driver (KIOS)",
    });
  }
  // ชื่ออังกฤษ: ชุดธง → โปรไฟล์ → ชื่อใน MS Form ที่พิมพ์เป็นภาษาอังกฤษ
  const enProf = new Map<string, string>(profiles.filter((p) => p.name_en).map((p) => [p.code, p.name_en]));
  const enDiv = new Map<string, string>();
  for (const c of checkins) if (c.full_name && isLatin(c.full_name)) enDiv.set(c.email, String(c.full_name).trim());
  for (const c of out.values()) {
    const pl = c.emp_id ? planMap.get(c.emp_id) : null;
    c.name_en = pl?.name_en || (c.emp_id ? enProf.get(c.emp_id) : null) || (c.email ? enDiv.get(c.email) : null) || null;
  }
  return [...out.values()];
}

/**
 * merge ตามกฎ: บวกอย่างเดียว ห้ามลบ ห้ามทับสถานะที่คนระบุแล้ว
 * คนใหม่: มา = ยังไม่ทราบ, ไม่มา = ปลอดภัยตามระบบ (รอยืนยัน)
 */
export async function mergeIntoIncident(incidentId: number, addedBy: "snapshot" | "sync") {
  const inc = await getIncident(incidentId);
  if (!inc) throw new UserError("ไม่พบเหตุการณ์");
  if (inc.state !== "active") return { added: 0 };
  const C = await buildCandidates(inc);
  const col = <K extends keyof Candidate>(k: K) => C.map((c) => c[k]);
  const ins = await q(
    `INSERT INTO incident_people (incident_id, person_key, emp_id, email, plate, name, gender, area, cost_center, cc_name,
       tel, flag_no, assembly_point, is_leader, presence, presence_site, presence_since, here, source, status, added_by, status_note, name_en)
     SELECT $1, k, e, m, pl, n, g, a, cc, ccn, t, f, ap, l, pr, ps, psi, h, src, CASE WHEN h THEN 'unk' ELSE 'abs' END, $20, nt, ne
     FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
       $11::text[], $12::text[], $13::text[], $14::bool[], $15::text[], $16::text[], $17::timestamptz[], $18::bool[], $19::text[], $21::text[], $22::text[])
       AS x(k, e, m, pl, n, g, a, cc, ccn, t, f, ap, l, pr, ps, psi, h, src, nt, ne)
     ON CONFLICT (incident_id, person_key) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, incident_people.email),
       name_en = COALESCE(incident_people.name_en, EXCLUDED.name_en),
       presence = CASE WHEN EXCLUDED.presence IN ('div','kiosk','outsource') THEN EXCLUDED.presence ELSE incident_people.presence END,
       presence_site = COALESCE(EXCLUDED.presence_site, incident_people.presence_site),
       presence_since = COALESCE(EXCLUDED.presence_since, incident_people.presence_since),
       still_in_source = true
     RETURNING (xmax = 0) AS inserted`,
    [
      incidentId, col("person_key"), col("emp_id"), col("email"), col("plate"), col("name"), col("gender"), col("area"),
      col("cost_center"), col("cc_name"), col("tel"), col("flag_no"), col("assembly_point"), col("is_leader"), col("presence"),
      col("presence_site"), col("presence_since"), col("here"), col("source"), addedBy, C.map((c) => c.note ?? null), C.map((c) => c.name_en ?? null),
    ],
  );
  await q(
    `UPDATE incident_people SET still_in_source = false
     WHERE incident_id = $1 AND added_by <> 'manual' AND NOT (person_key = ANY($2::text[]))`,
    [incidentId, col("person_key")],
  );
  return { added: ins.filter((r: any) => r.inserted).length };
}

async function latestVersion() {
  // เวอร์ชันที่ Admin เลือกใช้อยู่ (ถ้าไม่ได้เลือก = ล่าสุด)
  const r = await one<{ id: number }>(
    `SELECT id FROM plan_versions WHERE id = (SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'active_plan_version')
     UNION ALL (SELECT id FROM plan_versions ORDER BY id DESC LIMIT 1) LIMIT 1`);
  return r?.id ?? null;
}

/** แจ้งเหตุ (ต้องระบุตัวตน) → รอ Admin / Safety Officer ยืนยัน */
export async function reportIncident(o: { kind: string; area: string; by: string; mode?: "real" | "drill" }) {
  // ขั้นตอนเดียวกันทั้งเหตุจริงและซ้อม: ผู้ใช้แจ้ง → Admin / Safety ยืนยัน → เริ่มนับ
  // ระหว่างซ้อมแจ้งเหตุจริงได้ (ยืนยันแล้วจบการซ้อมให้อัตโนมัติ) · เหตุจริงแทนคำขอซ้อมที่ยังรอยืนยันได้
  const mode = o.mode === "drill" ? "drill" : "real";
  const pend = await pendingReal();
  if (pend) {
    if (!(mode === "real" && pend.mode === "drill")) return pend.id;
    await cancelIncident(pend.id, `${o.by} (แจ้งเหตุจริงแทนคำขอซ้อม)`);
  }
  const cur = await currentIncident();
  if (cur && cur.state === "active" && (cur.mode === "real" || mode === "drill")) return cur.id;
  const r = await one<{ id: number }>(
    `INSERT INTO incidents (mode, state, kind, area, reported_by, title) VALUES ($5, 'pending', $1, $2, $3, $4) RETURNING id`,
    [o.kind, o.area, o.by, mode === "drill" ? `ซ้อมอพยพ: ${o.kind}` : o.kind, mode],
  );
  return Number(r!.id);
}

/** ยืนยันเหตุจริง: เริ่มนับเวลา snapshot รายชื่อ และปิดจุดรวมพลที่ใช้ไม่ได้ */
export async function confirmIncident(id: number, actor: Actor, closedPoints: string[]) {
  const inc = await getIncident(id);
  if (!inc || inc.state !== "pending") throw new UserError("เหตุการณ์นี้ไม่ได้รอยืนยัน");
  // เกิดเหตุจริงระหว่างซ้อม: จบการซ้อมก่อน แล้วเริ่มนับเหตุจริงใหม่
  if (inc.mode === "real") for (const d of await q<{ id: number }>(`SELECT id FROM incidents WHERE state = 'active' AND mode = 'drill'`))
    await q(`UPDATE incidents SET state = 'closed', closed_at = now(), closed_by = $2 WHERE id = $1 AND state = 'active'`,
      [d.id, `${actor.name} (เกิดเหตุจริงระหว่างซ้อม)`]);
  await q(
    `UPDATE incidents SET state = 'active', confirmed_by = $2, confirmed_at = now(), opened_at = now(),
       closed_points = $3, plan_version = $4 WHERE id = $1`,
    [id, actor.name, closedPoints.length ? closedPoints : null, await latestVersion()],
  );
  await mergeIntoIncident(id, "snapshot");
}

export async function cancelIncident(id: number, by: string) {
  await q(`UPDATE incidents SET state = 'cancelled', closed_at = now(), closed_by = $2 WHERE id = $1 AND state = 'pending'`, [id, by]);
}

export async function startDrill(actor: Actor, title?: string) {
  const cur = await currentIncident();
  if (cur) throw new UserError("มีเหตุการณ์ที่ยังไม่ปิดอยู่ ปิดก่อนจึงจะเริ่มซ้อมได้");
  const r = await one<{ id: number }>(
    `INSERT INTO incidents (mode, state, title, confirmed_by, confirmed_at, plan_version, include_plan)
     VALUES ('drill', 'active', $1, $2, now(), $3, true) RETURNING id`,
    [title || `ซ้อมอพยพ ${new Date().getFullYear()}`, actor.name, await latestVersion()],
  );
  await mergeIntoIncident(Number(r!.id), "snapshot");
  return Number(r!.id);
}

/** ปิดเคสได้เสมอ แต่แจ้งจำนวนปลอดภัยตามระบบที่ยังรอยืนยัน */
export async function closeIncident(id: number, actor: Actor) {
  const pend = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM incident_people WHERE incident_id = $1 AND status = 'abs'`, [id]);
  await q(`UPDATE incidents SET state = 'closed', closed_at = now(), closed_by = $2 WHERE id = $1 AND state = 'active'`, [id, actor.name]);
  return { absPending: pend?.n ?? 0, summary: await incidentSummary(id) };
}

/** สรุปผลคร่าว ๆ ตอนจบ (ใช้ในแจ้งเตือน) */
export async function incidentSummary(id: number) {
  const inc = await getIncident(id);
  const r = await one<any>(
    `SELECT count(*) FILTER (WHERE status NOT IN ('abs','gone'))::int AS pool,
       count(*) FILTER (WHERE status IN ('safe','cmd'))::int AS safe,
       count(*) FILTER (WHERE status = 'inj')::int AS inj,
       count(*) FILTER (WHERE status = 'in')::int AS inside,
       count(*) FILTER (WHERE status = 'unk')::int AS unk,
       count(*) FILTER (WHERE status = 'abs')::int AS abs
     FROM incident_people WHERE incident_id = $1`, [id]);
  // เวลานับรายชื่อ เริ่มเมื่อมีคนแรกยืนยัน
  const first = await one<{ at: string | null }>(
    `SELECT min(status_at) AS at FROM incident_people WHERE incident_id = $1 AND status IN ('safe','cmd','inj')`, [id]);
  const end = inc?.first_full_at ?? inc?.closed_at ?? new Date().toISOString();
  const ms = inc && first?.at ? new Date(end).getTime() - new Date(first.at).getTime() : 0;
  const mm = Math.max(0, Math.floor(ms / 60000)), ss = Math.max(0, Math.floor((ms % 60000) / 1000));
  const pct = r?.pool ? Math.round(((r.safe + r.inj) / r.pool) * 100) : 0;
  return {
    mode: inc?.mode ?? "drill", title: inc?.title ?? null, kind: inc?.kind ?? null,
    pool: r?.pool ?? 0, safe: r?.safe ?? 0, inj: r?.inj ?? 0, inside: r?.inside ?? 0, unk: r?.unk ?? 0, abs: r?.abs ?? 0,
    pct, duration: `${mm}:${String(ss).padStart(2, "0")}`, full: !!inc?.first_full_at,
  };
}

export async function getIncident(id: number): Promise<Incident | null> {
  const r = await one<any>(`SELECT i.*, v.name AS plan_name FROM incidents i LEFT JOIN plan_versions v ON v.id = i.plan_version WHERE i.id = $1`, [id]);
  return r ? rowToIncident(r) : null;
}

/** เหตุที่แจ้งเข้ามาแล้วรอยืนยัน (เหตุจริงอาจเกิดระหว่างที่กำลังซ้อมอยู่) */
export async function pendingReal(): Promise<Incident | null> {
  const r = await one<any>(`SELECT i.*, NULL AS plan_name FROM incidents i WHERE i.state = 'pending' ORDER BY i.id DESC LIMIT 1`);
  return r ? rowToIncident(r) : null;
}

export async function currentIncident(): Promise<Incident | null> {
  const r = await one<any>(
    `SELECT i.*, v.name AS plan_name FROM incidents i LEFT JOIN plan_versions v ON v.id = i.plan_version
     WHERE i.state IN ('pending','active') ORDER BY (i.state = 'active') DESC, i.id DESC LIMIT 1`);
  return r ? rowToIncident(r) : null;
}

export async function listIncidents() {
  const rows = await q<any>(
    `SELECT i.*, count(p.*)::int AS total,
       count(p.*) FILTER (WHERE p.status IN ('unk','in'))::int AS missing
     FROM incidents i LEFT JOIN incident_people p ON p.incident_id = i.id
     WHERE i.state <> 'cancelled' GROUP BY i.id ORDER BY i.id DESC LIMIT 50`);
  return rows.map((r) => ({ ...rowToIncident(r), total: r.total, missing: r.missing }));
}

export async function getPeople(incidentId: number) {
  const rows = await q<any>(
    `SELECT * FROM incident_people WHERE incident_id = $1 ORDER BY flag_key(flag_no) NULLS LAST, flag_no, is_leader DESC, name`, [incidentId]);
  return rows.map((r) => ({
    ...r,
    incident_id: Number(r.incident_id),
    presence_since: iso(r.presence_since),
    status_at: iso(r.status_at),
    added_at: iso(r.added_at),
  }));
}

async function assertActive(incidentId: number) {
  const inc = await getIncident(incidentId);
  if (!inc || inc.state !== "active") throw new UserError("เหตุการณ์นี้ไม่ได้เปิดอยู่");
  return inc;
}

async function updateFirstFull(incidentId: number) {
  await q(
    `UPDATE incidents SET first_full_at = now()
     WHERE id = $1 AND first_full_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM incident_people WHERE incident_id = $1 AND status IN ('unk','in'))`,
    [incidentId]);
}

async function applyStatus(incidentId: number, key: string, status: Status, by: string, note?: string | null) {
  const prev = await one<{ status: string }>(
    `SELECT status FROM incident_people WHERE incident_id = $1 AND person_key = $2`, [incidentId, key]);
  if (!prev) throw new UserError("ไม่พบรายชื่อนี้ในเหตุการณ์");
  await q(
    `UPDATE incident_people SET status = $3, status_by = $4, status_at = now(),
       status_note = CASE WHEN $5::text IS NULL THEN status_note ELSE $5 END
     WHERE incident_id = $1 AND person_key = $2`,
    [incidentId, key, status, by || null, note ?? null]);
  // เก็บ log ทุกการเปลี่ยน ห้าม overwrite ทิ้ง
  await q(`INSERT INTO status_log (incident_id, person_key, from_status, to_status, by_name) VALUES ($1, $2, $3, $4, $5)`,
    [incidentId, key, prev.status, status, by || null]);
}

export async function setStatus(incidentId: number, key: string, status: Status, by: string, note?: string | null) {
  if (!STATUSES.includes(status)) throw new UserError("สถานะไม่ถูกต้อง");
  await assertActive(incidentId);
  await applyStatus(incidentId, key, status, by, note);
  await updateFirstFull(incidentId);
}

/**
 * เช็คชื่อทั้งธง (ซ้อมเท่านั้น): จำนวนที่นับได้ต้องตรงกับ ติ๊ก + คนที่ระบุไปแล้วที่จุดรวมพล
 * ติ๊ก = ปลอดภัย (หรือบาดเจ็บ) ไม่ติ๊ก = คงสถานะเดิม
 */
export async function rollCall(incidentId: number, o: { flag: string; safe: string[]; inj: string[]; count: number; by: string }) {
  const inc = await assertActive(incidentId);
  if (inc.mode !== "drill") throw new UserError("เช็คชื่อทั้งธงใช้ได้เฉพาะการซ้อม");
  const members = await q<any>(
    `SELECT person_key, status FROM incident_people WHERE incident_id = $1 AND flag_no = $2`, [incidentId, o.flag]);
  const open = new Set(members.filter((m) => m.status === "unk" || m.status === "abs").map((m) => m.person_key));
  const keys = [...new Set([...o.safe, ...o.inj])];
  if (keys.some((k) => !open.has(k))) throw new UserError("มีรายชื่อที่ถูกระบุสถานะไปแล้ว รีเฟรชแล้วลองใหม่");
  const done = members.filter((m) => m.status === "safe" || m.status === "inj").length;
  if (o.count !== keys.length + done) throw new UserError(`จำนวนไม่ตรง: นับได้ ${o.count} แต่รายชื่อที่จุดรวมพล ${keys.length + done}`);
  const tag = `${o.by || `ผู้นำธง ${o.flag}`} (เช็คชื่อทั้งธง · นับได้ ${o.count})`;
  const inj = new Set(o.inj);
  for (const k of keys) await applyStatus(incidentId, k, inj.has(k) ? "inj" : "safe", tag);
  await updateFirstFull(incidentId);
  return { updated: keys.length };
}

export async function setInjury(incidentId: number, key: string, o: { triage?: string | null; symptoms?: string; hospital?: string }, actor: Actor) {
  await assertActive(incidentId);
  if (o.triage && !TRIAGE.includes(o.triage as any)) throw new UserError("ระดับไม่ถูกต้อง");
  const p = await one<any>(`SELECT status FROM incident_people WHERE incident_id = $1 AND person_key = $2`, [incidentId, key]);
  if (!p) throw new UserError("ไม่พบรายชื่อนี้");
  if (p.status !== "inj") await applyStatus(incidentId, key, "inj", actor.name);
  await q(
    `UPDATE incident_people SET triage = $3, symptoms = $4, hospital = $5, triage_by = $6
     WHERE incident_id = $1 AND person_key = $2`,
    [incidentId, key, o.triage ?? null, o.symptoms ?? null, o.hospital ?? null, actor.name]);
  await updateFirstFull(incidentId);
}

export async function addManualPerson(
  incidentId: number,
  p: { name: string; gender?: string | null; flag_no?: string | null; note?: string; by?: string },
) {
  await assertActive(incidentId);
  const key = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  const ap = p.flag_no != null
    ? (await one<{ ap: string }>(`SELECT max(assembly_point) AS ap FROM evac_plan WHERE flag_no = $1`, [p.flag_no]))?.ap ?? null
    : null;
  await q(
    `INSERT INTO incident_people (incident_id, person_key, name, gender, flag_no, assembly_point, area, presence, added_by,
       status, here, source, status_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', 'manual', 'unk', true, 'เพิ่มระหว่างเหตุ', $8)`,
    [incidentId, key, p.name.trim(), p.gender || null, p.flag_no ?? null, ap, p.note || null, p.by || null]);
  await q(`UPDATE incidents SET first_full_at = NULL WHERE id = $1`, [incidentId]);
  return key;
}

const CODE_DEFAULT: Record<CodeKind, { label: string; tone: string; meaning: string }> = {
  check: { label: "Code 500", tone: "warn", meaning: "ทีมฉุกเฉินไปตรวจสอบ · พนักงานเตรียมพร้อม ยังไม่ต้องอพยพ" },
  urgent: { label: "Code 500 ด่วนมาก", tone: "err", meaning: "อพยพไปจุดรวมพลทันที" },
  clear: { label: "คุณสบายใจ", tone: "grey", meaning: "เหตุการณ์กลับเข้าสู่ภาวะปกติ" },
  other: { label: "", tone: "grey", meaning: "" },
};

/**
 * ประกาศ Code (ได้ทั้งตอนรอยืนยันและตอนเริ่มแล้ว) · ระบุ code_id หรือชนิด (kind) ก็ได้
 * คุณสบายใจ: ตอนรอยืนยัน = ยกเลิก (ไม่ใช่เหตุ) · ตอนเริ่มแล้ว = ปิดเหตุการณ์
 */
export async function announce(incidentId: number, codeId: number | null, label: string | null, actor: Actor, kind?: CodeKind | null) {
  const inc = await getIncident(incidentId);
  if (!inc || (inc.state !== "active" && inc.state !== "pending")) throw new UserError("เหตุการณ์นี้ไม่ได้เปิดอยู่");
  let code = codeId ? await one<any>(`SELECT * FROM announce_codes WHERE id = $1`, [codeId]) : null;
  if (!code && kind && kind !== "other")
    code = (await q<any>(`SELECT * FROM announce_codes ORDER BY sort, id`)).find((c) => codeKind(c) === kind) ?? null;
  const k: CodeKind = code ? codeKind(code) : kind ?? "other";
  // 500 / ด่วนมาก: ข้อความตามประเภทเหตุ เช่น "รัดประภา 520 ด่วนมาก ที่ ห้องเครื่อง"
  const cfg = cleanKinds(await getSetting("incident_kinds", DEFAULT_KINDS));
  const text = k === "check" || k === "urgent" ? codePhrase(cfg, inc.kind, inc.area, k === "urgent")
    : code?.label ?? (String(label ?? "").trim() || CODE_DEFAULT[k].label);
  if (!text) throw new UserError("ต้องระบุ Code");
  if (k === "urgent" && inc.state !== "active") throw new UserError("ยืนยันมีเหตุก่อน แล้วจึงแจ้ง 500 ด่วนมาก");
  const meaning = (k === "check" || k === "urgent" ? codeMeaning(cfg, inc.kind, k === "urgent") : "")
    || code?.meaning || CODE_DEFAULT[k].meaning || null;
  await q(
    `INSERT INTO incident_announcements (incident_id, code_id, label, tone, meaning, by_name, kind) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [incidentId, code?.id ?? null, text, code?.tone ?? CODE_DEFAULT[k].tone, meaning, actor.name, k]);
  let closed: any = null;
  if (k === "clear") {
    if (inc.state === "pending") await cancelIncident(incidentId, `${actor.name} (${text})`);
    else closed = await closeIncident(incidentId, actor);
  }
  return { inc, label: text, kind: k, meaning, closed };
}
