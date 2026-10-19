import { q } from "./db";
import { OUT_WINDOW_H, presentFrom, type OsAttendance, type OsStaff } from "./outsourceMap";

export { parseAttendance, parseStaff, presentFrom } from "./outsourceMap";

export async function storeAttendance(rows: OsAttendance[]) {
  if (!rows.length) return 0;
  await q(
    `INSERT INTO outsource_attendance (item_id, emp_id, clock_in, clock_out, status, site)
     SELECT * FROM unnest($1::text[], $2::text[], $3::timestamptz[], $4::timestamptz[], $5::text[], $6::text[])
     ON CONFLICT (item_id) DO UPDATE SET emp_id = EXCLUDED.emp_id, clock_in = EXCLUDED.clock_in, clock_out = EXCLUDED.clock_out,
       status = EXCLUDED.status, site = EXCLUDED.site, received_at = now()`,
    [rows.map((r) => r.item_id), rows.map((r) => r.emp_id), rows.map((r) => r.clock_in), rows.map((r) => r.clock_out),
     rows.map((r) => r.status), rows.map((r) => r.site)]);
  return rows.length;
}

export async function storeStaff(rows: OsStaff[]) {
  if (!rows.length) return 0;
  const m = new Map(rows.map((r) => [r.emp_id, r])); // กันรหัสซ้ำในชุดเดียว
  const R = [...m.values()];
  await q(
    `INSERT INTO outsource_staff (emp_id, first_name, last_name, cost_center)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
     ON CONFLICT (emp_id) DO UPDATE SET first_name = COALESCE(EXCLUDED.first_name, outsource_staff.first_name),
       last_name = COALESCE(EXCLUDED.last_name, outsource_staff.last_name),
       cost_center = COALESCE(EXCLUDED.cost_center, outsource_staff.cost_center), updated_at = now()`,
    [R.map((r) => r.emp_id), R.map((r) => r.first_name), R.map((r) => r.last_name), R.map((r) => r.cost_center)]);
  return R.length;
}

export async function outsourcePresent(now = new Date()) {
  const rows = await q<any>(
    `SELECT item_id, emp_id, clock_in, clock_out, status, site FROM outsource_attendance
     WHERE clock_in > $1::timestamptz - interval '${OUT_WINDOW_H + 2} hours'`, [now.toISOString()]);
  const norm = rows.map((r) => ({ ...r, clock_in: r.clock_in && new Date(r.clock_in).toISOString(), clock_out: r.clock_out && new Date(r.clock_out).toISOString() }));
  return presentFrom(norm, now);
}
