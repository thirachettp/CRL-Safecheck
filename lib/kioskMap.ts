// แปลงแถวจาก KIOS (vms_dpark_withtransaction_detail) เป็นรถที่อยู่ในลาน
// ใช้ทะเบียนรถเป็น key แทนรหัสพนักงาน — ไม่ขึ้นกับ db เพื่อให้ทดสอบได้

export type KioskFields = {
  plate: string | null;
  province: string | null;
  driver_name: string | null;
  phone: string | null;
  company: string | null;
  checkin_at: string | null;
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
  plate: [/license.?plate/i, /plate.?no/i, /car.?license/i, /truck.?(no|license)/i, /vehicle.?(no|plate|license)/i, /^plate$/i, /plate/i, /ทะเบียน/, /license(?!.*(type|date|exp))/i],
  province: [/province/i, /จังหวัด/],
  driver_name: [/driver.?name/i, /^driver$/i, /ชื่อคนขับ|คนขับ/, /full.?name/i, /^name$/i, /driver/i],
  phone: [/phone|mobile|tel/i, /เบอร์/],
  company: [/company|vendor|carrier|transport|supplier/i, /บริษัท|ขนส่ง/],
  checkin_at: [/check.?in.*(time|date|at)?/i, /time.?in|in.?time|entry|arriv/i, /gate.?in/i, /เวลาเข้า/, /created.?at/i, /^date$|datetime|timestamp/i],
  zone: [/dock|zone|parking|lane|slot|bay/i, /ช่องจอด|โซน/],
};

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

/** แปลงเป็นรายการรถ รถคันเดียวมีหลายแถว (หลายรายการขนส่ง) ให้เหลือแถวที่เข้าล่าสุด */
export function toVehicles(rows: Record<string, unknown>[], f: KioskFields): { vehicles: Vehicle[]; skipped: number } {
  const map = new Map<string, Vehicle>();
  let skipped = 0;
  for (const r of rows) {
    const rawPlate = f.plate ? str(r[f.plate]) : null;
    const plate = normalizePlate(rawPlate);
    if (!plate) {
      skipped++;
      continue;
    }
    const prov = f.province ? str(r[f.province]) : null;
    const v: Vehicle = {
      plate: prov ? plate + normalizePlate(prov) : plate,
      plate_display: [rawPlate, prov].filter(Boolean).join(" "),
      driver_name: f.driver_name ? str(r[f.driver_name]) : null,
      phone: f.phone ? str(r[f.phone]) : null,
      company: f.company ? str(r[f.company]) : null,
      zone: f.zone ? str(r[f.zone]) : null,
      checkin_at: f.checkin_at ? toIso(r[f.checkin_at]) : null,
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
  return { vehicles: [...map.values()], skipped };
}

/** กันฟีดพัง: จำนวนลดลงเกิน 30% จากรอบก่อน (เมื่อรอบก่อนมีอย่างน้อย 10 คัน) ให้กักไว้ก่อน */
export function shouldHold(prev: number, next: number) {
  return prev >= 10 && next < prev * 0.7;
}
