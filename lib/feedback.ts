// แบบรีวิวหลังซ้อม: คำถาม ตัวตรวจคำตอบ และตัวสรุปผล (ใช้ร่วมกันทั้งหน้าฟอร์ม ฝั่งเซิร์ฟเวอร์ และหน้าผลของ Admin)
export const GROUPS = ["Fulltime", "Outsource", "Division", "Driver"] as const;

export const SELECTS = {
  group: { label: "คุณอยู่ในกลุ่มไหน", opts: [...GROUPS] },
  device: { label: "ใช้อุปกรณ์อะไรทดสอบ", opts: ["iPhone", "Android", "คอมพิวเตอร์"] },
  role: { label: "ตอนซ้อมคุณเล่นบทไหน", opts: ["คนที่อยู่ในพื้นที่", "คนที่ไม่อยู่ในพื้นที่", "ผู้ตรวจสอบ / Safety"] },
  find: { label: "ค้นหาชื่อตัวเองหรือคนที่ต้องหา", opts: ["เจอทันที", "เจอแต่ต้องลองหลายครั้ง", "หาไม่เจอ"] },
  correct: { label: "ข้อมูลของคุณในระบบ (ชื่อ ธง จุดรวมพล)", opts: ["ถูกต้องทั้งหมด", "ผิดบางส่วน", "ผิดเกือบทั้งหมด"] },
  status: { label: "สถานะ อยู่ / ไม่อยู่ ตรงกับที่ซ้อมจริง", opts: ["ตรง", "ไม่ตรง", "ไม่แน่ใจ"] },
  time: { label: "ใช้เวลาตั้งแต่เปิดหน้าจนทำเสร็จ", opts: ["น้อยกว่า 30 วินาที", "30 วินาที – 1 นาที", "1 – 3 นาที", "มากกว่า 3 นาที"] },
  ready: { label: "โดยรวม SafeCheck พร้อมใช้ตอนเกิดเหตุจริงหรือยัง", opts: ["พร้อมใช้งานจริง", "พร้อมถ้าแก้ตามที่แจ้ง", "ยังไม่พร้อม"] },
} as const;
export type SelectKey = keyof typeof SELECTS;
export const SELECT_KEYS = Object.keys(SELECTS) as SelectKey[];

export const RATINGS = [
  { id: "ease", label: "ใช้งานง่าย ไม่ต้องมีคนอธิบาย" },
  { id: "readable", label: "ตัวอักษรและปุ่มอ่านและกดง่ายบนหน้าจอ" },
  { id: "speed", label: "ความเร็วในการค้นหาและตอบสนอง" },
  { id: "flags", label: "เข้าใจเรื่องธงและจุดรวมพล" },
  { id: "confident", label: "มั่นใจว่าใช้ได้จริงตอนเกิดเหตุ" },
] as const;
export type RatingKey = (typeof RATINGS)[number]["id"];

export const PROBLEMS = ["ค้นหาไม่เจอ", "ข้อมูลผิด", "ช้าหรือค้าง", "ปุ่มหรือตัวอักษรเล็กเกินไป", "ไม่เข้าใจข้อความบนหน้าจอ", "เข้าใช้งานไม่ได้", "ไม่พบปัญหา"] as const;

export type Answers = { select: Record<SelectKey, string>; ratings: Record<RatingKey, number>; problems: string[] };
export type Clean = {
  client_id: string; incident_id: number | null; name: string; emp_id: string; site: string;
  answers: Answers; good: string; improve: string;
};
export type FeedbackRow = {
  id: number; incident_id: number | null; name: string | null; emp_id: string | null; site: string | null;
  answers: Answers; good: string | null; improve: string | null; created_at: string; updated_at: string;
};

const txt = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const multi = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

/** ตรวจคำตอบจากหน้าฟอร์ม: คำถามบังคับต้องตอบครบ และค่าที่เลือกต้องอยู่ในตัวเลือก */
export function cleanFeedback(b: any): { ok: true; v: Clean } | { ok: false; error: string } {
  const client_id = txt(b?.client_id, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(client_id)) return { ok: false, error: "ไม่พบรหัสเครื่อง ลองรีเฟรชหน้าแล้วส่งใหม่" };
  const select = {} as Record<SelectKey, string>;
  for (const k of SELECT_KEYS) {
    const v = String(b?.select?.[k] ?? "");
    if (!(SELECTS[k].opts as readonly string[]).includes(v)) return { ok: false, error: `ยังไม่ได้ตอบ: ${SELECTS[k].label}` };
    select[k] = v;
  }
  const ratings = {} as Record<RatingKey, number>;
  for (const r of RATINGS) {
    const n = Number(b?.ratings?.[r.id]);
    if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `ยังไม่ได้ให้คะแนน: ${r.label}` };
    ratings[r.id] = n;
  }
  const problems = (Array.isArray(b?.problems) ? b.problems : []).map((x: unknown) => String(x)).filter((x: string) => (PROBLEMS as readonly string[]).includes(x));
  const inc = Number(b?.incident_id);
  return {
    ok: true,
    v: {
      client_id, incident_id: Number.isInteger(inc) && inc > 0 ? inc : null,
      name: txt(b?.name, 80), emp_id: txt(b?.emp_id, 30), site: txt(b?.site, 80),
      answers: { select, ratings, problems: [...new Set<string>(problems)] },
      good: multi(b?.good, 1000), improve: multi(b?.improve, 1000),
    },
  };
}

/** สรุปผลทั้งหมด: จำนวนคน คะแนนเฉลี่ยรายข้อ จำนวนตอบแต่ละตัวเลือก ปัญหาที่เจอ */
export function summarize(rows: { answers: Answers }[]) {
  const n = rows.length;
  const avg = {} as Record<RatingKey, number | null>;
  let sum = 0, cnt = 0;
  for (const r of RATINGS) {
    const xs = rows.map((x) => x.answers?.ratings?.[r.id]).filter((v): v is number => typeof v === "number");
    avg[r.id] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    sum += xs.reduce((a, b) => a + b, 0); cnt += xs.length;
  }
  const counts = {} as Record<SelectKey, Record<string, number>>;
  for (const k of SELECT_KEYS) {
    counts[k] = Object.fromEntries(SELECTS[k].opts.map((o) => [o, 0]));
    for (const x of rows) { const v = x.answers?.select?.[k]; if (v && v in counts[k]) counts[k][v]++; }
  }
  const problems: Record<string, number> = Object.fromEntries(PROBLEMS.map((p) => [p, 0]));
  for (const x of rows) for (const p of x.answers?.problems ?? []) if (p in problems) problems[p]++;
  return { n, avg, overall: cnt ? sum / cnt : null, counts, problems, readyPct: n ? Math.round((counts.ready[SELECTS.ready.opts[0]] / n) * 100) : null };
}

/** CSV สำหรับเปิดใน Excel (มี BOM กันภาษาไทยเพี้ยน) */
export function toCsv(rows: FeedbackRow[]) {
  const cols = ["เวลาที่ส่ง", "ชื่อ", "รหัส/ทะเบียน", "ไซต์/แผนก", ...SELECT_KEYS.map((k) => SELECTS[k].label), ...RATINGS.map((r) => r.label), "ปัญหาที่เจอ", "สิ่งที่ดี", "ควรปรับปรุง"];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [
    r.updated_at, r.name, r.emp_id, r.site,
    ...SELECT_KEYS.map((k) => r.answers?.select?.[k]), ...RATINGS.map((x) => r.answers?.ratings?.[x.id]),
    (r.answers?.problems ?? []).join("; "), r.good, r.improve,
  ].map(cell).join(","));
  return "﻿" + [cols.map(cell).join(","), ...lines].join("\r\n");
}
