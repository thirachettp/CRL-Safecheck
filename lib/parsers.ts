// อ่านไฟล์ Excel แผนอพยพรายแผนก และ Excel ที่ sync กับ MS Form
// ทำงานได้ทั้งในเบราว์เซอร์และใน Node (รับ workbook ของ SheetJS)
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";

export type PlanPerson = {
  emp_id: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  cost_center: string | null;
  area: string | null;
  assembly_point: string | null;
  flag_no: number | null;
  flag_no_old: number | null;
  role: string | null;
  source_file: string;
  sheet?: string;
};

export type FlagLeader = {
  flag_no: number;
  assembly_point: string | null;
  flag_no_old: number | null;
  leader_name: string;
  cost_center: string | null;
  area: string | null;
  note: string | null;
};

export type FileIssue = { file: string; level: "error" | "warn"; message: string };

export type PlanFileResult = {
  file: string;
  people: PlanPerson[];
  leaders: FlagLeader[];
  issues: FileIssue[];
};

const PREFIXES = new Set(["นาย", "นาง", "นางสาว", "น.ส.", "นส.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss"]);

/** รหัสพนักงาน: ตัวเลข หรือรหัส Outsource แบบมีตัวอักษรนำหน้า เช่น KNN250593 */
export const EMP_RE = /^[A-Z]{0,5}\d{4,12}$/;

function rangeOf(ns: number[]) {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(i === j ? `${ns[i]}` : `${ns[i]}–${ns[j]}`);
    i = j;
  }
  return out.join(", ");
}
const stripTitle = (s: string) => s.replace(/^(คุณ|นาย|นางสาว|นาง|น\.ส\.)\s*/, "").replace(/\s+/g, " ").trim();

const cell = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const clean = (h: string) => h.replace(/\s+/g, "").toLowerCase();
const toInt = (v: unknown): number | null => {
  const n = parseInt(cell(v), 10);
  return Number.isFinite(n) ? n : null;
};

export function normalizeGender(v: unknown): string | null {
  const s = cell(v).toLowerCase();
  if (!s) return null;
  if (["ชาย", "male", "m", "man", "men", "ช", "นาย"].includes(s)) return "ชาย";
  if (["หญิง", "female", "f", "woman", "women", "ญ"].includes(s)) return "หญิง";
  return "อื่นๆ";
}

function rowsOf(ws: WorkSheet): unknown[][] {
  return utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
}

/** หาแถวหัวตารางจากคำที่ต้องมี คืน index แถวและ map ชื่อคอลัมน์ → index */
function findHeader(rows: unknown[][], mustHave: string, scan = 15) {
  for (let r = 0; r < Math.min(rows.length, scan); r++) {
    const heads = rows[r].map((c) => clean(cell(c)));
    if (heads.some((h) => h.includes(clean(mustHave)))) return { row: r, heads };
  }
  return null;
}

function col(heads: string[], ...keys: string[]): number {
  for (const k of keys) {
    const i = heads.findIndex((h) => h.includes(clean(k)));
    if (i >= 0) return i;
  }
  return -1;
}

/** อ่านไฟล์แผนอพยพหนึ่งไฟล์ (ชีตรายชื่อ + ชีตผู้นำธง) */
export function parsePlanWorkbook(wb: WorkBook, file: string): PlanFileResult {
  const issues: FileIssue[] = [];
  const people: PlanPerson[] = [];
  const leaders: FlagLeader[] = [];

  // ---- ชีตรายชื่อ: หาชีตที่มีหัวคอลัมน์ "รหัสพนักงาน"
  let found = false;
  for (const name of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[name]);
    const h = findHeader(rows, "รหัสพนักงาน");
    if (!h) continue;
    found = true;
    const H = h.heads;
    const c = {
      ap: col(H, "จุดรวมพล"),
      flag: col(H, "เบอร์ธงอพยพใหม่", "ธงใหม่"),
      flagOld: col(H, "เบอร์ธงอพยพเดิม", "ธงเดิม"),
      emp: col(H, "รหัสพนักงาน"),
      prefix: col(H, "คำนำหน้า"),
      name: col(H, "ชื่อ-นามสกุล", "ชื่อ-สกุล", "ชื่อ"),
      gender: col(H, "เพศ"),
      cc: col(H, "costcenter"),
      area: col(H, "แผนก/พื้นที่", "แผนก", "พื้นที่"),
      role: col(H, "บทบาท"),
    };
    if (c.flag < 0) issues.push({ file, level: "error", message: `ชีต "${name}" ไม่พบคอลัมน์เบอร์ธงอพยพใหม่` });

    const S = `ชีต "${name}"`;
    let blankRun = 0;
    let lastFlag: number | null = null;
    const lastByOld = new Map<number, number>();
    const filled = new Map<string, number[]>(); // "ธงใหม่|ธงเดิม" → แถวที่เติมให้
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r];
      const emp = cell(row[c.emp]).replace(/\.0$/, "").replace(/\s+/g, "").toUpperCase();
      if (!emp) {
        if (++blankRun >= 5) break; // จบตารางเมื่อเจอแถวว่างติดกัน 5 แถว
        continue;
      }
      blankRun = 0;
      if (!EMP_RE.test(emp)) {
        issues.push({ file, level: "warn", message: `${S} แถว ${r + 1}: รหัสพนักงาน "${emp}" รูปแบบไม่ถูกต้อง ข้ามแถวนี้` });
        continue;
      }
      // หัวคอลัมน์ในไฟล์จริง: คอลัมน์ "คำนำหน้า" เก็บชื่อจริง และ "ชื่อ-นามสกุล" เก็บนามสกุล
      // ถ้าค่าในคอลัมน์คำนำหน้าเป็นคำนำหน้าจริง ให้ถือว่าชื่อ-นามสกุลเป็นชื่อเต็ม
      const a = c.prefix >= 0 ? cell(row[c.prefix]) : "";
      const b = c.name >= 0 ? cell(row[c.name]) : "";
      let prefix: string | null = null, first = "", last = "";
      if (a && PREFIXES.has(a.toLowerCase())) {
        prefix = a;
        const parts = b.split(/\s+/);
        first = parts.shift() ?? "";
        last = parts.join(" ");
      } else {
        first = a;
        last = b;
      }
      const old = c.flagOld >= 0 ? toInt(row[c.flagOld]) : null;
      let flag = c.flag >= 0 ? toInt(row[c.flag]) : null;
      if (flag !== null) {
        lastFlag = flag;
        if (old !== null) lastByOld.set(old, flag);
      } else {
        // ช่องธงใหม่ว่าง (มักกรอกแค่แถวแรกของกลุ่ม) → ใช้ธงใหม่ของแถวก่อนหน้าที่ธงเดิมเดียวกัน
        const guess = (old !== null ? lastByOld.get(old) : undefined) ?? lastFlag;
        if (guess != null) {
          flag = guess;
          const k = `${guess}|${old ?? "-"}`;
          filled.set(k, [...(filled.get(k) ?? []), r + 1]);
        } else issues.push({ file, level: "warn", message: `${S} แถว ${r + 1}: รหัส ${emp} ไม่มีเบอร์ธงใหม่` });
      }
      const gender = c.gender >= 0 ? normalizeGender(row[c.gender]) : null;
      if (!gender) issues.push({ file, level: "warn", message: `${S} แถว ${r + 1}: รหัส ${emp} ไม่ระบุเพศ` });
      if (prefix && gender && ((prefix === "นาย" && gender === "หญิง") || (/^(นาง|นางสาว|น\.ส\.|นส\.)$/.test(prefix) && gender === "ชาย"))) {
        issues.push({ file, level: "warn", message: `${S} แถว ${r + 1}: รหัส ${emp} คำนำหน้า "${prefix}" แต่เพศ "${gender}" ตรวจอีกครั้ง` });
      }

      people.push({
        emp_id: emp,
        prefix,
        first_name: first,
        last_name: last,
        gender,
        cost_center: c.cc >= 0 ? cell(row[c.cc]) || null : null,
        area: c.area >= 0 ? cell(row[c.area]) || null : null,
        assembly_point: c.ap >= 0 ? cell(row[c.ap]) || null : null,
        flag_no: flag,
        flag_no_old: old,
        role: c.role >= 0 ? cell(row[c.role]) || null : null,
        source_file: file,
        sheet: name,
      });
    }
    for (const [k, rowsFilled] of filled) {
      const [f, o] = k.split("|");
      issues.push({ file, level: "warn",
        message: `${S}: ${rowsFilled.length} คนไม่ได้กรอกเบอร์ธงใหม่ (แถว ${rangeOf(rowsFilled)}) ใช้ธง ${f} ตามแถวก่อนหน้า${o !== "-" ? ` (ธงเดิม ${o})` : ""}` });
    }
  }
  if (!found) issues.push({ file, level: "error", message: "ไม่พบตารางที่มีหัวคอลัมน์ รหัสพนักงาน" });

  // ---- ชีตผู้นำธง
  for (const name of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[name]);
    const h = findHeader(rows, "ผู้นำธงอพยพ", 5);
    // ต้องเป็นหัวตารางจริง (มีคอลัมน์เบอร์ธง) ไม่ใช่บรรทัด "แผนก … ผู้นำธงอพยพ …" ของชีตรายชื่อ
    if (!h || h.heads.some((x) => x.includes("รหัสพนักงาน")) || !h.heads.some((x) => x.includes("เบอร์ธง"))) continue;
    const H = h.heads;
    const c = {
      ap: col(H, "จุดรวมพล"),
      flag: col(H, "เบอร์ธงอพยพ"),
      flagOld: col(H, "เบอร์ธงเดิม"),
      leader: col(H, "ผู้นำธงอพยพ"),
      cc: col(H, "costcenter"),
      area: col(H, "แผนก/พื้นที่", "แผนก"),
      note: col(H, "หมายเหตุ"),
    };
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r];
      const flag = toInt(row[c.flag]);
      const leader = cell(row[c.leader]);
      if (flag === null || !leader) continue;
      leaders.push({
        flag_no: flag,
        assembly_point: cell(row[c.ap]) || null,
        flag_no_old: c.flagOld >= 0 ? toInt(row[c.flagOld]) : null,
        leader_name: leader,
        cost_center: c.cc >= 0 ? cell(row[c.cc]) || null : null,
        area: c.area >= 0 ? cell(row[c.area]) || null : null,
        note: c.note >= 0 ? cell(row[c.note]) || null : null,
      });
    }
  }

  return { file, people, leaders, issues };
}

export type MergedPlan = {
  people: PlanPerson[];
  leaders: FlagLeader[];
  issues: FileIssue[];
  duplicates: { emp_id: string; files: string[] }[];
  /** จำนวนคนที่เบอร์ธงใหม่ในชีตรายชื่อไม่ตรงกับชีตผู้นำธง (ธงเดิมเดียวกัน) */
  flagMismatch: number;
};

/** sheet = ใช้เบอร์ธงใหม่ตามชีตรายชื่อ · leaders = แปลงจากธงเดิมตามชีตผู้นำธง */
export type FlagSource = "sheet" | "leaders";

/** รวมผลจากหลายไฟล์ ตรวจคนซ้ำข้ามไฟล์ และผู้นำธงที่ขัดกัน */
export function mergePlan(results: PlanFileResult[], flagFrom: FlagSource = "sheet"): MergedPlan {
  const issues = results.flatMap((r) => r.issues);
  if (flagFrom === "leaders") {
    const old2new = new Map<number, number>();
    for (const r of results) for (const l of r.leaders) if (l.flag_no_old != null && !old2new.has(l.flag_no_old)) old2new.set(l.flag_no_old, l.flag_no);
    results = results.map((r) => ({ ...r, people: r.people.map((p) =>
      p.flag_no_old != null && old2new.has(p.flag_no_old) ? { ...p, flag_no: old2new.get(p.flag_no_old)! } : p) }));
  }
  const byEmp = new Map<string, PlanPerson[]>();
  for (const r of results) for (const p of r.people) {
    const list = byEmp.get(p.emp_id) ?? [];
    list.push(p);
    byEmp.set(p.emp_id, list);
  }
  const duplicates: MergedPlan["duplicates"] = [];
  const people: PlanPerson[] = [];
  for (const [emp, list] of byEmp) {
    if (list.length > 1) {
      const flags = new Set(list.map((p) => p.flag_no));
      duplicates.push({ emp_id: emp, files: list.map((p) => p.source_file) });
      if (flags.size > 1) {
        issues.push({
          file: list.map((p) => p.source_file).join(", "),
          level: "error",
          message: `รหัส ${emp} อยู่หลายไฟล์และคนละธง (${[...flags].join(" / ")}) ใช้ค่าจากไฟล์แรก`,
        });
      }
    }
    people.push(list[0]);
  }

  const leaderMap = new Map<number, FlagLeader>();
  for (const r of results) for (const l of r.leaders) {
    const prev = leaderMap.get(l.flag_no);
    if (prev && prev.leader_name !== l.leader_name) {
      issues.push({
        file: r.file,
        level: "warn",
        message: `ธง ${l.flag_no} มีผู้นำธงไม่ตรงกันระหว่างไฟล์ ("${prev.leader_name}" กับ "${l.leader_name}")`,
      });
    }
    if (!prev) leaderMap.set(l.flag_no, l);
  }
  // ตรวจกับชีตผู้นำธง: ธงเดิม → ธงใหม่ ต้องตรงกัน และชื่อผู้นำธงต้องตรงกับคนที่บทบาท "ผู้นำธง"
  const byOld = new Map<number, FlagLeader>();
  for (const l of leaderMap.values()) if (l.flag_no_old != null) byOld.set(l.flag_no_old, l);
  const groups = new Map<string, { file: string; sheet: string; old: number; flag: number; n: number }>();
  for (const p of people) {
    if (p.flag_no_old == null || p.flag_no == null) continue;
    const k = `${p.source_file}|${p.sheet ?? ""}|${p.flag_no_old}|${p.flag_no}`;
    const g = groups.get(k) ?? { file: p.source_file, sheet: p.sheet ?? "", old: p.flag_no_old, flag: p.flag_no, n: 0 };
    g.n++; groups.set(k, g);
  }
  let flagMismatch = 0;
  for (const g of groups.values()) {
    const l = byOld.get(g.old);
    if (l && l.flag_no !== g.flag) {
      flagMismatch += g.n;
      issues.push({ file: g.file, level: "error",
        message: `ชีต "${g.sheet}": ธงเดิม ${g.old} ในชีตผู้นำธงเป็นธงใหม่ ${l.flag_no} (${l.area ?? l.leader_name}) แต่ชีตรายชื่อใส่ธง ${g.flag} (${g.n} คน) · ระบบใช้ธง ${g.flag} ตามชีตรายชื่อ` });
    }
  }
  for (const p of people) {
    if (p.flag_no == null || !/ผู้นำ/.test(p.role ?? "")) continue;
    const name = `${p.first_name} ${p.last_name}`.replace(/\s+/g, " ").trim();
    const l = leaderMap.get(p.flag_no);
    if (!l) {
      leaderMap.set(p.flag_no, { flag_no: p.flag_no, assembly_point: p.assembly_point, flag_no_old: p.flag_no_old,
        leader_name: name, cost_center: p.cost_center, area: p.area, note: "จากบทบาทในชีตรายชื่อ" });
    } else if (stripTitle(l.leader_name) !== stripTitle(name)) {
      issues.push({ file: p.source_file, level: "warn",
        message: `ธง ${p.flag_no}: ชีต "${p.sheet ?? ""}" ระบุผู้นำธงเป็น "${name}" แต่ชีตผู้นำธงเป็น "${l.leader_name}" · ใช้ตามชีตผู้นำธง` });
    }
  }
  const leaders = [...leaderMap.values()].sort((a, b) => a.flag_no - b.flag_no);
  people.sort((a, b) => (a.flag_no ?? 9999) - (b.flag_no ?? 9999) || a.emp_id.localeCompare(b.emp_id));
  return { people, leaders, issues, duplicates, flagMismatch };
}

// ---------------- MS Form (Excel ที่ sync กับฟอร์ม) ----------------

export type FormCheckin = {
  response_id: string;
  email: string;
  full_name: string | null;
  gender: string | null;
  site: string | null;
  submitted_at: string; // ISO UTC
};

/** วันที่ใน Excel เป็นเวลาท้องถิ่นไทย แปลง serial → ISO UTC */
export function excelSerialToIso(v: unknown, tzOffsetHours = 7): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400000) - tzOffsetHours * 3600000;
    return new Date(ms).toISOString();
  }
  const s = cell(v);
  if (!s) return null;
  // รูปแบบ M/D/YYYY H:MM แบบที่ Forms export
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, mo, d, y, h, mi, se] = m;
    const ms = Date.UTC(+y, +mo - 1, +d, +h - tzOffsetHours, +mi, +(se ?? 0));
    return new Date(ms).toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseFormWorkbook(wb: WorkBook): { rows: FormCheckin[]; issues: string[] } {
  const issues: string[] = [];
  const rows: FormCheckin[] = [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = rowsOf(ws);
  const h = findHeader(data, "email", 5);
  if (!h) return { rows, issues: ["ไม่พบหัวคอลัมน์ Email ในชีตแรก — ไฟล์นี้ใช่ Excel ของฟอร์มหรือไม่"] };
  const H = h.heads;
  const c = {
    id: col(H, "id"),
    done: col(H, "completiontime"),
    start: col(H, "starttime"),
    email: col(H, "email"),
    name: col(H, "name"),
    site: col(H, "clock(in-out)", "site", "ไซต์"),
    gender: col(H, "gender", "เพศ"),
  };
  for (let r = h.row + 1; r < data.length; r++) {
    const row = data[r];
    const email = cell(row[c.email]).toLowerCase();
    const id = cell(row[c.id]).replace(/\.0$/, "");
    if (!email || !id) continue;
    const at = excelSerialToIso(row[c.done >= 0 ? c.done : c.start]);
    if (!at) {
      issues.push(`แถว ${r + 1}: อ่านเวลาส่งไม่ได้`);
      continue;
    }
    rows.push({
      // ใช้ Id เดียวกับที่ Flow เขียนลง SharePoint List กันนับซ้ำเมื่อข้อมูลมาทั้งสองทาง
      response_id: id,
      email,
      full_name: c.name >= 0 ? cell(row[c.name]) || null : null,
      gender: c.gender >= 0 ? normalizeGender(row[c.gender]) : null,
      site: c.site >= 0 ? cell(row[c.site]) || null : null,
      submitted_at: at,
    });
  }
  return { rows, issues };
}
