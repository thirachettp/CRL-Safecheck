import { handle, ok } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { announce } from "@/lib/incident";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** บันทึกประกาศ Code (Safety / Admin) เวลาบันทึกอัตโนมัติ */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const actor = requireRole(req, ["admin", "safety"]);
  const id = Number((await params).id);
  const b = await req.json();
  await announce(id, b.code_id ? Number(b.code_id) : null, b.label ?? null, actor);
  return ok({ ok: true });
});
