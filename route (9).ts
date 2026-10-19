import { handle, ok, fail } from "@/lib/http";
import { fanOutSync } from "@/lib/sources";

export const dynamic = "force-dynamic";

/** Vercel Cron เรียกทุก 15 นาที ช่วงกลางคืน (22:00–06:00) เหลือชั่วโมงละครั้ง */
export const GET = handle(async (req: Request) => {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail("unauthorized", 401);
  }
  const hourTh = (new Date().getUTCHours() + 7) % 24;
  const night = hourTh < 6 || hourTh >= 22;
  if (night && new Date().getUTCMinutes() >= 15) return ok({ skipped: "นอกเวลาทำงาน" });
  return ok({ results: await fanOutSync() });
});
