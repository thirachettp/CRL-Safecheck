import { normFlag } from "@/lib/flag";
import { handle, ok, fail } from "@/lib/http";
import { addManualPerson, setStatus } from "@/lib/incident";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** เพิ่มคนนอกรายชื่อระหว่างเหตุ */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  if (!String(b.name ?? "").trim()) return fail("กรอกชื่อก่อน");
  const flag = normFlag(b.flag_no);
  return ok({ person_key: await addManualPerson(id, { name: b.name, gender: b.gender, flag_no: flag, note: b.note, by: b.by }) });
});

/** ระบุสถานะรายคน (ไม่ต้อง login) */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  await setStatus(id, String(b.person_key), b.status, String(b.by ?? "").trim() || "ไม่ระบุชื่อ", b.note ?? null);
  return ok({ ok: true });
});
