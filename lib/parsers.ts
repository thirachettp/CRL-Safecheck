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

/** หัวคอลัมน์ที่สะกดต่างกันในไฟล์จริง → ชื่อมาตรฐาน */
const HEAD_ALIASES: [RegExp, string][] = [
  [/รหัสหนักงาน|รหัสพนง\.?|รหัสพนักาน/g, "รหัสพนักงาน"],
];
const normHead = (h: string) => HEAD_ALIASES.reduce((x, [re, to]) => x.replace(re, to), clean(h));

/** หาแถวหัวตารางจากคำที่ต้องมี (ปกติคือแถว 4 ที่คอลัมน์แรกเป็น "จุดรวมพล") คืน index แถวและชื่อคอลัมน์ */
function findHeader(rows: unknown[][], mustHave: string, scan = 15) {
  for (let r = 0; r < Math.min(rows.length, scan); r++) {
    const heads = rows[r].map((c) => normHead(cell(c)));
    if (heads.some((h) => h.includes(clean(mustHave)))) return { row: r, heads };
  }
  return null;
}

/** ไฟล์ชั่วคราวของ Excel (~$ชื่อไฟล์.xlsx) ไม่ใช่ไฟล์จริง */
export const isTempExcel = (name: string) => name.split(/[\\/]/).pop()!.startsWith("~$");

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
};

/**
 * รวมผลจากหลายไฟล์ · เบอร์ธงของแต่ละคนยึดตามคอลัมน์ "เบอร์ธงอพยพใหม่" ในแถวข้อมูลเสมอ (ไม่ดูชื่อไฟล์/ชื่อชีต)
 * ผู้นำธง พื้นที่ และจุดรวมพลของธง ยึดตามแถวข้อมูลก่อน ชีตรายชื่อผู้นำธงใช้เติมธงที่ไม่มีข้อมูลในแถว
 */
export function mergePlan(results: PlanFileResult[]): MergedPlan {
  const issues = results.flatMap((r) => r.issues);
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
  // ข้อมูลธงจากแถวข้อมูล: ผู้นำธง = คนที่บทบาท "ผู้นำธง" · พื้นที่/จุดรวมพล/ธงเดิม/Cost Center = ค่าที่พบมากที่สุดในธง
  const mode = (xs: (string | number | null)[]) => {
    const c = new Map<string | number, number>();
    for (const x of xs) if (x != null && x !== "") c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const byFlag = new Map<number, PlanPerson[]>();
  for (const p of people) if (p.flag_no != null) byFlag.set(p.flag_no, [...(byFlag.get(p.flag_no) ?? []), p]);
  for (const [flag, list] of byFlag) {
    const leadsP = list.filter((p) => /ผู้นำ/.test(p.role ?? ""));
    const fromSheet = leaderMap.get(flag);
    const name = leadsP.length ? `${leadsP[0].first_name} ${leadsP[0].last_name}`.replace(/\s+/g, " ").trim() : null;
    if (leadsP.length > 1) {
      issues.push({ file: leadsP[1].source_file, level: "warn",
        message: `ธง ${flag} มีผู้นำธง ${leadsP.length} คน (${leadsP.map((p) => p.first_name).join(", ")}) ใช้ ${leadsP[0].first_name}` });
    }
    leaderMap.set(flag, {
      flag_no: flag,
      leader_name: name ?? fromSheet?.leader_name ?? "",
      area: (mode(list.map((p) => p.area)) as string | null) ?? fromSheet?.area ?? null,
      assembly_point: (mode(list.map((p) => p.assembly_point)) as string | null) ?? fromSheet?.assembly_point ?? null,
      flag_no_old: (mode(list.map((p) => p.flag_no_old)) as number | null) ?? fromSheet?.flag_no_old ?? null,
      cost_center: (mode(list.map((p) => p.cost_center)) as string | null) ?? fromSheet?.cost_center ?? null,
      note: fromSheet?.note ?? null,
    });
    if (!name && !fromSheet?.leader_name) issues.push({ file: list[0].source_file, level: "warn", message: `ธง ${flag} ไม่มีผู้นำธง (ไม่มีคนที่บทบาท "ผู้นำธงอพยพ")` });
  }
  const leaders = [...leaderMap.values()].sort((a, b) => a.flag_no - b.flag_no);
  people.sort((a, b) => (a.flag_no ?? 9999) - (b.flag_no ?? 9999) || a.emp_id.localeCompare(b.emp_id));
  // ธงที่มีแค่ในชีตผู้นำธง แต่ธงเดิมของมันมีคนอยู่ในแถวข้อมูลแล้ว (ถูกเปลี่ยนเบอร์ใหม่) = ไม่ต้องสร้างธงว่างซ้ำ
  const oldInData = new Set(people.map((p) => p.flag_no_old).filter((x) => x != null));
  const kept = leaders.filter((l) => byFlag.has(l.flag_no) || (l.leader_name && !(l.flag_no_old != null && oldInData.has(l.flag_no_old))));
  return { people, leaders: kept, issues, duplicates };
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

// ---------- ไฟล์รวม (แบบเดียวกับสคริปต์รวมไฟล์ของทีม: ทุกแถว + source file + source sheet) ----------
export function combinedRows(m: MergedPlan) {
  const leader = new Map(m.leaders.map((l) => [l.flag_no, l.leader_name]));
  return m.people.map((p) => ({
    "จุดรวมพล": p.assembly_point ?? "",
    "เบอร์ธงอพยพใหม่": p.flag_no ?? "",
    "เบอร์ธงอพยพเดิม": p.flag_no_old ?? "",
    "รหัสพนักงาน": p.emp_id,
    "คำนำหน้า": p.prefix ?? "",
    "ชื่อ-นามสกุล": `${p.first_name} ${p.last_name}`.trim(),
    "เพศ": p.gender ?? "",
    "Cost Center": p.cost_center ?? "",
    "แผนก/พื้นที่": p.area ?? "",
    "บทบาทหน้าที่": p.role ?? "",
    "ผู้นำธง (ชีตผู้นำธง)": p.flag_no != null ? leader.get(p.flag_no) ?? "" : "",
    "source file": p.source_file,
    "source sheet": p.sheet ?? "",
  }));
}
