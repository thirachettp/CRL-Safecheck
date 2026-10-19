import { UserError } from "./errors";
// ชุดธง: นำเข้า Excel, ตรวจทาน (แก้/ย้าย/เพิ่ม/ลบ + มา/ไม่มา), เวอร์ชัน และความแม่นยำของข้อมูลตั้งต้น
import { q, one } from "./db";
import { bangkokDay } from "./incident";
import type { PlanPerson, FlagLeader } from "./parsers";

export async function saveVersion(note: string, by: string) {
  const [people, leaders, points] = await Promise.all([
    q(`SELECT * FROM evac_plan`),
    q(`SELECT * FROM flag_leaders`),
    q(`SELECT * FROM assembly_points`),
  ]);
  const active = people.filter((p: any) => !p.removed).length;
  const r = await one<{ id: number }>(
    `INSERT INTO plan_versions (note, created_by, people, data) VALUES ($1, $2, $3, $4) RETURNING id`,
    [note, by, active, JSON.stringify({ people, leaders, points })]);
  return r!.id;
}

/** นำเข้าแผนจาก Excel แทนที่ชุดเดิม เก็บธงจาก Excel ไว้เทียบความแม่นยำ แล้วบันทึกเป็นเวอร์ชันใหม่ */
export async function importPlan(P: PlanPerson[], L: FlagLeader[], by: string, fileCount: number) {
  await q(`DELETE FROM evac_plan`);
  await q(
    `INSERT INTO evac_plan (emp_id, prefix, first_name, last_name, gender, cost_center, area,
       assembly_point, flag_no, flag_no_old, role, source_file, orig_flag)
     SELECT a, b, c, d, e, f, g, h, i, j, k, l, i FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $9::int[], $10::int[], $11::text[], $12::text[]) AS x(a,b,c,d,e,f,g,h,i,j,k,l)
     ON CONFLICT (emp_id) DO NOTHING`,
    [P.map((p) => p.emp_id), P.map((p) => p.prefix), P.map((p) => p.first_name), P.map((p) => p.last_name),
     P.map((p) => p.gender), P.map((p) => p.cost_center), P.map((p) => p.area), P.map((p) => p.assembly_point),
     P.map((p) => p.flag_no), P.map((p) => p.flag_no_old), P.map((p) => p.role), P.map((p) => p.source_file)]);
  await q(`DELETE FROM flag_leaders`);
  if (L.length) {
    await q(
      `INSERT INTO flag_leaders (flag_no, assembly_point, flag_no_old, leader_name, cost_center, area, note)
       SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT (flag_no) DO NOTHING`,
      [L.map((l) => l.flag_no), L.map((l) => l.assembly_point), L.map((l) => l.flag_no_old),
       L.map((l) => l.leader_name), L.map((l) => l.cost_center), L.map((l) => l.area), L.map((l) => l.note)]);
  }
  // จุดรวมพลที่พบใน Excel แต่ยังไม่มีในระบบ
  await q(
    `INSERT INTO assembly_points (code, name, sort)
     SELECT DISTINCT assembly_point, 'จุดรวมพล ' || assembly_point, 0 FROM evac_plan WHERE assembly_point IS NOT NULL
     ON CONFLICT (code) DO NOTHING`);
  await q(`DELETE FROM flag_reviews`);
  const v = await saveVersion(`นำเข้าจาก Excel ${fileCount} ไฟล์`, by);
  return { saved: P.length, leaders: L.length, version: v };
}

export async function rollback(versionId: number, by: string) {
  const v = await one<any>(`SELECT * FROM plan_versions WHERE id = $1`, [versionId]);
  if (!v) throw new UserError("ไม่พบเวอร์ชันนี้");
  const { people, leaders } = v.data;
  await q(`DELETE FROM evac_plan`);
  if (people.length) {
    await q(`INSERT INTO evac_plan SELECT * FROM jsonb_populate_recordset(null::evac_plan, $1::jsonb)`, [JSON.stringify(people)]);
  }
  await q(`DELETE FROM flag_leaders`);
  if (leaders.length) {
    await q(`INSERT INTO flag_leaders SELECT * FROM jsonb_populate_recordset(null::flag_leaders, $1::jsonb)`, [JSON.stringify(leaders)]);
  }
  return saveVersion(`ย้อนกลับไป v${versionId}`, by);
}

/** ภาพรวมสำหรับหน้าตั้งค่า */
export async function planOverview() {
  const [flags, leaders, points, versions, acc, total] = await Promise.all([
    q<any>(`
      SELECT p.flag_no, max(p.assembly_point) AS assembly_point, count(*)::int AS people,
        count(*) FILTER (WHERE p.gender = 'ชาย')::int AS male, count(*) FILTER (WHERE p.gender = 'หญิง')::int AS female,
        mode() WITHIN GROUP (ORDER BY p.area) AS area,
        r.reviewed_by, r.reviewed_at,
        count(*) FILTER (WHERE r.reviewed_at IS NOT NULL AND p.edited_at > r.reviewed_at)::int AS edits_after
      FROM evac_plan p LEFT JOIN flag_reviews r ON r.flag_no = p.flag_no
      WHERE NOT p.removed GROUP BY p.flag_no, r.reviewed_by, r.reviewed_at ORDER BY p.flag_no NULLS LAST`),
    q<any>(`SELECT * FROM flag_leaders ORDER BY flag_no`),
    q<any>(`SELECT a.*, (SELECT array_agg(DISTINCT flag_no ORDER BY flag_no) FROM evac_plan
              WHERE assembly_point = a.code AND NOT removed) AS flags FROM assembly_points a ORDER BY sort, code`),
    q<any>(`SELECT id, note, created_by, created_at, people FROM plan_versions ORDER BY id DESC LIMIT 10`),
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
    flags, leaders, points, versions,
    accuracy: { ...a, unchanged, pct: a.imported ? Math.round((unchanged / a.imported) * 100) : null },
  };
}

/** คนในธง (สำหรับหน้าตรวจทาน) พร้อม มา/ไม่มา วันนี้ */
export async function reviewFlag(flag: number) {
  const day = bangkokDay();
  const [people, review, leader] = await Promise.all([
    q<any>(
      `SELECT p.*, a.here, a.by_name AS here_by FROM evac_plan p
       LEFT JOIN attendance a ON a.person_key = 'emp:' || p.emp_id AND a.day = $2
       WHERE p.flag_no = $1
       ORDER BY p.removed, p.role ILIKE '%ผู้นำ%' DESC, p.first_name`,
      [flag, day]),
    one<any>(`SELECT * FROM flag_reviews WHERE flag_no = $1`, [flag]),
    one<any>(`SELECT * FROM flag_leaders WHERE flag_no = $1`, [flag]),
  ]);
  return { people, review, leader };
}

export async function flagCells() {
  return q<any>(
    `SELECT p.flag_no, count(*) FILTER (WHERE NOT p.removed)::int AS n, (r.flag_no IS NOT NULL) AS reviewed
     FROM evac_plan p LEFT JOIN flag_reviews r ON r.flag_no = p.flag_no
     WHERE p.flag_no IS NOT NULL GROUP BY p.flag_no, r.flag_no ORDER BY p.flag_no`);
}

export async function setAttendance(personKey: string, here: boolean, by: string) {
  await q(
    `INSERT INTO attendance (person_key, day, here, by_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (person_key, day) DO UPDATE SET here = EXCLUDED.here, by_name = EXCLUDED.by_name, at = now()`,
    [personKey, bangkokDay(), here, by || null]);
}

export async function editPerson(
  empId: string,
  f: { first_name?: string; last_name?: string; gender?: string; flag_no?: number; tel?: string; cost_center?: string; area?: string },
  by: string,
) {
  const p = await one<any>(`SELECT * FROM evac_plan WHERE emp_id = $1`, [empId]);
  if (!p) throw new UserError("ไม่พบรายชื่อ");
  const personal = ["first_name", "last_name", "gender", "tel", "cost_center", "area"].some(
    (k) => (f as any)[k] !== undefined && ((f as any)[k] ?? "") !== (p[k] ?? ""));
  const flag = f.flag_no ?? p.flag_no;
  const ap = flag !== p.flag_no
    ? (await one<{ ap: string }>(`SELECT max(assembly_point) AS ap FROM evac_plan WHERE flag_no = $1 AND NOT removed`, [flag]))?.ap ?? p.assembly_point
    : p.assembly_point;
  await q(
    `UPDATE evac_plan SET first_name = $2, last_name = $3, gender = $4, flag_no = $5, tel = $6, cost_center = $7, area = $8,
       assembly_point = $9, edited_by = $10, edited_at = now(), updated_at = now(),
       edited_note = CASE WHEN $11 THEN 'แก้ข้อมูลส่วนตัว' ELSE edited_note END
     WHERE emp_id = $1`,
    [empId, f.first_name ?? p.first_name, f.last_name ?? p.last_name, f.gender ?? p.gender, flag, f.tel ?? p.tel,
     f.cost_center ?? p.cost_center, f.area ?? p.area, ap, by || null, personal]);
}

export async function removePerson(empId: string, reason: string, by: string, restore = false) {
  if (!restore && !reason) throw new UserError("ต้องใส่หมายเหตุการลบ");
  await q(
    `UPDATE evac_plan SET removed = $2, removed_reason = $3, removed_by = $4, edited_at = now(), updated_at = now() WHERE emp_id = $1`,
    [empId, !restore, restore ? null : reason, restore ? null : by || null]);
}

export async function addPlanPerson(
  f: { first_name: string; last_name?: string; gender?: string; flag_no: number; tel?: string; cost_center?: string; area?: string; emp_id?: string },
  by: string,
) {
  if (!f.first_name?.trim()) throw new UserError("กรอกชื่อก่อน");
  if (!Number.isInteger(f.flag_no)) throw new UserError("ระบุธง");
  const id = f.emp_id?.trim() || `ADD-${Date.now().toString(36).toUpperCase()}`;
  const ap = (await one<{ ap: string }>(`SELECT max(assembly_point) AS ap FROM evac_plan WHERE flag_no = $1`, [f.flag_no]))?.ap ?? null;
  await q(
    `INSERT INTO evac_plan (emp_id, first_name, last_name, gender, flag_no, tel, cost_center, area, assembly_point,
       added_manually, edited_by, edited_at, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, now(), 'ผู้อพยพ')`,
    [id, f.first_name.trim(), f.last_name?.trim() || null, f.gender || null, f.flag_no, f.tel || null,
     f.cost_center || null, f.area || null, ap, by || null]);
  return id;
}

export async function markReviewed(flag: number, by: string) {
  await q(
    `INSERT INTO flag_reviews (flag_no, reviewed_by) VALUES ($1, $2)
     ON CONFLICT (flag_no) DO UPDATE SET reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now()`,
    [flag, by || null]);
}
