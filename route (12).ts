import { handle, ok } from "@/lib/http";
import { fanOutSync } from "@/lib/sources";
import { mergeIntoIncident } from "@/lib/incident";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** ดึงทุกแหล่งพร้อมกัน แล้ว merge ทับแบบบวกอย่างเดียว */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const results = await fanOutSync(25_000);
  const merged = await mergeIntoIncident(id, "sync");
  return ok({ results, added: merged.added });
});
