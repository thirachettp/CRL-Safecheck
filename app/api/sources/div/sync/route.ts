import { requireRole } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { syncDiv } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  return ok(await syncDiv());
});
