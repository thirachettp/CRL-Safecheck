import { handle, ok } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { runPulls, presenceReport } from "@/lib/maintain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ดูผลตรวจอยู่/ไม่อยู่จากข้อมูลที่มี (ไม่ดึงใหม่) */
export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  return ok({ steps: null, report: await presenceReport() });
});

/** Maintain: ดึงทุกแหล่งย้อนหลัง 48 ชม. จับเวลา แล้วตรวจอยู่/ไม่อยู่ */
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const t0 = Date.now();
  const steps = await runPulls();
  const pullMs = Date.now() - t0;
  const report = await presenceReport();
  return ok({ steps, pull_ms: pullMs, total_ms: Date.now() - t0, report });
});
