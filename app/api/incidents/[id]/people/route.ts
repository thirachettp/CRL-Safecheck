import { handle, ok, fail } from "@/lib/http";
import { addManualPerson, setStatus } from "@/lib/incident";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** เพิ่มคนที่ไม่อยู่ในรายชื่อ */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  if (!String(b.name ?? "").trim()) return fail("กรอกชื่อก่อน");
  const key = await addManualPerson(id, {
    name: b.name, gender: b.gender, flag_no: b.flag_no === "" || b.flag_no == null ? null : Number(b.flag_no), note: b.note, by: b.by,
  });
  return ok({ person_key: key });
});

/** เปลี่ยนสถานะคน */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id);
  const b = await req.json();
  await setStatus(id, String(b.person_key), b.status, String(b.by ?? ""));
  return ok({ ok: true });
});
