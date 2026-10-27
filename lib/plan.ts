import { UserError } from "./errors";
// ชุดธง: นำเข้า Excel, ตรวจทาน (แก้/ย้าย/เพิ่ม/ลบ + มา/ไม่มา), เวอร์ชัน และความแม่นยำของข้อมูลตั้งต้น
import { q, one } from "./db";
import { bangkokDay } from "./incident";
import { getSetting, setSetting } from "./settings";
import { normFlag } from "./flag";
import { stripPrefix } from "./names";
import type { PlanPerson, FlagLeader } from "./parsers";

const vname = (n?: string | null) => {
  const t = String(n ?? "").trim().slice(0, 80);
  return t || null;
};

const ACTIVE = "active_plan_version";
const CHANGED = "plan_changed_at";
/** มีการแก้ชุดธง (ใช้บอกว่ามีการแก้ที่ยังไม่บันทึกลงเวอร์ชัน) */
export const touchPlan = () => setSetting(CHANGED, new Date().toISOString());

async function snapshot() {
  const [people, leaders, points] = await Promise.all([
    q(`SELECT * FROM evac_plan`),
    q(`SELECT * FROM flag_leaders`),
    q(`SELECT * FROM assembly_points`),
  ]);
  return { count: people.filter((p: any) => !p.removed).length, data: JSON.stringify({ people, leaders, points }) };
}

/** ชื่อเวอร์ชันต้องมีและไม่ซ้ำ: ไม่ตั้ง = ใช้วันเวลา · ซ้ำ = ต่อท้าย (2), (3) */
async function uniqueName(n: string | null | undefined, fallback: string, exceptId?: number) {
  const base = vname(n) ?? fallback;
  const taken = new Set((await q<{ name: string }>(`SELECT name FROM plan_versions WHERE name IS NOT NULL AND id <> $1`, [exceptId ?? -1]))
    .map((r) => r.name.trim().toLowerCase()));
  let name = base, i = 2;
  while (taken.has(name.toLowerCase())) name = `${base} (${i++})`;
  return name;
}
const stamp = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2})T/, (_, y, m, d) => `${d}/${m}/${Number(y) + 543} `);

/** บันทึกชุดธงปัจจุบันเป็นเวอร์ชันใหม่ และตั้งเป็นเวอร์ชันที่ใช้อยู่ */
export async function saveVersion(note: string, by: string, name?: string | null) {
  const s = await snapshot();
  const nm = await uniqueName(name, `ชุดธง ${stamp()}`);
  const r = await one<{ id: number }>(
    `INSERT INTO plan_versions (note, created_by, people, data, name) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [note, by, s.count, s.data, nm]);
  await setSetting(ACTIVE, r!.id);
  await setSetting(CHANGED, null);
  return r!.id;
}

/** สร้างเวอร์ชันใหม่แบบว่าง (ไม่มีธงและรายชื่อ) แล้วใช้เลย · เวอร์ชันเก่ายังอยู่ครบ จุดรวมพลใช้ร่วมกัน */
export async function newBlankVersion(name: string, by: string) {
  await q(`DELETE FROM evac_plan`);
  await q(`DELETE FROM flag_leaders`);
  await q(`DELETE FROM flag_reviews`);
  return saveVersion("เริ่มชุดธงใหม่ (ว่าง)", by, name);
}

/** ทำสำเนาเวอร์ชัน (ไม่เปลี่ยนเวอร์ชันที่ใช้อยู่) */
export async function duplicateVersion(id: number, by: string, name?: string | null) {
  const v = await one<{ name: string | null }>(`SELECT name FROM plan_versions WHERE id = $1`, [id]);
  if (!v) throw new UserError("ไม่พบเวอร์ชันนี้");
  const nm = await uniqueName(name, `${v.name ?? "ชุดธง"} (สำเนา)`);
  const r = await one<{ id: number }>(
    `INSERT INTO plan_versions (note, created_by, people, data, name)
     SELECT $2, $3, people, data, $4 FROM plan_versions WHERE id = $1 RETURNING id`,
    [id, `สำเนาจาก “${v.name ?? "ไม่มีชื่อ"}”`, by, nm]);
  return { id: r!.id, name: nm };
}

export async function activeVersionId(): Promise<number | null> {
  const id = await getSetting<number | null>(ACTIVE, null);
  const r = id != null ? await one<{ id: number }>(`SELECT id FROM plan_versions WHERE id = $1`, [id]) : null;
  return r?.id ?? (await one<{ id: number }>(`SELECT id FROM plan_versions ORDER BY id DESC LIMIT 1`))?.id ?? null;
}

/** บันทึกทับเวอร์ชันที่ใช้อยู่ด้วยชุดธงปัจจุบัน */
export async function overwriteVersion(id: number, by: string) {
  if (id !== (await activeVersionId())) throw new UserError("บันทึกทับได้เฉพาะเวอร์ชันที่ใช้อยู่ เลือกใช้เวอร์ชันนั้นก่อน");
  const s = await snapshot();
  await q(`UPDATE plan_versions SET data = $2, people = $3, updated_at = now(), note = $4 WHERE id = $1`,
    [id, s.data, s.count, `แก้ไขโดย ${by}`]);
}

/** เลือกใช้เวอร์ชัน: โหลดรายชื่อ ธง และผู้นำธงของเวอร์ชันนั้นมาเป็นชุดธงปัจจุบัน (ไม่สร้างเวอร์ชันใหม่) */
export async function activateVersion(id: number) {
  const v = await one<any>(`SELECT * FROM plan_versions WHERE id = $1`, [id]);
  if (!v) throw new UserError("ไม่พบเวอร์ชันนี้");
  const { people, leaders } = v.data;
  await q(`DELETE FROM evac_plan`);
  if (people.length) await q(`INSERT INTO evac_plan SELECT * FROM jsonb_populate_recordset(null::evac_plan, $1::jsonb)`, [JSON.stringify(people)]);
  await q(`DELETE FROM flag_leaders`);
  if (leaders.length) await q(`INSERT INTO flag_leaders SELECT * FROM jsonb_populate_recordset(null::flag_leaders, $1::jsonb)`, [JSON.stringify(leaders)]);
  await q(`DELETE FROM flag_reviews`);
  await setSetting(ACTIVE, id);
  await q(`UPDATE plan_versions SET updated_at = now() WHERE id = $1 AND updated_at < now()`, [id]); // ไม่มีการแก้ค้าง
  await setSetting(CHANGED, null);
}

/** ลบเวอร์ชัน (ลบเวอร์ชันที่ใช้อยู่ไม่ได้) */
export async function deleteVersion(id: number) {
  if (id === (await activeVersionId())) throw new UserError("ลบเวอร์ชันที่ใช้อยู่ไม่ได้ เลือกใช้เวอร์ชันอื่นก่อน");
  const r = await one(`DELETE FROM plan_versions WHERE id = $1 RETURNING id`, [id]);
  if (!r) throw new UserError("ไม่พบเวอร์ชันนี้");
}

/** สถานะเวอร์ชัน: ใช้อยู่ตัวไหน และมีการแก้ที่ยังไม่บันทึกหรือไม่ */
export async function versionState() {
  const active = await activeVersionId();
  const changed = await getSetting<string | null>(CHANGED, null);
  const v = active ? await one<{ updated_at: string }>(`SELECT updated_at FROM plan_versions WHERE id = $1`, [active]) : null;
  const dirty = !!changed && (!v || new Date(changed) > new Date(v.updated_at));
  return { active, dirty, changed_at: dirty ? changed : null };
}

/** นำเข้าแผนจาก Excel แทนที่ชุดเดิม เก็บธงจาก Excel ไว้เทียบความแม่นยำ แล้วบันทึกเป็นเวอร์ชันใหม่ */
export async function importPlan(P: PlanPerson[], L: FlagLeader[], by: string, fileCount: number, name?: string | null) {
  await q(`DELETE FROM evac_plan`);
  await q(
    `INSERT INTO evac_plan (emp_id, prefix, first_name, last_name, gender, cost_center, area,
       assembly_point, flag_no, flag_no_old, role, source_file, orig_flag, name_en)
     SELECT a, b, c, d, e, f, g, h, i, j, k, l, i, m FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[]) AS x(a,b,c,d,e,f,g,h,i,j,k,l,m)
     ON CONFLICT (emp_id) DO NOTHING`,
    [P.map((p) => p.emp_id), P.map((p) => p.prefix), P.map((p) => p.first_name), P.map((p) => p.last_name),
     P.map((p) => p.gender), P.map((p) => p.cost_center), P.map((p) => p.area), P.map((p) => p.assembly_point),
     P.map((p) => normFlag(p.flag_no)), P.map((p) => normFlag(p.flag_no_old)), P.map((p) => p.role), P.map((p) => p.source_file),
     P.map((p) => (p.name_en ?? "").trim() || null)]);
  await q(`DELETE FROM flag_leaders`);
  if (L.length) {
    await q(
      `INSERT INTO flag_leaders (flag_no, assembly_point, flag_no_old, leader_name, cost_center, area, note)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT (flag_no) DO NOTHING`,
      [L.map((l) => normFlag(l.flag_no)), L.map((l) => l.assembly_point), L.map((l) => normFlag(l.flag_no_old)),
       L.map((l) => l.leader_name), L.map((l) => l.cost_center), L.map((l) => l.area), L.map((l) => l.note)]);
  }
  // จุดรวมพลที่พบใน Excel แต่ยังไม่มีในระบบ
  await q(
    `INSERT INTO assembly_points (code, name, sort)
     SELECT DISTINCT assembly_point, 'จุดรวมพล ' || assembly_point, 0 FROM evac_plan WHERE assembly_point IS NOT NULL
     ON CONFLICT (code) DO NOTHING`);
  // Cost Center ที่พบใน Excel เข้า master สำหรับหน้าลงทะเบียน
  await q(
    `INSERT INTO cost_centers (code, name, source)
     SELECT cost_center, COALESCE(mode() WITHIN GROUP (ORDER BY area), cost_center), 'master' FROM evac_plan
     WHERE cost_center IS NOT NULL AND cost_center <> '' GROUP BY cost_center
     ON CONFLICT (code) DO NOTHING`);
  await q(`DELETE FROM flag_reviews`);
  const v = await saveVersion(`นำเข้าจาก Excel ${fileCount} ไฟล์`, by, name);
  const vn = (await one<{ name: string }>(`SELECT name FROM plan_versions WHERE id = $1`, [v]))?.name ?? null;
  return { saved: P.length, leaders: L.length, version: v, version_name: vn };
}

export async function renameVersion(id: number, name: string) {
  if (!vname(name)) throw new UserError("ตั้งชื่อเวอร์ชันก่อน");
  const r = await one(`UPDATE plan_versions SET name = $2 WHERE id = $1 RETURNING id`, [id, await uniqueName(name, "", id)]);
  if (!r) throw new UserError("ไม่พบเวอร์ชันนี้");
}

export async function rollback(versionId: number) {
  await activateVersion(versionId);
  return versionId;
}

/** ภาพรวมสำหรับหน้าตั้งค่า */
export async function planOverview() {
  const [flags, leaders, points, versions, acc, total] = await Promise.all([
    q<any>(`
      WITH f AS (
        SELECT p.flag_no, max(p.assembly_point) AS assembly_point, count(*)::int AS people,
          count(*) FILTER (WHERE p.gender = 'ชาย')::int AS male, count(*) FILTER (WHERE p.gender = 'หญิง')::int AS female,
          mode() WITHIN GROUP (ORDER BY p.area) AS area,
          count(*) FILTER (WHERE r.reviewed_at IS NOT NULL AND p.edited_at > r.reviewed_at)::int AS edits_after
        FROM evac_plan p LEFT JOIN flag_reviews r ON r.flag_no = p.flag_no
        WHERE NOT p.removed GROUP BY p.flag_no)
      SELECT COALESCE(f.flag_no, l.flag_no) AS flag_no, COALESCE(f.assembly_point, l.assembly_point) AS assembly_point,
        COALESCE(f.people, 0) AS people, COALESCE(f.male, 0) AS male, COALESCE(f.female, 0) AS female,
        COALESCE(l.area, f.area) AS area, l.flag_no_old, COALESCE(f.edits_after, 0) AS edits_after,
        r.reviewed_by, r.reviewed_at
      FROM f FULL JOIN flag_leaders l ON l.flag_no = f.flag_no
      LEFT JOIN flag_reviews r ON r.flag_no = COALESCE(f.flag_no, l.flag_no)
      ORDER BY flag_key(COALESCE(f.flag_no, l.flag_no)), 1 NULLS LAST`),
    q<any>(`SELECT * FROM flag_leaders ORDER BY flag_key(flag_no), flag_no`),
    q<any>(`SELECT a.*, (SELECT array_agg(x.f ORDER BY flag_key(x.f), x.f) FROM (SELECT DISTINCT flag_no AS f FROM evac_plan
              WHERE assembly_point = a.code AND NOT removed AND flag_no IS NOT NULL) x) AS flags FROM assembly_points a ORDER BY sort, code`),
    q<any>(`SELECT v.id, v.name, v.note, v.created_by, v.created_at, v.updated_at, v.people,
              (SELECT count(*)::int FROM incidents i WHERE i.plan_version = v.id) AS used
            FROM plan_versions v ORDER BY v.id DESC LIMIT 100`),
    one<any>(`SELECT
        count(*) FILTER (WHERE NOT added_manually)::int AS imported,
        count(*) FILTER (WHERE NOT added_manually AND NOT removed AND flag_no IS DISTINCT FROM orig_flag)::int AS moved,
        count(*) FILTER (WHERE added_manually AND NOT removed)::int AS added,
        count(*) FILTER (WHERE removed AND NOT added_manually)::int AS removed,
        count(*) FILTER (WHERE NOT added_manually AND NOT removed AND flag_no IS NOT DISTINCT FROM orig_flag
                          AND edited_note IS NOT NULL)::int AS edited
      FROM evac_plan`),
    one<any>(`SELECT count(*) FILTER (WHERE NOT removed)::int AS n, count(DISTINCT source_file)::int AS files,
                max(updated_at) AS at FROM evac_plan`),
  ]);
  const a = acc ?? { imported: 0, moved: 0, added: 0, removed: 0, edited: 0 };
  const unchanged = Math.max(0, a.imported - a.moved - a.removed - a.edited);
  return {
    total: total?.n ?? 0, files: total?.files ?? 0, updated_at: total?.at ?? null,
    flags, leaders, points, versions, version: await versionState(),
    roles: (await q<{ role: string }>(`SELECT DISTINCT role FROM evac_plan WHERE role IS NOT NULL AND role <> '' ORDER BY role`)).map((r) => r.role),
    accuracy: { ...a, unchanged, pct: a.imported ? Math.round((unchanged / a.imported) * 100) : null },
  };
}

/** คนในธง (สำหรับหน้าตรวจทาน) พร้อม มา/ไม่มา วันนี้ */
export async function reviewFlag(flag: string) {
  const day = bangkokDay();
  const [people, review, leader] = await Promise.all([
    q<any>(
      `SELECT p.*, a.here, a.by_name AS here_by, a.at AS here_at FROM evac_plan p
       LEFT JOIN attendance a ON a.person_key = 'emp:' || p.emp_id AND a.day = $2
       WHERE p.flag_no = $1
       ORDER BY p.removed, p.role ILIKE 'ผู้นำ%' DESC, p.first_name`,
      [flag, day]),
    one<any>(`SELECT * FROM flag_reviews WHERE flag_no = $1`, [flag]),
    one<any>(`SELECT * FROM flag_leaders WHERE flag_no = $1`, [flag]),
  ]);
  return { people, review, leader };
}

export async function flagCells() {
  return q<any>(
    `SELECT f.flag_no, count(DISTINCT p.emp_id) FILTER (WHERE NOT p.removed)::int AS n, (max(r.flag_no) IS NOT NULL) AS reviewed,
       max(r.reviewed_by) AS reviewed_by, max(r.reviewed_at) AS reviewed_at,
       max(a.at) AS att_at, (array_agg(a.by_name ORDER BY a.at DESC) FILTER (WHERE a.at IS NOT NULL))[1] AS att_by,
       count(DISTINCT p.emp_id) FILTER (WHERE NOT p.removed AND a.day = (now() AT TIME ZONE 'Asia/Bangkok')::date)::int AS att_today,
       COALESCE(max(l.area), mode() WITHIN GROUP (ORDER BY p.area)) AS area, max(l.leader_name) AS leader_name
     FROM (SELECT flag_no FROM evac_plan WHERE flag_no IS NOT NULL AND NOT removed UNION SELECT flag_no FROM flag_leaders) f
     LEFT JOIN flag_leaders l ON l.flag_no = f.flag_no
     LEFT JOIN evac_plan p ON p.flag_no = f.flag_no
     LEFT JOIN attendance a ON a.person_key = 'emp:' || p.emp_id AND NOT p.removed
     LEFT JOIN flag_reviews r ON r.flag_no = f.flag_no
     GROUP BY f.flag_no ORDER BY flag_key(f.flag_no), f.flag_no`);
}

export async function setAttendance(personKey: string, here: boolean, by: string) {
  await q(
    `INSERT INTO attendance (person_key, day, here, by_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (person_key, day) DO UPDATE SET here = EXCLUDED.here, by_name = EXCLUDED.by_name, at = now()`,
    [personKey, bangkokDay(), here, by || null]);
}

export async function editPerson(
  empId: string,
  f: { first_name?: string; last_name?: string; gender?: string; flag_no?: string; tel?: string; cost_center?: string; area?: string; role?: string; prefix?: string; new_emp_id?: string; name_en?: string },
  by: string,
) {
  let p = await one<any>(`SELECT * FROM evac_plan WHERE emp_id = $1`, [empId]);
  if (!p) throw new UserError("ไม่พบรายชื่อ");
  // แก้รหัสพนักงาน (เช่น รหัสที่นำเข้ามาผิดรูปแบบ)
  const nid = f.new_emp_id?.replace(/\s+/g, " ").trim();
  if (nid && nid !== empId) {
    const to = /^[a-z]{0,5}\d{4,12}$/i.test(nid.replace(/\s+/g, "")) ? nid.replace(/\s+/g, "").toUpperCase() : nid;
    const dup = await one<any>(`SELECT flag_no FROM evac_plan WHERE emp_id = $1`, [to]);
    if (dup) throw new UserError(`รหัส ${to} มีอยู่แล้วในธง ${dup.flag_no ?? "—"}`);
    await q(`UPDATE evac_plan SET emp_id = $2 WHERE emp_id = $1`, [empId, to]);
    await q(`UPDATE attendance SET person_key = 'emp:' || $2 WHERE person_key = 'emp:' || $1`, [empId, to]);
    empId = to;
    p = { ...p, emp_id: to };
  }
  const personal = ["first_name", "last_name", "gender", "tel", "cost_center", "area", "role", "prefix", "name_en"].some(
    (k) => (f as any)[k] !== undefined && ((f as any)[k] ?? "") !== (p[k] ?? ""));
  const flag = (f.flag_no !== undefined ? normFlag(f.flag_no) : null) ?? p.flag_no;
  const ap = flag !== p.flag_no
    ? (await one<{ ap: string }>(`SELECT max(assembly_point) AS ap FROM evac_plan WHERE flag_no = $1 AND NOT removed`, [flag]))?.ap ?? p.assembly_point
    : p.assembly_point;
  await q(
    `UPDATE evac_plan SET first_name = $2, last_name = $3, gender = $4, flag_no = $5, tel = $6, cost_center = $7, area = $8,
       assembly_point = $9, edited_by = $10, edited_at = now(), updated_at = now(),
       edited_note = CASE WHEN $11 THEN 'แก้ข้อมูลส่วนตัว' ELSE edited_note END,
       role = $12, prefix = $13, name_en = $14
     WHERE emp_id = $1`,
    [empId, f.first_name ?? p.first_name, f.last_name ?? p.last_name, f.gender ?? p.gender, flag, f.tel ?? p.tel,
     f.cost_center ?? p.cost_center, f.area ?? p.area, ap, by || null, personal,
     f.role !== undefined ? f.role || null : p.role, f.prefix !== undefined ? f.prefix || null : p.prefix,
     f.name_en !== undefined ? String(f.name_en).replace(/\s+/g, " ").trim().slice(0, 120) || null : p.name_en]);
  // ตั้งเป็นผู้นำธง → ชื่อผู้นำธงของธงนั้นเปลี่ยนตาม
  const role = f.role !== undefined ? f.role || null : p.role;
  if (/^\s*ผู้นำ/.test(role ?? "") && flag != null) {
    const name = `${f.first_name ?? p.first_name} ${f.last_name ?? p.last_name ?? ""}`.replace(/\s+/g, " ").trim();
    await q(`INSERT INTO flag_leaders (flag_no, leader_name, assembly_point) VALUES ($1, $2, $3)
             ON CONFLICT (flag_no) DO UPDATE SET leader_name = EXCLUDED.leader_name`, [flag, name, ap]);
  }
}

export async function removePerson(empId: string, reason: string, by: string, restore = false) {
  if (!restore && !reason) throw new UserError("ต้องใส่หมายเหตุการลบ");
  await q(
    `UPDATE evac_plan SET removed = $2, removed_reason = $3, removed_by = $4, edited_at = now(), updated_at = now() WHERE emp_id = $1`,
    [empId, !restore, restore ? null : reason, restore ? null : by || null]);
}

export async function addPlanPerson(
  f: { first_name: string; last_name?: string; gender?: string; flag_no: string; tel?: string; cost_center?: string; area?: string; emp_id?: string; role?: string; prefix?: string; name_en?: string },
  by: string,
) {
  if (!f.first_name?.trim()) throw new UserError("กรอกชื่อก่อน");
  f = { ...f, flag_no: normFlag(f.flag_no) ?? "" };
  if (!f.flag_no) throw new UserError("ระบุธง");
  const id = f.emp_id?.trim().toUpperCase() || `ADD-${Date.now().toString(36).toUpperCase()}`;
  const dup = await one<any>(`SELECT flag_no, removed FROM evac_plan WHERE emp_id = $1`, [id]);
  if (dup && !dup.removed) throw new UserError(`รหัส ${id} อยู่ในธง ${dup.flag_no ?? "—"} แล้ว ใช้แก้ไข/ย้ายธงแทน`);
  const ap = (await one<{ ap: string }>(
    `SELECT COALESCE((SELECT max(assembly_point) FROM evac_plan WHERE flag_no = $1), (SELECT assembly_point FROM flag_leaders WHERE flag_no = $1)) AS ap`,
    [f.flag_no]))?.ap ?? null;
  // เคยอยู่ในชุดธงแล้วถูกลบ: คืนกลับมาเข้าธงนี้ด้วยข้อมูลใหม่
  if (dup?.removed) await q(`DELETE FROM evac_plan WHERE emp_id = $1`, [id]);
  await q(
    `INSERT INTO evac_plan (emp_id, first_name, last_name, gender, flag_no, tel, cost_center, area, assembly_point,
       added_manually, edited_by, edited_at, role, prefix, name_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, now(), $11, $12, $13)`,
    [id, f.first_name.trim(), f.last_name?.trim() || null, f.gender || null, f.flag_no, f.tel || null,
     f.cost_center || null, f.area || null, ap, by || null, f.role || "ผู้อพยพ", f.prefix || null, String(f.name_en ?? "").trim() || null]);
  return id;
}

export async function markReviewed(flag: string, by: string) {
  await q(
    `INSERT INTO flag_reviews (flag_no, reviewed_by) VALUES ($1, $2)
     ON CONFLICT (flag_no) DO UPDATE SET reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now()`,
    [flag, by || null]);
}

// ---------- ธง (Admin) ----------
export type FlagInput = { flag_no: string; leader_name?: string; area?: string; assembly_point?: string; flag_no_old?: string | null; cost_center?: string };

/** เพิ่ม/แก้ข้อมูลธง เปลี่ยนจุดรวมพลแล้วคนในธงย้ายจุดตามด้วย */
export async function saveFlag(f: FlagInput, isNew: boolean) {
  f = { ...f, flag_no: normFlag(f.flag_no) ?? "", flag_no_old: normFlag(f.flag_no_old) };
  if (!f.flag_no) throw new UserError("ระบุเบอร์ธง");
  if (isNew) {
    const used = await one<any>(
      `SELECT 1 FROM flag_leaders WHERE flag_no = $1 UNION SELECT 1 FROM evac_plan WHERE flag_no = $1 AND NOT removed LIMIT 1`, [f.flag_no]);
    if (used) throw new UserError(`ธง ${f.flag_no} มีอยู่แล้ว`);
  }
  const t = (v?: string | null) => (String(v ?? "").trim() || null);
  await q(
    `INSERT INTO flag_leaders (flag_no, leader_name, area, assembly_point, flag_no_old, cost_center)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (flag_no) DO UPDATE SET leader_name = EXCLUDED.leader_name, area = EXCLUDED.area,
       assembly_point = EXCLUDED.assembly_point, flag_no_old = EXCLUDED.flag_no_old, cost_center = EXCLUDED.cost_center`,
    [f.flag_no, t(f.leader_name), t(f.area), t(f.assembly_point), f.flag_no_old ?? null, t(f.cost_center)]);
  if (t(f.assembly_point)) {
    await q(`INSERT INTO assembly_points (code, name, sort) VALUES ($1, 'จุดรวมพล ' || $1, 0) ON CONFLICT (code) DO NOTHING`, [t(f.assembly_point)]);
    await q(`UPDATE evac_plan SET assembly_point = $2, updated_at = now() WHERE flag_no = $1 AND assembly_point IS DISTINCT FROM $2`,
      [f.flag_no, t(f.assembly_point)]);
  }
}

/** ลบธง · ถ้ายังมีคน: ย้ายไปธงอื่น (moveTo) หรือเอาคนออกจากชุดธงด้วย (removePeople) */
export async function deleteFlag(flag: string, o: { moveTo?: string | null; removePeople?: boolean } = {}, by = "") {
  const n = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM evac_plan WHERE flag_no = $1 AND NOT removed`, [flag]))?.n ?? 0;
  if (n > 0) {
    if (o.moveTo != null) {
      if (o.moveTo === flag) throw new UserError("เลือกธงปลายทางอื่น");
      const ap = (await one<{ ap: string | null }>(
        `SELECT COALESCE((SELECT max(assembly_point) FROM evac_plan WHERE flag_no = $1 AND NOT removed), (SELECT assembly_point FROM flag_leaders WHERE flag_no = $1)) AS ap`,
        [o.moveTo]))?.ap ?? null;
      await q(`UPDATE evac_plan SET flag_no = $2, assembly_point = COALESCE($3, assembly_point), edited_by = $4, edited_at = now(), updated_at = now()
               WHERE flag_no = $1`, [flag, o.moveTo, ap, by || null]);
    } else if (o.removePeople) {
      await q(`UPDATE evac_plan SET removed = true, removed_reason = $2, removed_by = $3, edited_at = now(), updated_at = now()
               WHERE flag_no = $1 AND NOT removed`, [flag, `ลบธง ${flag}`, by || null]);
    } else {
      throw new UserError(`ธง ${flag} ยังมี ${n} คน เลือกย้ายไปธงอื่น หรือเอาคนออกด้วย`);
    }
  }
  await q(`DELETE FROM flag_leaders WHERE flag_no = $1`, [flag]);
  await q(`DELETE FROM flag_reviews WHERE flag_no = $1`, [flag]);
  return { moved: o.moveTo != null ? n : 0, removed: o.removePeople && o.moveTo == null ? n : 0 };
}

/** ค้นหาคนในชุดธงทุกธง: ชื่อ / รหัสพนักงาน / Cost Center / แผนก */
export async function searchPlan(term: string, limit = 50) {
  const t = stripPrefix(term).replace(/\s+/g, " ");
  if (t.length < 1) return [];
  return q<any>(
    `SELECT emp_id, prefix, first_name, last_name, name_en, gender, flag_no, cost_center, area, role, removed, assembly_point
     FROM evac_plan
     WHERE emp_id ILIKE '%' || $1 || '%' OR concat_ws(' ', first_name, last_name) ILIKE '%' || $1 || '%'
        OR name_en ILIKE '%' || $1 || '%' OR concat_ws(' ', last_name, first_name) ILIKE '%' || $1 || '%'
        OR cost_center ILIKE $1 || '%' OR area ILIKE '%' || $1 || '%'
     ORDER BY removed, (emp_id ILIKE $1 || '%') DESC, flag_key(flag_no), flag_no, first_name
     LIMIT $2`, [t, limit]);
}

/**
 * ค้นข้อมูลคนจากรหัสพนักงาน เพื่อเติมฟอร์มเพิ่มคนให้อัตโนมัติ
 * ดูจาก: ชุดธงปัจจุบัน (รวมคนที่ลบออก) → เวอร์ชันชุดธงเก่า → โปรไฟล์ที่ลงทะเบียน → รายชื่อ Outsource (DC_FTE)
 */
export async function lookupPerson(code: string, withTel = true) {
  const c = String(code ?? "").trim();
  if (c.length < 3) return null;
  const [plan, old, prof, os] = await Promise.all([
    one<any>(`SELECT * FROM evac_plan WHERE upper(emp_id) = upper($1)`, [c]),
    one<any>(
      `SELECT p, v.name AS vname FROM plan_versions v, jsonb_array_elements(v.data->'people') p
       WHERE upper(p->>'emp_id') = upper($1) ORDER BY v.id DESC LIMIT 1`, [c]),
    one<any>(`SELECT * FROM profiles WHERE upper(code) = upper($1)`, [c]),
    one<any>(`SELECT * FROM outsource_staff WHERE upper(emp_id) = upper($1)`, [c]),
  ]);
  const o = old?.p ?? null;
  const pick = (k: string, ...src: any[]) => {
    for (const s of src) { const v = s?.[k]; if (v !== null && v !== undefined && String(v).trim() !== "") return String(v); }
    return null;
  };
  const S = [plan, o, prof, os];
  if (!S.some(Boolean)) return null;
  const from = plan ? (plan.removed ? "ชุดธงนี้ (เคยลบออก)" : "ชุดธงนี้") : o ? `ชุดธง “${old.vname ?? "เวอร์ชันเก่า"}”` : prof ? "โปรไฟล์ที่ลงทะเบียน" : "รายชื่อ Outsource (DC_FTE)";
  return {
    emp_id: pick("emp_id", plan, o) ?? pick("code", prof) ?? pick("emp_id", os) ?? c,
    prefix: pick("prefix", ...S), first_name: pick("first_name", ...S), last_name: pick("last_name", ...S),
    name_en: pick("name_en", ...S), gender: pick("gender", ...S), cost_center: pick("cost_center", ...S),
    area: pick("area", plan, o), role: pick("role", plan, o), tel: withTel ? pick("tel", ...S) : null,
    // อยู่ในชุดธงนี้แล้ว (เพิ่มซ้ำไม่ได้)
    in_plan: plan && !plan.removed ? { flag_no: plan.flag_no } : null,
    removed: !!plan?.removed, from,
  };
}
