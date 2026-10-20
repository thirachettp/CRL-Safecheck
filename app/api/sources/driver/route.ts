import { normFlag } from "@/lib/flag";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { syncDriver } from "@/lib/sources";
import { kioskConfigured, rpcBody } from "@/lib/kiosk";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const [vehicles, flag, fields] = await Promise.all([
    q(`SELECT * FROM driver_presence ORDER BY checkin_at DESC NULLS LAST LIMIT 300`),
    getSetting<number | null>("driver_flag", null),
    getSetting<any>("driver_fields", null),
  ]);
  // Body ที่ส่งไป KIOS (ไม่มี apikey) ให้เห็นว่าดึงช่วงวันที่เท่าไร
  const kios = { template: process.env.KIOS_RPC_BODY || "{}", body: rpcBody(), status: process.env.KIOS_STATUS_ID || "2", rpc: process.env.KIOS_RPC || "vms_dpark_withtransaction_detail" };
  return ok({ configured: kioskConfigured(), vehicles, flag, fields, kios });
});

export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "sync") return ok(await syncDriver({ force: !!b.force }));
  if (b.action === "flag") {
    const flag = normFlag(b.flag);
    if (flag !== null && !Number.isInteger(flag)) return fail("เบอร์ธงไม่ถูกต้อง");
    await setSetting("driver_flag", flag);
    return ok({ flag });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
