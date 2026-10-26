import { notify } from "@/lib/push";
import { getSetting, setSetting } from "@/lib/settings";
import { handle, ok, fail } from "@/lib/http";
import { requireRole, sessionOf } from "@/lib/auth";
import { currentIncident, listIncidents, reportIncident, startDrill, pendingReal } from "@/lib/incident";
import { fanOutSync } from "@/lib/sources";
import { mergeIntoIncident } from "@/lib/incident";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async () => {
  const [current, pending, incidents] = await Promise.all([currentIncident(), pendingReal(), listIncidents()]);
  // pending = เหตุจริงรอยืนยัน แยกไว้เมื่อกำลังซ้อมอยู่ (current คือการซ้อม)
  return ok({ current, pending: pending && pending.id !== current?.id ? pending : null, incidents });
});

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (b.action === "report") {
    // แจ้งเหตุต้องระบุตัวตน แล้วรอ Admin / Safety Officer ยืนยัน
    const s = await sessionOf(req);
    if (!s) return fail("ต้องเข้าสู่ระบบก่อนแจ้งเหตุ", 401);
    if (!String(b.kind ?? "").trim()) return fail("เลือกประเภทเหตุ");
    b.kind = String(b.kind).trim().slice(0, 60);
    b.area = String(b.area ?? "").trim().slice(0, 80);
    // พื้นที่ใหม่ที่พิมพ์เอง เก็บไว้ให้เลือกครั้งถัดไป
    if (b.area) {
      const extra = await getSetting<string[]>("incident_areas", []);
      if (!extra.includes(b.area)) await setSetting("incident_areas", [...extra, b.area].slice(-200));
    }
    const drill = b.mode === "drill";
    const id = await reportIncident({ kind: b.kind, area: b.area ?? "", by: `${s.name} (${s.code})`, mode: drill ? "drill" : "real" });
    // แจ้ง Admin / Safety Officer ให้มายืนยัน
    const pushed = await notify("staff", { title: drill ? `📣 ขอเริ่มซ้อมอพยพ: ${b.kind}` : `🚨 มีการแจ้งเหตุ: ${b.kind}`,
      body: `${b.area || "ไม่ระบุพื้นที่"} · แจ้งโดย ${s.name} · รอ Admin / Safety ยืนยัน`,
      url: "/?stay=1", tag: `report-${id}`, urgent: true }).catch(() => null);
    return ok({ id, pushed });
  }
  if (b.action === "drill") {
    const actor = await requireRole(req, ["admin", "safety"]);
    // ซ้อม: ดึงข้อมูลเข้า-ออกล่าสุดก่อน แล้วค่อยเทียบกับผลตรวจทานธงตอนสร้างรายชื่อ (รอไม่เกิน ~15 วินาที)
    const pulled = await fanOutSync(15_000).catch(() => []);
    const id = await startDrill(actor, b.title);
    const pushed = await notify("all", { title: "📣 เริ่มซ้อมอพยพ", body: `${b.title || "ซ้อมอพยพ"} · ไปที่จุดรวมพลของธงคุณ แล้วกดปลอดภัยในแอป`,
      url: "/search", tag: `incident-${id}`, urgent: true }).catch(() => null);
    return ok({ id, pulled, pushed });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
