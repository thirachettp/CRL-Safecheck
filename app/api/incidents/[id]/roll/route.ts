import { handle, ok } from "@/lib/http";
import { rollCall } from "@/lib/incident";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** เช็คชื่อทั้งธง (ซ้อม) */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  return ok(await rollCall(id, {
    flag: Number(b.flag), safe: (b.safe ?? []).map(String), inj: (b.inj ?? []).map(String),
    count: Number(b.count), by: String(b.by ?? "").trim(),
  }));
});
