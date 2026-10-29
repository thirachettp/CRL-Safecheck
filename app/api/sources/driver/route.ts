import { normFlag } from "@/lib/flag";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { syncDriver, syncDriverIfStale } from "@/lib/sources";
import { after } from "next/server";
import { kioskConfigured, rpcBody } from "@/lib/kiosk";
import { toVehicles, DPARK_FIELDS, normalizePlate, nearPlate, type DparkRow } from "@/lib/kioskMap";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  // เปิดหน้านี้ค้างไว้ = อัปเดตจาก KIOS อัตโนมัติทุก ~1 นาที
  after(() => syncDriverIfStale(60).catch(() => null));
  const [vehicles, flag, fields] = await Promise.all([
    q(`SELECT * FROM driver_presence WHERE src = 'api' OR uploaded_at > now() - interval '12 hours' ORDER BY checkin_at DESC NULLS LAST LIMIT 500`),
    getSetting<number | null>("driver_flag", null),
    getSetting<any>("driver_fields", null),
  ]);
  // Body ที่ส่งไป KIOS (ไม่มี apikey) ให้เห็นว่าดึงช่วงวันที่เท่าไร
  const kios = { template: process.env.KIOS_RPC_BODY || "{}", body: rpcBody(), status: process.env.KIOS_STATUS_ID || null, rpc: process.env.KIOS_RPC || "vms_dpark_withtransaction_detail" };
  return ok({ configured: kioskConfigured(), vehicles, flag, fields, kios });
});

export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "sync") return ok(await syncDriver({ force: !!b.force }));
  if (b.action === "upload") {
    // Excel รายงานรถเข้าออก (dParkTransactions): เติมรถที่ API ไม่ส่งมา (freeMember ฯลฯ) · ไม่ทับทะเบียนที่ API มีแล้ว
    const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 20000) as DparkRow[];
    if (!rows.length) return fail("ไม่พบแถวในไฟล์");
    const onlyMissing = kioskConfigured() && b.all !== true;
    const use = onlyMissing ? rows.filter((r) => !/^visitor$/i.test(String(r.type ?? "").trim())) : rows;
    const { vehicles, out, old } = toVehicles(use as any, DPARK_FIELDS);
    const dir = await q<any>(`SELECT plate, driver_name, phone FROM driver_directory WHERE driver_name IS NOT NULL`);
    for (const v of vehicles) { const d = dir.find((x) => nearPlate(x.plate, v.plate)); if (d) { v.driver_name = d.driver_name; v.phone = v.phone ?? d.phone; } }
    await q(`DELETE FROM driver_presence WHERE src = 'xlsx'`);
    const ins = vehicles.length ? await q<any>(
      `INSERT INTO driver_presence (plate, plate_display, driver_name, phone, company, zone, checkin_at, src, uploaded_at)
       SELECT x.p, x.pd, x.n, x.ph, x.c, x.z, x.t, 'xlsx', now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::text[], $7::text[]) AS x(p, pd, c, z, t, n, ph)
       WHERE NOT EXISTS (SELECT 1 FROM driver_presence d WHERE d.src = 'api' AND (d.plate = x.p OR d.plate LIKE x.p || '%'))
       ON CONFLICT (plate) DO NOTHING RETURNING plate`,
      [vehicles.map((v) => v.plate), vehicles.map((v) => v.plate_display), vehicles.map((v) => v.company), vehicles.map((v) => v.zone), vehicles.map((v) => v.checkin_at), vehicles.map((v) => v.driver_name), vehicles.map((v) => v.phone)]) : [];
    const types: Record<string, number> = {};
    for (const v of vehicles) types[v.company ?? "-"] = (types[v.company ?? "-"] ?? 0) + 1;
    return ok({ rows: rows.length, used: use.length, in_lot: vehicles.length, inserted: ins.length, dup: vehicles.length - ins.length, out, old, types, onlyMissing });
  }
  if (b.action === "name") {
    // Admin ตั้งชื่อคนขับให้ทะเบียนนี้ (จำไว้ใช้ครั้งต่อไป ไม่ถูกทับด้วยข้อมูล visitor)
    const plate = normalizePlate(b.plate);
    const name = String(b.driver_name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const phone = String(b.phone ?? "").trim().slice(0, 20) || null;
    if (plate.length < 3) return fail("ระบุทะเบียน");
    const a = await requireRole(req, ["admin"]);
    if (!name) {
      await q(`DELETE FROM driver_directory WHERE plate = $1 AND source = 'manual'`, [plate]);
    } else {
      await q(
        `INSERT INTO driver_directory (plate, plate_display, driver_name, phone, source, updated_by, last_seen) VALUES ($1, $2, $3, $4, 'manual', $5, now())
         ON CONFLICT (plate) DO UPDATE SET driver_name = EXCLUDED.driver_name, phone = COALESCE(EXCLUDED.phone, driver_directory.phone), source = 'manual', updated_by = EXCLUDED.updated_by, last_seen = now()`,
        [plate, String(b.plate_display ?? b.plate), name, phone, a.name]);
    }
    const rows = await q<any>(`SELECT plate FROM driver_presence`);
    const hit = rows.filter((r) => nearPlate(r.plate, plate)).map((r) => r.plate);
    if (hit.length) await q(`UPDATE driver_presence SET driver_name = $2, phone = COALESCE($3, phone), name_src = CASE WHEN $2::text IS NULL THEN NULL ELSE 'manual' END WHERE plate = ANY($1::text[])`, [hit, name || null, phone]);
    return ok({ saved: true, updated: hit.length });
  }
  if (b.action === "flag") {
    const flag = normFlag(b.flag);
    if (flag !== null && !Number.isInteger(flag)) return fail("เบอร์ธงไม่ถูกต้อง");
    await setSetting("driver_flag", flag);
    return ok({ flag });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
