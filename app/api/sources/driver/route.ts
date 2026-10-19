import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { syncDriver } from "@/lib/sources";
import { kioskConfigured } from "@/lib/kiosk";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [vehicles, flag, fields] = await Promise.all([
    q(`SELECT * FROM driver_presence ORDER BY checkin_at DESC NULLS LAST LIMIT 300`),
    getSetting<number | null>("driver_flag", null),
    getSetting<any>("driver_fields", null),
  ]);
  return ok({ configured: kioskConfigured(), vehicles, flag, fields });
});

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (b.action === "sync") return ok(await syncDriver({ force: !!b.force }));
  if (b.action === "flag") {
    const flag = b.flag === "" || b.flag == null ? null : Number(b.flag);
    if (flag !== null && !Number.isInteger(flag)) return fail("เบอร์ธงไม่ถูกต้อง");
    await setSetting("driver_flag", flag);
    return ok({ flag });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
