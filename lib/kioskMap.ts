// แปลงแถวจาก KIOS (vms_dpark_withtransaction_detail) เป็นรถที่อยู่ในลาน
// ใช้ทะเบียนรถเป็น key แทนรหัสพนักงาน — ไม่ขึ้นกับ db เพื่อให้ทดสอบได้

export type KioskFields = {
  plate: string | null;
  plate_alt: string | null;   // ทะเบียนสำรอง (เช่น dpark_car_plate) ใช้เมื่อช่องหลักว่าง
  row_id: string | null;      // รหัสรายการ ใช้เป็น key เมื่อไม่มีทะเบียน (ห้ามตัดคนทิ้ง)
  province: string | null;
  driver_name: string | null;
  phone: string | null;
  company: string | null;
  /** เวลาออก: มีค่า = ออกแล้ว (ไม่เชื่อสถานะ/filter ของ KIOS) */
  checkout_at: string | null;
  checkout_alt: string | null;
  checkin_at: string | null;
  checkin_alt: string | null;
  zone: string | null;
};

export type Vehicle = {
  plate: string;          // ทะเบียนที่ normalize แล้ว ใช้เป็น key
  plate_display: string;  // ทะเบียนตามที่ระบบต้นทางแสดง
  driver_name: string | null;
  phone: string | null;
  company: string | null;
  zone: string | null;
  checkin_at: string | null; // ISO
};

// คำที่ใช้เดาชื่อคอลัมน์ เรียงจากเฉพาะเจาะจงที่สุด
const GUESS: Record<keyof KioskFields, RegExp[]> = {
  plate: [/visitor.?vehicle.?plate/i, /license.?plate/i, /plate.?no/i, /car.?license/i, /truck.?(no|license)/i, /vehicle.?(no|plate|license)/i, /^plate$/i, /plate/i, /ทะเบียน/, /license(?!.*(type|date|exp))/i],
  plate_alt: [/dpark.?car.?plate/i, /car.?plate/i],
  row_id: [/visitor.?transaction.?id/i, /transaction.?id/i, /ticket.?number/i, /^id$/i],
  province: [/province/i, /จังหวัด/],
  driver_name: [/visitor.?name/i, /driver.?name/i, /^driver$/i, /ชื่อคนขับ|คนขับ/, /full.?name/i, /(^|_)name$/i, /driver/i],
  phone: [/phone|mobile|tel/i, /เบอร์/],
  company: [/company|vendor|carrier|transport|supplier/i, /บริษัท|ขนส่ง/],
  // ต้องจับก่อน checkin_at (ไม่งั้น /datetime/ ของเวลาเข้าจะคว้าคอลัมน์เวลาออกไป)
  checkout_at: [/visitor.?check.?out/i, /^check.?out/i, /chk.?out/i, /time.?out|out.?time|exit.?(time|date|at)/i, /เวลาออก/],
  checkout_alt: [/dpark.?check.?out/i, /check.?out/i],
  checkin_at: [/visitor.?check.?in/i, /chk.?in/i, /check.?in.*(time|date|at)?/i, /time.?in|in.?time|entry|arriv/i, /gate.?in/i, /เวลาเข้า/, /created.?at/i, /^date$|datetime|timestamp/i],
  checkin_alt: [/dpark.?check.?in/i, /check.?in/i, /create.?date/i],
  zone: [/^places$/i, /dock|zone|parking(?!.?time)|lane|slot|bay/i, /ช่องจอด|โซน/],
};

// ข้อมูลส่วนบุคคลที่ระบบนับคนไม่ต้องใช้ ตัดทิ้งก่อนเก็บลงฐานข้อมูล (PDPA)
const SENSITIVE = /citizen|passport|address|image|photo/i;

/** เตรียมแถวจาก KIOS: ตัดข้อมูลอ่อนไหว และรวมสถานที่ (visitor_places) เป็นข้อความ */
export function prepareRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) if (!SENSITIVE.test(k)) out[k] = v;
    if (Array.isArray(r.visitor_places)) {
      out.places = (r.visitor_places as any[]).map((p) => p?.PlaceName ?? p?.placeName ?? "").filter(Boolean).join("; ") || null;
    }
    return out;
  });
}

const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** เดาว่าคอลัมน์ไหนคืออะไร override ได้ด้วย KIOS_FIELD_MAP */
export function detectFields(rows: Record<string, unknown>[], override: Partial<KioskFields> = {}): KioskFields {
  const keys = new Set<string>();
  for (const r of rows.slice(0, 20)) for (const [k, v] of Object.entries(r)) if (isScalar(v)) keys.add(k);
  const list = [...keys];
  const used = new Set<string>();
  const out = {} as KioskFields;
  for (const f of Object.keys(GUESS) as (keyof KioskFields)[]) {
    if (override[f] !== undefined) {
      out[f] = override[f] ?? null;
      if (out[f]) used.add(out[f]!);
      continue;
    }
    let hit: string | null = null;
    for (const re of GUESS[f]) {
      hit = list.find((k) => !used.has(k) && re.test(k)) ?? null;
      if (hit) break;
    }
    out[f] = hit;
    if (hit) used.add(hit);
  }
  return out;
}

/** ทะเบียนเดียวกันที่พิมพ์ต่างกัน (เว้นวรรค ขีด จุด ตัวเล็กใหญ่) ต้องได้ key เดียวกัน */
export function normalizePlate(v: unknown): string {
  return String(v ?? "").replace(/[\s\-–.·_/]+/g, "").toUpperCase();
}

/** เวลาจาก KIOS ที่ไม่มีโซนเวลา ถือว่าเป็นเวลาไทย */
export function toIso(v: unknown, tzOffsetHours = 7): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(hasZone ? s : s.replace(" ", "T") + `+0${tzOffsetHours}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const str = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || null;
};

/** ค่าที่เป็นลิงก์ (เช่น https://lin.ee/… จากการลงทะเบียนผ่าน LINE) ไม่ใช่ทะเบียนรถ */
export const isUrl = (v: string | null) => !!v && /^(https?:\/\/|www\.)|lin\.ee\//i.test(v.trim());

/** ดึงเฉพาะรถที่เข้าลานภายในกี่ชั่วโมง (ไม่ดูประเภท freeMember / Visitor) */
export const KIOS_WINDOW_H = 48;

/** มีเวลาออกแล้ว = ออกแล้ว ("-" / ว่าง / null = ยังไม่ออก) */
const hasOut = (v: unknown) => { const s = str(v); return !!s && s !== "-" && !/^(null|0)$/i.test(s); };

/**
 * แปลงเป็นรายการรถ รถคันเดียวมีหลายแถว (หลายรายการขนส่ง) ให้เหลือแถวที่เข้าล่าสุด
 * - ยังอยู่ในลาน = แถวล่าสุดยังไม่มีเวลาออก (ไม่เชื่อสถานะ/filter ออกแล้ว-ยังไม่ออก ของ KIOS)
 * - ทะเบียนที่เป็นลิงก์ ใช้ทะเบียนสำรองแทน ถ้าไม่มีทะเบียนจริงเลย ไม่นำมาใช้
 * - ไม่นับรถที่เข้าลานเกิน 2 วัน (ถ้ามีเวลาเข้าลาน)
 */
export function toVehicles(rows: Record<string, unknown>[], f: KioskFields, now = new Date()):
  { vehicles: Vehicle[]; skipped: number; url: number; old: number; out: number } {
  const map = new Map<string, Vehicle & { _out: boolean }>();
  let skipped = 0, url = 0, old = 0;
  const since = now.getTime() - KIOS_WINDOW_H * 3600e3;
  for (const r of rows) {
    const a = f.plate ? str(r[f.plate]) : null;
    const b = f.plate_alt ? str(r[f.plate_alt]) : null;
    const rawPlate = [a, b].find((x) => x && !isUrl(x)) ?? null;
    if (!rawPlate && (isUrl(a) || isUrl(b))) { url++; continue; }
    let plate = normalizePlate(rawPlate);
    if (!plate) {
      // ไม่มีทะเบียน: ยังต้องนับคน ใช้รหัสรายการแทน
      const rid = f.row_id ? str(r[f.row_id]) : null;
      if (!rid) {
        skipped++;
        continue;
      }
      plate = `ID-${rid}`;
    }
    const checkin_at = (f.checkin_at ? toIso(r[f.checkin_at]) : null) ?? (f.checkin_alt ? toIso(r[f.checkin_alt]) : null);
    if (checkin_at && new Date(checkin_at).getTime() < since) { old++; continue; }
    const prov = f.province ? str(r[f.province]) : null;
    const _out = (!!f.checkout_at && hasOut(r[f.checkout_at])) || (!!f.checkout_alt && hasOut(r[f.checkout_alt]));
    const v: Vehicle & { _out: boolean } = {
      _out,
      plate: prov ? plate + normalizePlate(prov) : plate,
      plate_display: rawPlate ? [rawPlate, prov].filter(Boolean).join(" ") : `ไม่มีทะเบียน (${plate.slice(3)})`,
      driver_name: f.driver_name ? str(r[f.driver_name]) : null,
      phone: f.phone ? str(r[f.phone]) : null,
      company: f.company ? str(r[f.company]) : null,
      zone: f.zone ? str(r[f.zone]) : null,
      checkin_at,
    };
    const prev = map.get(v.plate);
    if (!prev || (v.checkin_at ?? "") > (prev.checkin_at ?? "")) {
      map.set(v.plate, {
        ...v,
        driver_name: v.driver_name ?? prev?.driver_name ?? null,
        phone: v.phone ?? prev?.phone ?? null,
        company: v.company ?? prev?.company ?? null,
      });
    }
  }
  const all = [...map.values()];
  const vehicles = all.filter((v) => !v._out).map(({ _out, ...v }) => v);
  return { vehicles, skipped, url, old, out: all.length - vehicles.length };
}

/** กันฟีดพัง: จำนวนลดลงเกิน 30% จากรอบก่อน (เมื่อรอบก่อนมีอย่างน้อย 10 คัน) ให้กักไว้ก่อน */
export function shouldHold(prev: number, next: number) {
  return prev >= 10 && next < prev * 0.7;
}

/** หาคอลัมน์ "รูปแบบการทำรายการ" (ค่าแบบ freeMember / Visitor / Member) */
export function typeColumn(rows: Record<string, unknown>[]): string | null {
  const keys = new Set<string>();
  for (const r of rows.slice(0, 200)) for (const [k, v] of Object.entries(r)) if (typeof v === "string") keys.add(k);
  let best: string | null = null;
  for (const k of keys) {
    const vals = new Set(rows.slice(0, 500).map((r) => r[k]).filter((v) => typeof v === "string") as string[]);
    if (vals.size > 0 && vals.size <= 12 && [...vals].some((v) => /free.?member|^visitor$|^member$/i.test(v.trim()))) {
      if (!best || /type|mode|kind|รูปแบบ/i.test(k)) best = k;
    }
  }
  return best ?? ([...keys].find((k) => /transaction.?type|visit.?type|member.?type|^type$/i.test(k)) ?? null);
}

/** นับแยกตามรูปแบบการทำรายการ: KIOS ส่งมากี่แถว และเหลือเป็นรถในลานกี่คัน */
export function typeBreakdown(rows: Record<string, unknown>[], f: KioskFields, now = new Date()) {
  const col = typeColumn(rows);
  if (!col) return { column: null as string | null, types: [] as { type: string; rows: number; in_lot: number; out: number; old: number; skipped: number }[] };
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) { const t = str(r[col]) ?? "(ว่าง)"; groups.set(t, [...(groups.get(t) ?? []), r]); }
  const types = [...groups.entries()].map(([type, rs]) => {
    const v = toVehicles(rs, f, now);
    return { type, rows: rs.length, in_lot: v.vehicles.length, out: v.out, old: v.old, skipped: v.skipped + v.url };
  }).sort((a, b) => b.rows - a.rows);
  return { column: col, types };
}

/** วันเวลาแบบรายงาน KIOS "29/10/2026 16:49:03" (เวลาไทย) → ISO · "-" / ว่าง = null */
export function parseThaiDateTime(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  let y = Number(m[3]); if (y > 2400) y -= 543;
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0) - 7, Number(m[5] ?? 0), Number(m[6] ?? 0)));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type DparkRow = { id: string | null; plate: string | null; card: string | null; checkin_at: string | null; checkout_at: string | null; type: string | null; gate: string | null };
/** อ่าน Excel "รายงานรถเข้าออกทั้งหมด" จากเมนู dParkTransactions (หัวตาราง: ลำดับ เวลาเข้า เวลาออก … เลขทะเบียน ประเภท) */
export function parseDparkReport(aoa: unknown[][]): { rows: DparkRow[]; error?: string } {
  const hi = aoa.findIndex((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() === "เวลาเข้า") && r.some((c) => /ทะเบียน|หมายเลขบัตร/.test(String(c ?? ""))));
  if (hi < 0) return { rows: [], error: "ไม่พบหัวตาราง (เวลาเข้า / เลขทะเบียน) · ใช้ไฟล์ส่งออกจากเมนู dParkTransactions" };
  const H = (aoa[hi] as unknown[]).map((c) => String(c ?? "").trim());
  const col = (re: RegExp) => H.findIndex((h) => re.test(h));
  const c = { id: col(/^ลำดับ$/), in: col(/^เวลาเข้า$/), out: col(/^เวลาออก$/), plate: col(/เลขทะเบียน/), card: col(/หมายเลขบัตร/), type: col(/^ประเภท$/), gate: col(/ประตูทางเข้า/) };
  const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);
  const rows: DparkRow[] = [];
  for (const r of aoa.slice(hi + 1) as unknown[][]) {
    if (!Array.isArray(r) || !r.some((x) => x != null && String(x).trim() !== "")) continue;
    const plate = str(get(r, c.plate)) ?? str(get(r, c.card));
    const checkin_at = parseThaiDateTime(get(r, c.in));
    if (!plate && !checkin_at) continue;
    rows.push({
      id: str(get(r, c.id)), plate: plate && plate !== "-" ? plate : null, card: str(get(r, c.card)),
      checkin_at, checkout_at: parseThaiDateTime(get(r, c.out)), type: str(get(r, c.type)), gate: str(get(r, c.gate)),
    });
  }
  return { rows };
}
/** คอลัมน์ของ DparkRow สำหรับ toVehicles */
export const DPARK_FIELDS: KioskFields = {
  plate: "plate", plate_alt: "card", row_id: "id", province: null, driver_name: null, phone: null, company: "type",
  checkout_at: "checkout_at", checkout_alt: null, checkin_at: "checkin_at", checkin_alt: null, zone: "gate",
};

/** คอลัมน์ของ rpc/dpark_tr_transaction_alltime_bydate (ใช้เมื่อมีคอลัมน์นั้นจริง) */
export const DPARK_API_MAP: Partial<KioskFields> = {
  plate: "carplatenumber", plate_alt: "cardnumber", row_id: "transactionid", province: null, driver_name: null, phone: null,
  company: "transactiontypename", checkout_at: "transactionchkout", checkout_alt: null, checkin_at: "transactionchkin", checkin_alt: null, zone: "gatein",
};
export function dparkFields(rows: Record<string, unknown>[]): KioskFields {
  const keys = new Set<string>(); for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) keys.add(k);
  const ov: Partial<KioskFields> = {};
  for (const [k, v] of Object.entries(DPARK_API_MAP) as [keyof KioskFields, string | null][]) {
    if (v === null || keys.has(v)) ov[k] = v;
    else if (k === "plate_alt") ov[k] = null; // ไม่มีเลขบัตร: อย่าเดาไปจับคอลัมน์จังหวัด (carplatecity)
  }
  return detectFields(rows, ov);
}

/**
 * รวม 2 แหล่ง: รายการลานจอด (ครบทุกรูปแบบ ใช้ตัดสินว่ายังอยู่) + รายการ visitor (มีชื่อ/เบอร์/บริษัทคนขับ)
 * รถที่ไม่มีในรายการลานจอดเลย แต่ visitor บอกว่ายังอยู่ → ยังนับ (กันตกหล่น)
 */
export function mergeDriverSources(dp: Vehicle[], dpSeen: Set<string>, vis: Vehicle[]) {
  const base = (p: string) => p.replace(/^ID-/, "");
  const near = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  const find = (p: string) => vis.find((v) => near(v.plate, p));
  const out: Vehicle[] = dp.map((d) => {
    const v = find(d.plate);
    return v ? { ...d, driver_name: v.driver_name ?? d.driver_name, phone: v.phone ?? d.phone, company: v.company ?? d.company, zone: v.zone ?? d.zone } : d;
  });
  let visOnly = 0;
  for (const v of vis) {
    const b = base(v.plate);
    if ([...dpSeen].some((s) => near(s, b))) continue;
    out.push(v); visOnly++;
  }
  return { vehicles: out, visOnly };
}
