import { handle, ok, fail } from "@/lib/http";
import { requireRole, sessionOf } from "@/lib/auth";
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
    const s = await sessionOf(req);
    if (!s) return fail("ต้องเข้าสู่ระบบก่อนแจ้งเหตุ", 401);
    if (!String(b.kind ?? "").trim()) return fail("เลือกประเภทเหตุ");
    return ok({ id: await reportIncident({ kind: b.kind, area: b.area ?? "", by: `${s.name} (${s.code})` }) });
  }
  if (b.action === "drill") {
    const actor = await requireRole(req, ["admin", "safety"]);
    // ซ้อม: ดึงข้อมูลเข้า-ออกล่าสุดก่อน แล้วค่อยเทียบกับผลตรวจทานธงตอนสร้างรายชื่อ (รอไม่เกิน ~15 วินาที)
    const pulled = await fanOutSync(15_000).catch(() => []);
    const id = await startDrill(actor, b.title);
    return ok({ id, pulled });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
