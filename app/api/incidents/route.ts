import { handle, ok, fail } from "@/lib/http";
import { listIncidents, openIncident } from "@/lib/incident";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok({ incidents: await listIncidents() }));

/** เปิดเหตุการณ์: snapshot จาก cache ทันที ไม่รอดึงข้อมูลสด (หน้าเว็บเรียก /refresh ต่อเอง) */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (!["real", "drill"].includes(b.mode)) return fail("ต้องเลือกเหตุการณ์จริงหรือซ้อม");
  const id = await openIncident({
    mode: b.mode,
    title: b.title,
    divSites: Array.isArray(b.divSites) ? b.divSites : [],
    includePlan: b.includePlan !== false,
  });
  return ok({ id });
});
