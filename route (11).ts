import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { currentIncident, listIncidents, reportIncident, startDrill } from "@/lib/incident";
import { fanOutSync } from "@/lib/sources";
import { mergeIntoIncident } from "@/lib/incident";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async () => ok({ current: await currentIncident(), incidents: await listIncidents() }));

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (b.action === "report") {
    // แจ้งเหตุต้องระบุตัวตน แล้วรอ Admin / Safety Officer ยืนยัน
    if (!String(b.by ?? "").trim()) return fail("ต้องเข้าสู่ระบบก่อนแจ้งเหตุ", 401);
    if (!String(b.kind ?? "").trim()) return fail("เลือกประเภทเหตุ");
    return ok({ id: await reportIncident({ kind: b.kind, area: b.area ?? "", by: b.by }) });
  }
  if (b.action === "drill") {
    const actor = requireRole(req, ["admin", "safety"]);
    const id = await startDrill(actor, b.title);
    // snapshot แล้ว ค่อยดึงข้อมูลสดตามมา ไม่ให้หน้าจอรอ
    fanOutSync(25_000).then(() => mergeIntoIncident(id, "sync")).catch(() => {});
    return ok({ id });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
