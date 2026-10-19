import { q } from "./db";
import { syncDriver, syncDiv } from "./sources";
import { graphConfigured } from "./graph";
import { kioskConfigured } from "./kiosk";
import { checkDiv, checkDriver, checkOutsource, summarize, type PersonCheck } from "./presenceReport";

export const WINDOW_H = 48;

export type Step = {
  key: string; label: string; mode: "pull" | "push" | "off";
  ok: boolean; ms: number | null; received: number | null; message: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const t = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - t, value };
  } catch (e: any) {
    return { ms: Date.now() - t, error: e?.message ?? String(e) };
  }
}

/**
 * เรียก Flow ย้อนหลังของ Power Automate (trigger "When an HTTP request is received")
 * Flow ดึงแถว 48 ชม. แล้วส่งเข้า /api/ingest/... เอง และตอบกลับผลที่แอปตอบ
 */
async function callBackfill(url: string, timeoutMs = 50_000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: WINDOW_H }), signal: ctl.signal,
    });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!r.ok) throw new Error(`Flow ตอบ ${r.status}${data?.error ? `: ${data.error}` : ""}`);
    return data;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`Flow ไม่ตอบภายใน ${timeoutMs / 1000} วินาที`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** ดึงทุกแหล่งย้อนหลัง 48 ชม. จับเวลารายแหล่ง (แหล่งไหนช้า/พังไม่ลากแหล่งอื่น) */
export async function runPulls(): Promise<Step[]> {
  const jobs: Promise<Step>[] = [];

  // Driver (KIOS): ดึงตรง ช่วงเวลาตาม KIOS_RPC_BODY ({{yesterday}} – {{today}} ≈ 48 ชม.)
  jobs.push((async () => {
    if (!kioskConfigured()) return { key: "driver", label: "Driver (KIOS)", mode: "off", ok: false, ms: null, received: null, message: "ยังไม่ได้ตั้งค่า KIOS" } as Step;
    const t = await timed(() => syncDriver());
    const v = t.value;
    return { key: "driver", label: "Driver (KIOS)", mode: "pull", ok: !!v?.ok, ms: t.ms, received: v?.count ?? null,
      message: t.error ?? v?.message ?? "" } as Step;
  })());

  // Outsource: Flow ย้อนหลัง (ถ้าตั้ง OS_BACKFILL_URL) ไม่งั้นใช้ที่ Flow ส่งเข้ามาเองแล้ว
  jobs.push((async () => {
    const url = process.env.OS_BACKFILL_URL;
    if (!url) return { key: "outsource", label: "Outsource (Power Apps)", mode: "push", ok: true, ms: null, received: null,
      message: "รับแบบ push อย่างเดียว (ยังไม่ได้ตั้ง OS_BACKFILL_URL) ใช้ข้อมูลที่มีในระบบ" } as Step;
    const t = await timed(() => callBackfill(url));
    return { key: "outsource", label: "Outsource (Power Apps)", mode: "pull", ok: !t.error, ms: t.ms,
      received: t.value?.saved ?? t.value?.received ?? null, message: t.error ?? `ได้ ${t.value?.saved ?? "?"} แถว` } as Step;
  })());

  // DIV+ (MS Form): Flow ย้อนหลัง → Graph → ไม่งั้น push อย่างเดียว
  jobs.push((async () => {
    const url = process.env.DIV_BACKFILL_URL;
    if (url) {
      const t = await timed(() => callBackfill(url));
      return { key: "div", label: "DIV+ (MS Form)", mode: "pull", ok: !t.error, ms: t.ms,
        received: t.value?.inserted ?? null, message: t.error ?? `ได้แถวใหม่ ${t.value?.inserted ?? "?"} แถว` } as Step;
    }
    if (graphConfigured()) {
      const t = await timed(() => syncDiv());
      return { key: "div", label: "DIV+ (MS Form)", mode: "pull", ok: !!t.value?.ok, ms: t.ms, received: t.value?.inserted ?? null,
        message: t.error ?? t.value?.message ?? "" } as Step;
    }
    return { key: "div", label: "DIV+ (MS Form)", mode: "push", ok: true, ms: null, received: null,
      message: "รับแบบ push อย่างเดียว (MS Forms ไม่มีทางดึงย้อนหลังแบบไม่ใช้ IT) ใช้ข้อมูลที่ Flow ส่งเข้ามา" } as Step;
  })());

  const steps = await Promise.all(jobs);
  steps.push({ key: "cnext", label: "Fulltime (Cnext)", mode: "off", ok: false, ms: null, received: null, message: "ยังไม่เชื่อม" });
  return steps;
}

/** ตรวจว่าใครอยู่/ไม่อยู่ จากข้อมูล 48 ชม. ล่าสุดในระบบ */
export async function presenceReport(now = new Date()) {
  const t0 = Date.now();
  const since = new Date(now.getTime() - WINDOW_H * 3600e3).toISOString();
  const [div, os, staff, drv] = await Promise.all([
    q<any>(`SELECT lower(email) AS email, full_name, site, submitted_at FROM div_checkins WHERE submitted_at > $1 ORDER BY submitted_at`, [since]),
    q<any>(`SELECT emp_id, clock_in, clock_out, status, site FROM outsource_attendance WHERE clock_in > $1 OR received_at > $1`, [since]),
    q<any>(`SELECT emp_id, concat_ws(' ', first_name, last_name) AS name FROM outsource_staff`),
    q<any>(`SELECT plate, plate_display, driver_name, zone, checkin_at FROM driver_presence`),
  ]);
  const people: PersonCheck[] = [];

  const byEmail = new Map<string, any[]>();
  for (const r of div) byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r]);
  for (const [email, list] of byEmail) {
    const name = [...list].reverse().find((x) => x.full_name)?.full_name ?? null;
    people.push(checkDiv(email, name, list.map((x) => ({ at: new Date(x.submitted_at), site: x.site })), now));
  }

  const names = new Map<string, string>(staff.filter((s) => s.name).map((s) => [s.emp_id, s.name]));
  const byEmp = new Map<string, any[]>();
  for (const r of os) byEmp.set(r.emp_id, [...(byEmp.get(r.emp_id) ?? []), {
    ...r, clock_in: r.clock_in && new Date(r.clock_in).toISOString(), clock_out: r.clock_out && new Date(r.clock_out).toISOString(),
  }]);
  for (const [emp, list] of byEmp) people.push(checkOutsource(emp, names.get(emp) ?? null, list, now));

  for (const v of drv) people.push(checkDriver({ ...v, checkin_at: v.checkin_at && new Date(v.checkin_at).toISOString() }, now));

  const order = { in: 0, unknown: 1, out: 2 } as const;
  people.sort((a, b) => order[a.verdict] - order[b.verdict] || b.flags.length - a.flags.length || a.name.localeCompare(b.name, "th"));
  return {
    at: now.toISOString(), window_h: WINDOW_H, ms: Date.now() - t0,
    rows: { div: div.length, outsource: os.length, driver: drv.length },
    summary: summarize(people), people,
  };
}
