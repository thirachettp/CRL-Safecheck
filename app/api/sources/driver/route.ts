import { normFlag } from "@/lib/flag";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { syncDriver } from "@/lib/sources";
import { kioskConfigured, rpcBody } from "@/lib/kiosk";
import { toVehicles, DPARK_FIELDS, type DparkRow } from "@/lib/kioskMap";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
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
    await q(`DELETE FROM driver_presence WHERE src = 'xlsx'`);
    const ins = vehicles.length ? await q<any>(
      `INSERT INTO driver_presence (plate, plate_display, driver_name, phone, company, zone, checkin_at, src, uploaded_at)
       SELECT x.p, x.pd, NULL, NULL, x.c, x.z, x.t, 'xlsx', now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[]) AS x(p, pd, c, z, t)
       WHERE NOT EXISTS (SELECT 1 FROM driver_presence d WHERE d.src = 'api' AND (d.plate = x.p OR d.plate LIKE x.p || '%'))
       ON CONFLICT (plate) DO NOTHING RETURNING plate`,
      [vehicles.map((v) => v.plate), vehicles.map((v) => v.plate_display), vehicles.map((v) => v.company), vehicles.map((v) => v.zone), vehicles.map((v) => v.checkin_at)]) : [];
    const types: Record<string, number> = {};
    for (const v of vehicles) types[v.company ?? "-"] = (types[v.company ?? "-"] ?? 0) + 1;
    return ok({ rows: rows.length, used: use.length, in_lot: vehicles.length, inserted: ins.length, dup: vehicles.length - ins.length, out, old, types, onlyMissing });
  }
  if (b.action === "flag") {
    const flag = normFlag(b.flag);
    if (flag !== null && !Number.isInteger(flag)) return fail("เบอร์ธงไม่ถูกต้อง");
    await setSetting("driver_flag", flag);
    return ok({ flag });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
