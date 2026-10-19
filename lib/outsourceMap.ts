/** ข้อมูล Outsource จาก Power Apps (SharePoint list DC_Outsource_Attendance + รายชื่อใน DC_FTE) */

export const OUT_WINDOW_H = 14;

const str = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v && "Value" in (v as any)) return String((v as any).Value ?? "").trim(); // choice column
  return String(v).trim();
};
const pick = (r: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = str(r?.[k]);
    if (v) return v;
  }
  return "";
};
function toIso(v: string): string | null {
  if (!v) return null;
  // ไม่มีโซนเวลา → ถือเป็นเวลาไทย
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(" ", "T")}+07:00`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type OsAttendance = { item_id: string; emp_id: string; clock_in: string | null; clock_out: string | null; status: string | null; site: string | null };
export type OsStaff = { emp_id: string; first_name: string | null; last_name: string | null; cost_center: string | null };

/** รับได้ทั้งชื่อที่เราตั้งเอง และชื่อคอลัมน์ดิบจาก SharePoint */
export function parseAttendance(r: any): OsAttendance | null {
  const emp_id = pick(r, "employee_id", "Title", "emp_id");
  const item_id = pick(r, "item_id", "ID", "Id", "id");
  if (!emp_id || !item_id) return null;
  return {
    item_id, emp_id,
    clock_in: toIso(pick(r, "clock_in", "Clock_in")),
    clock_out: toIso(pick(r, "clock_out", "Clock_out")),
    status: pick(r, "status", "Status") || null,
    site: pick(r, "site", "Site") || null,
  };
}

export function parseStaff(r: any): OsStaff | null {
  const emp_id = pick(r, "employee_id", "field_1", "emp_id");
  if (!emp_id) return null;
  return {
    emp_id,
    first_name: pick(r, "firstname", "first_name", "field_3") || null,
    last_name: pick(r, "lastname", "last_name", "field_4") || null,
    cost_center: pick(r, "cost_center", "field_2") || null,
  };
}

/**
 * ใครอยู่ในพื้นที่ตอนนี้: รายการล่าสุดของแต่ละรหัส มี clock_in ภายใน 14 ชม. และยังไม่ clock_out
 */
export function presentFrom(rows: OsAttendance[], now = new Date()) {
  const latest = new Map<string, OsAttendance>();
  for (const r of rows) {
    if (!r.clock_in) continue;
    const cur = latest.get(r.emp_id);
    if (!cur || new Date(r.clock_in) > new Date(cur.clock_in!)) latest.set(r.emp_id, r);
  }
  const out: OsAttendance[] = [];
  for (const r of latest.values()) {
    const since = new Date(r.clock_in!).getTime();
    if (now.getTime() - since > OUT_WINDOW_H * 3600e3 || since > now.getTime() + 10 * 60e3) continue;
    if (r.clock_out && new Date(r.clock_out).getTime() >= since) continue;
    out.push(r);
  }
  return out;
}

