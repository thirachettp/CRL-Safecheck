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
  checkin_at: [/visitor.?check.?in/i, /check.?in.*(time|date|at)?/i, /time.?in|in.?time|entry|arriv/i, /gate.?in/i, /เวลาเข้า/, /created.?at/i, /^date$|datetime|timestamp/i],
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

/**
 * แปลงเป็นรายการรถ รถคันเดียวมีหลายแถว (หลายรายการขนส่ง) ให้เหลือแถวที่เข้าล่าสุด
 * - ทะเบียนที่เป็นลิงก์ ใช้ทะเบียนสำรองแทน ถ้าไม่มีทะเบียนจริงเลย ไม่นำมาใช้
 * - ไม่นับรถที่เข้าลานเกิน 2 วัน (ถ้ามีเวลาเข้าลาน)
 */
export function toVehicles(rows: Record<string, unknown>[], f: KioskFields, now = new Date()):
  { vehicles: Vehicle[]; skipped: number; url: number; old: number } {
  const map = new Map<string, Vehicle>();
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
    const v: Vehicle = {
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
  return { vehicles: [...map.values()], skipped, url, old };
}

/** กันฟีดพัง: จำนวนลดลงเกิน 30% จากรอบก่อน (เมื่อรอบก่อนมีอย่างน้อย 10 คัน) ให้กักไว้ก่อน */
export function shouldHold(prev: number, next: number) {
  return prev >= 10 && next < prev * 0.7;
}
