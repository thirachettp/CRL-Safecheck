import { handle, ok, fail } from "@/lib/http";
import { parseAttendance, parseStaff, storeAttendance, storeStaff } from "@/lib/outsource";
import { markSource } from "@/lib/sources";

export const dynamic = "force-dynamic";

/**
 * Power Automate (HTTP Premium) ส่งข้อมูล Outsource เข้ามา
 * - kind "attendance" (ค่าตั้งต้น): แถวจาก DC_Outsource_Attendance ทีละแถวหรือเป็นชุด
 * - kind "staff": รายชื่อจาก DC_FTE (ชื่อ นามสกุล Cost Center)
 * ใช้ token INGEST_TOKEN_OS หรือถ้าไม่ได้ตั้ง ใช้ตัวเดียวกับ DIV+ (INGEST_TOKEN_DIV)
 */
export const POST = handle(async (req: Request) => {
  const token = process.env.INGEST_TOKEN_OS || process.env.INGEST_TOKEN_DIV;
  if (!token || req.headers.get("x-sync-token") !== token) return fail("token ไม่ถูกต้อง", 401);
  const body = await req.json();
  const kind = String(body?.kind ?? "attendance");
  const records: any[] = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : Array.isArray(body?.value) ? body.value : [body];
  if (kind === "staff") {
    const rows = records.map(parseStaff).filter((r): r is NonNullable<typeof r> => !!r);
    const n = await storeStaff(rows);
    return ok({ kind, received: records.length, saved: n });
  }
  const rows = records.map(parseAttendance).filter((r): r is NonNullable<typeof r> => !!r);
  // ชื่อที่แนบมากับแถวเข้างาน (ถ้า Flow ส่งมาด้วย) เก็บเป็นรายชื่อไปพร้อมกัน
  const staff = records.map((r) => (r?.firstname || r?.lastname || r?.cost_center ? parseStaff(r) : null)).filter((r): r is NonNullable<typeof r> => !!r);
  const n = await storeAttendance(rows);
  if (staff.length) await storeStaff(staff);
  await markSource("outsource", true, null);
  return ok({ kind, received: records.length, saved: n, skipped: records.length - n });
});
