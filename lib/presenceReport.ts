// ตรวจคร่าวๆ ว่าใคร "อยู่ / ไม่อยู่" ตอนนี้ พร้อมเหตุผลที่อ่านเข้าใจได้ — ใช้กับปุ่ม Maintain
// ไฟล์นี้ไม่แตะฐานข้อมูล ทดสอบได้ตรงๆ
import { computePresence, DEDUPE_MS, AUTO_OUT_MS } from "./presence.ts";

export type Verdict = "in" | "out" | "unknown";
export type PersonCheck = {
  source: "div" | "outsource" | "driver";
  key: string;
  name: string;
  verdict: Verdict;
  site: string | null;
  since: string | null; // เข้าเมื่อ (ถ้าอยู่)
  reason: string;
  flags: string[]; // สิ่งผิดปกติที่ควรตรวจ
  events: number;
  // ฟิลด์มาตรฐานเดียวกันทุกแหล่ง (เติมเพิ่มใน maintain.ts จากชุดธง / รายชื่อ / โปรไฟล์)
  in_at: string | null;   // เข้าล่าสุด
  out_at: string | null;  // ออกล่าสุด (หรือเวลาที่ถือว่าออก)
  emp_id?: string | null;
  email?: string | null;
  plate?: string | null;
  gender?: string | null;
  phone?: string | null;
  company?: string | null;
  cost_center?: string | null;
  cc_name?: string | null;
  area?: string | null;
  flag_no?: string | null;
  assembly_point?: string | null;
  in_plan?: boolean;
  status_text?: string | null;
};

const H = 3600e3;
/** HH:MM ตามเวลาไทย + วันถ้าไม่ใช่วันเดียวกับ now */
export function bkk(d: Date | string, now = new Date()) {
  const t = new Date(typeof d === "string" ? d : d.getTime());
  const s = new Date(t.getTime() + 7 * H).toISOString();
  const n = new Date(now.getTime() + 7 * H).toISOString();
  const hm = s.slice(11, 16);
  return s.slice(0, 10) === n.slice(0, 10) ? hm : `${s.slice(8, 10)}/${s.slice(5, 7)} ${hm}`;
}
const hrs = (ms: number) => (ms / H).toFixed(1).replace(/\.0$/, "");

/** MS Form: ไม่มีคำถามเข้า/ออก ใช้กฎอนุมาน */
export function checkDiv(email: string, name: string | null, events: { at: Date; site: string | null }[], now: Date, gender: string | null = null): PersonCheck {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const flags: string[] = [];
  let dupes = 0;
  let moves = 0;
  let last: { at: Date; site: string | null } | null = null;
  for (const e of sorted) {
    if (last && e.at.getTime() - last.at.getTime() < DEDUPE_MS) dupes++;
    else if (last && (last.site ?? "").toUpperCase() !== (e.site ?? "").toUpperCase()) moves++;
    if (!last || e.at.getTime() - last.at.getTime() >= DEDUPE_MS) last = e;
  }
  if (dupes) flags.push(`ส่งซ้ำภายใน 10 นาที ${dupes} ครั้ง (นับครั้งเดียว)`);
  if (sorted.some((e) => e.at.getTime() > now.getTime() + 5 * 60e3)) flags.push("มีเวลาส่งในอนาคต");
  if (!name) flags.push("ไม่มีชื่อ");
  const p = computePresence(sorted, now);
  const base = { source: "div" as const, key: email, email, gender, name: name || email, events: sorted.length, flags,
    in_at: null as string | null, out_at: null as string | null };
  if (p.state === "in") {
    const left = AUTO_OUT_MS - (now.getTime() - p.since.getTime());
    return { ...base, verdict: "in", site: p.site, since: p.since.toISOString(), in_at: p.since.toISOString(),
      reason: `เข้า ${bkk(p.since, now)}${p.site ? ` ที่ ${p.site}` : ""}${moves ? " (ย้ายไซต์มา)" : ""} ยังไม่มีขาที่สอง · อีก ${hrs(left)} ชม. จะถือว่าออกอัตโนมัติ` };
  }
  if (p.state === "out") {
    const lastIn = [...sorted].reverse().find((e) => e.at.getTime() <= p.at.getTime() - (p.reason === "auto" ? 0 : DEDUPE_MS));
    return { ...base, verdict: "out", site: p.site, since: null, out_at: p.at.toISOString(),
      in_at: p.reason === "auto" ? new Date(p.at.getTime() - AUTO_OUT_MS).toISOString() : lastIn?.at.toISOString() ?? null,
      reason: p.reason === "auto"
        ? `เข้าแล้วไม่ส่งขาออก ครบ 14 ชม. ถือว่าออกอัตโนมัติ ${bkk(p.at, now)}`
        : `ส่งครั้งที่สอง ${bkk(p.at, now)}${p.site ? ` ที่ ${p.site}` : ""} = ออก` };
  }
  return { ...base, verdict: "unknown", site: null, since: null, reason: "ไม่มีรายการที่ใช้ได้" };
}

type OsRow = { emp_id: string; clock_in: string | null; clock_out: string | null; status: string | null; site: string | null };

/** Outsource: มี Clock in / Clock out ชัดเจน */
export function checkOutsource(emp: string, name: string | null, rows: OsRow[], now: Date): PersonCheck {
  const flags: string[] = [];
  const withIn = rows.filter((r) => r.clock_in).sort((a, b) => +new Date(b.clock_in!) - +new Date(a.clock_in!));
  const base = { source: "outsource" as const, key: emp, emp_id: emp, name: name || `Outsource ${emp}`, events: rows.length, flags,
    in_at: null as string | null, out_at: null as string | null, status_text: null as string | null };
  if (!name) flags.push("ไม่พบชื่อใน DC_FTE");
  if (rows.length > withIn.length) flags.push(`มี ${rows.length - withIn.length} แถวที่ไม่มี Clock in`);
  const r = withIn[0];
  if (r) { base.in_at = new Date(r.clock_in!).toISOString(); base.out_at = r.clock_out ? new Date(r.clock_out).toISOString() : null; base.status_text = r.status; }
  if (!r) return { ...base, verdict: "unknown", site: null, since: null, reason: "ไม่มี Clock in ใน 48 ชม." };
  const tin = new Date(r.clock_in!).getTime();
  const tout = r.clock_out ? new Date(r.clock_out).getTime() : null;
  if (tin > now.getTime() + 10 * 60e3) flags.push("Clock in เป็นเวลาในอนาคต");
  if (tout !== null && tout < tin) flags.push("เวลาออกก่อนเวลาเข้า");
  if (tout !== null && tout - tin > 16 * H) flags.push(`ทำงานยาว ${hrs(tout - tin)} ชม.`);
  const open = withIn.filter((x) => !x.clock_out).length;
  if (open > 1) flags.push(`มี ${open} แถวที่ยังไม่ Clock out`);
  if (tout !== null && tout >= tin) {
    return { ...base, verdict: "out", site: r.site, since: null, reason: `Clock in ${bkk(r.clock_in!, now)} · Clock out ${bkk(r.clock_out!, now)}` };
  }
  if (now.getTime() - tin > 14 * H) {
    return { ...base, verdict: "out", site: r.site, since: null,
      reason: `Clock in ${bkk(r.clock_in!, now)} ไม่มี Clock out เกิน 14 ชม. ถือว่าออก (ลืมกดออก?)` };
  }
  return { ...base, verdict: "in", site: r.site, since: new Date(tin).toISOString(),
    reason: `Clock in ${bkk(r.clock_in!, now)}${r.site ? ` ที่ ${r.site}` : ""} ยังไม่ Clock out${r.status ? ` · สถานะ ${r.status}` : ""}` };
}

/** KIOS: รถที่แถวล่าสุดยังไม่มีเวลาออก (ไม่เชื่อสถานะของ KIOS) */
export function checkDriver(v: { plate: string; plate_display: string | null; driver_name: string | null; zone: string | null; checkin_at: string | null; phone?: string | null; company?: string | null }, now: Date): PersonCheck {
  const flags: string[] = [];
  if (!v.driver_name) flags.push("ไม่มีชื่อคนขับ");
  if (/^ID-|https?:/i.test(v.plate)) flags.push("ไม่มีทะเบียนรถที่ใช้ได้");
  const age = v.checkin_at ? now.getTime() - new Date(v.checkin_at).getTime() : null;
  if (age !== null && age > 24 * H) flags.push(`ค้างในลาน ${hrs(age)} ชม. (ลืม check-out?)`);
  if (age === null) flags.push("ไม่มีเวลาเข้าลาน");
  return {
    source: "driver", key: v.plate, plate: v.plate_display ?? v.plate, phone: v.phone ?? null, company: v.company ?? null,
    in_at: v.checkin_at, out_at: null, cost_center: "DRIVER", cc_name: "คนขับ (KIOS)",
    name: v.driver_name || `คนขับรถ ${v.plate_display ?? v.plate}`, events: 1, flags,
    verdict: "in", site: v.zone, since: v.checkin_at,
    reason: `KIOS ยังไม่มีเวลาออก${v.checkin_at ? ` เข้าลาน ${bkk(v.checkin_at, now)}` : ""}${v.zone ? ` · ${v.zone}` : ""}`,
  };
}

export function summarize(list: PersonCheck[]) {
  const by = (src: string) => list.filter((p) => p.source === src);
  const count = (l: PersonCheck[]) => ({
    in: l.filter((p) => p.verdict === "in").length,
    out: l.filter((p) => p.verdict === "out").length,
    unknown: l.filter((p) => p.verdict === "unknown").length,
    flagged: l.filter((p) => p.flags.length).length,
  });
  const sites = new Map<string, number>();
  for (const p of list) if (p.verdict === "in") sites.set(p.site || "ไม่ระบุ", (sites.get(p.site || "ไม่ระบุ") ?? 0) + 1);
  return {
    total: count(list),
    div: count(by("div")), outsource: count(by("outsource")), driver: count(by("driver")),
    sites: [...sites.entries()].map(([site, n]) => ({ site, n })).sort((a, b) => b.n - a.n),
  };
}
