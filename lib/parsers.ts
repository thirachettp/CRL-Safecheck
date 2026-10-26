// อ่านไฟล์ Excel แผนอพยพรายแผนก และ Excel ที่ sync กับ MS Form
// ทำงานได้ทั้งในเบราว์เซอร์และใน Node (รับ workbook ของ SheetJS)
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import { normFlag, cmpFlag } from "./flag.ts";
import { isLatin, EN_PREFIX_GENDER } from "./names.ts";

export type PlanPerson = {
  emp_id: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  cost_center: string | null;
  area: string | null;
  assembly_point: string | null;
  flag_no: string | null;
  flag_no_old: string | null;
  role: string | null;
  /** ชื่อ-นามสกุลภาษาอังกฤษ (ถ้ามี) */
  name_en?: string | null;
  source_file: string;
  sheet?: string;
  /** รหัสพนักงานรูปแบบไม่ถูกต้อง (นำเข้าไว้ก่อน แก้ภายหลังได้) */
  bad_id?: boolean;
};

export type FlagLeader = {
  flag_no: string;
  assembly_point: string | null;
  flag_no_old: string | null;
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

/** ชีต "รายชื่อผู้นำธง" ไม่นำมาคิดอะไรเลย */
export const isLeaderSheet = (name: string) => name.replace(/\s+/g, "") === "รายชื่อผู้นำธง";

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
    if (isLeaderSheet(name)) continue;
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
      // คอลัมน์ชื่ออังกฤษ (ถ้ามี) แยกออกก่อน ไม่ให้ชนกับชื่อไทย
      nameEn: H.findIndex((h) => /อังกฤษ|english|\(en\)|name_?en|^name$|^fullname$/.test(h)),
      name: H.findIndex((h, i) => /ชื่อ-นามสกุล|ชื่อ-สกุล|^ชื่อ/.test(h) && !/อังกฤษ|english|\(en\)/.test(h)),
      gender: col(H, "เพศ"),
      cc: col(H, "costcenter"),
      area: col(H, "แผนก/พื้นที่", "แผนก", "พื้นที่"),
      role: col(H, "บทบาท"),
    };
    if (c.flag < 0) issues.push({ file, level: "warn", message: `ชีต "${name}" ไม่พบคอลัมน์เบอร์ธงอพยพใหม่ · นำเข้าโดยไม่มีเบอร์ธง` });

    const S = `ชีต "${name}"`;
    let blankRun = 0;
    let lastFlag: string | null = null;
    const lastByOld = new Map<string, string>();
    const filled = new Map<string, number[]>(); // "ธงใหม่|ธงเดิม" → แถวที่เติมให้
    const noCode: number[] = [];
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r];
      const rawEmp = cell(row[c.emp]).replace(/\.0$/, "");
      let emp = rawEmp.replace(/\s+/g, "").toUpperCase();
      const nameText = [c.prefix, c.name].filter((i) => i >= 0).map((i) => cell(row[i])).filter((x) => x && !PREFIXES.has(x.toLowerCase())).join(" ").replace(/\s+/g, " ").trim();
      if (!emp && !nameText) {
        if (++blankRun >= 5) break; // จบตารางเมื่อเจอแถวว่างติดกัน 5 แถว (ไม่มีทั้งรหัสและชื่อ)
        continue;
      }
      blankRun = 0;
      const missing = !emp;
      if (missing) { emp = `ไม่มีรหัส ${nameText}`.slice(0, 60); noCode.push(r + 1); }
      const badId = missing || !EMP_RE.test(emp);
      if (badId && !missing) {
        emp = rawEmp.replace(/\s+/g, " ").trim().slice(0, 60);
        issues.push({ file, level: "warn", message: `${S} แถว ${r + 1}: รหัสพนักงาน "${emp}" รูปแบบไม่ถูกต้อง · นำเข้าไว้ก่อน แก้รหัสได้ที่ ตั้งค่า › ชุดธง` });
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
      const old = c.flagOld >= 0 ? normFlag(row[c.flagOld]) : null;
      let flag = c.flag >= 0 ? normFlag(row[c.flag]) : null;
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
      let gender = c.gender >= 0 ? normalizeGender(row[c.gender]) : null;
      // ชื่ออังกฤษ: จากคอลัมน์อังกฤษ หรือถ้าช่องชื่อเดิมเป็นอักษรอังกฤษ ใช้ช่องนั้น
      const enCol = c.nameEn >= 0 ? cell(row[c.nameEn]).replace(/\s+/g, " ").trim() : "";
      const fullTyped = `${first} ${last}`.replace(/\s+/g, " ").trim();
      const name_en = enCol || (isLatin(fullTyped) ? fullTyped : "") || null;
      // ไม่มีเพศ แต่คำนำหน้าบอกได้ (นาย / Mr. = ชาย · นาง นางสาว / Mrs. Ms. Miss = หญิง)
      if (!gender && prefix) gender = EN_PREFIX_GENDER[prefix.toLowerCase()] ?? (prefix === "นาย" ? "ชาย" : /^(นาง|นางสาว|น\.ส\.|นส\.)$/.test(prefix) ? "หญิง" : null);
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
        name_en,
        source_file: file,
        sheet: name,
        ...(badId ? { bad_id: true } : {}),
      });
    }
    if (noCode.length) {
      issues.push({ file, level: "warn",
        message: `${S}: ${noCode.length} คนไม่มีรหัสพนักงาน (แถว ${rangeOf(noCode)}) · นำเข้าไว้ก่อนโดยใช้ชื่อแทนรหัส ใส่รหัสภายหลังได้ที่ ตั้งค่า › ชุดธง` });
    }
    for (const [k, rowsFilled] of filled) {
      const [f, o] = k.split("|");
      issues.push({ file, level: "warn",
        message: `${S}: ${rowsFilled.length} คนไม่ได้กรอกเบอร์ธงใหม่ (แถว ${rangeOf(rowsFilled)}) ใช้ธง ${f} ตามแถวก่อนหน้า${o !== "-" ? ` (ธงเดิม ${o})` : ""}` });
    }
  }
  if (!found) issues.push({ file, level: "error", message: "ไม่พบตารางที่มีหัวคอลัมน์ รหัสพนักงาน · ไฟล์นี้นำเข้าไม่ได้" });

  // ชีต "รายชื่อผู้นำธง" ไม่นำมาใช้ · ผู้นำธงและข้อมูลธงมาจากแถวข้อมูลเท่านั้น
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
 * ผู้นำธง พื้นที่ และจุดรวมพลของธง ยึดตามแถวข้อมูล · ชีต "รายชื่อผู้นำธง" ไม่นำมาใช้
 */
export function mergePlan(results: PlanFileResult[]): MergedPlan {
  const issues = results.flatMap((r) => r.issues);
  const byEmp = new Map<string, PlanPerson[]>();
  // รหัสผิดรูปแบบ (เช่น "ร้านค้าโรงอาหาร") ไม่ใช่คนเดียวกันแม้ข้อความซ้ำ → ต่อท้าย (2), (3) ให้ไม่ชนกัน
  const used = new Set(results.flatMap((r) => r.people.filter((p) => !p.bad_id).map((p) => p.emp_id)));
  results = results.map((r) => ({ ...r, people: r.people.map((p) => {
    if (!p.bad_id) return p;
    let id = p.emp_id, k = 1;
    while (used.has(id)) id = `${p.emp_id} (${++k})`;
    used.add(id);
    return id === p.emp_id ? p : { ...p, emp_id: id };
  }) }));
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
        // คนนี้ยังถูกนำเข้า (ใช้แถวแรก) จึงเป็นสีเหลือง
        issues.push({
          file: list.map((p) => p.source_file).join(", "),
          level: "warn",
          message: `รหัส ${emp} (${list[0].first_name}) อยู่หลายไฟล์และคนละธง: ${list.map((p) => `ธง ${p.flag_no ?? "—"} ใน ${p.source_file}`).join(" / ")} · นำเข้าธง ${list[0].flag_no ?? "—"} จากไฟล์แรก`,
        });
      }
    }
    people.push(list[0]);
  }

  const leaderMap = new Map<string, FlagLeader>();
  // ข้อมูลธงจากแถวข้อมูล: ผู้นำธง = คนที่บทบาท "ผู้นำธง" · พื้นที่/จุดรวมพล/ธงเดิม/Cost Center = ค่าที่พบมากที่สุดในธง
  const mode = (xs: (string | number | null)[]) => {
    const c = new Map<string | number, number>();
    for (const x of xs) if (x != null && x !== "") c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const byFlag = new Map<string, PlanPerson[]>();
  for (const p of people) if (p.flag_no != null) byFlag.set(p.flag_no, [...(byFlag.get(p.flag_no) ?? []), p]);
  for (const [flag, list] of byFlag) {
    const leadsP = list.filter((p) => /^\s*ผู้นำ/.test(p.role ?? ""));
    const name = leadsP.length ? `${leadsP[0].first_name} ${leadsP[0].last_name}`.replace(/\s+/g, " ").trim() : null;
    if (leadsP.length > 1) {
      issues.push({ file: leadsP[1].source_file, level: "warn",
        message: `ธง ${flag} มีผู้นำธง ${leadsP.length} คน (${leadsP.map((p) => p.first_name).join(", ")}) ใช้ ${leadsP[0].first_name}` });
    }
    leaderMap.set(flag, {
      flag_no: flag,
      leader_name: name ?? "",
      area: (mode(list.map((p) => p.area)) as string | null),
      assembly_point: (mode(list.map((p) => p.assembly_point)) as string | null),
      flag_no_old: (mode(list.map((p) => p.flag_no_old)) as string | null),
      cost_center: (mode(list.map((p) => p.cost_center)) as string | null),
      note: null,
    });
    if (!name) issues.push({ file: list[0].source_file, level: "warn", message: `ธง ${flag} ไม่มีผู้นำธง (ไม่มีคนที่บทบาท "ผู้นำธงอพยพ")` });
  }
  const leaders = [...leaderMap.values()].sort((a, b) => cmpFlag(a.flag_no, b.flag_no));
  people.sort((a, b) => cmpFlag(a.flag_no, b.flag_no) || a.emp_id.localeCompare(b.emp_id));
  return { people, leaders, issues, duplicates };
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
    "ชื่อ-นามสกุล (อังกฤษ)": p.name_en ?? "",
    "เพศ": p.gender ?? "",
    "Cost Center": p.cost_center ?? "",
    "แผนก/พื้นที่": p.area ?? "",
    "บทบาทหน้าที่": p.role ?? "",
    "ผู้นำธงของธงนี้": p.flag_no != null ? leader.get(p.flag_no) ?? "" : "",
    "source file": p.source_file,
    "source sheet": p.sheet ?? "",
  }));
}
