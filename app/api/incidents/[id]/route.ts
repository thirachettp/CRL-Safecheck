import { handle, ok, fail } from "@/lib/http";
import { closeIncident, getIncident, getPeople } from "@/lib/incident";
import { sourceStates } from "@/lib/sources";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const inc = await getIncident(id);
  if (!inc) return fail("ไม่พบเหตุการณ์", 404);
  const f = new URL(req.url).searchParams.get("flag");
  const flag = f === null ? undefined : f === "none" ? "none" : Number(f);
  const [people, leaders, sources] = await Promise.all([
    getPeople(id, flag as any),
    q(`SELECT flag_no, leader_name, assembly_point, area FROM flag_leaders ORDER BY flag_no`),
    sourceStates(),
  ]);
  return ok({ incident: inc, people, leaders, sources, now: new Date().toISOString() });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  if (b.action === "close") {
    await closeIncident(id);
    return ok({ closed: true });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
