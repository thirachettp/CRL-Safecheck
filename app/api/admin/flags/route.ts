import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { reviewFlag, saveFlag, deleteFlag, editPerson, addPlanPerson, removePerson } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** คนในธง (หน้าตั้งค่า) */
export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const f = Number(new URL(req.url).searchParams.get("flag"));
  if (!Number.isInteger(f)) return fail("ระบุธง");
  return ok(await reviewFlag(f));
});

/** Admin แก้ชุดธง: ธง และคนในธง */
export const POST = handle(async (req: Request) => {
  const a = await requireRole(req, ["admin"]);
  const b = await req.json();
  const by = a.code ? `${a.name} (${a.code})` : a.name;
  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
  switch (b.action) {
    case "flag-add":
    case "flag-save":
      await saveFlag({ ...b, flag_no: Number(b.flag_no), flag_no_old: num(b.flag_no_old) }, b.action === "flag-add");
      return ok({ ok: true });
    case "flag-delete":
      await deleteFlag(Number(b.flag_no));
      return ok({ ok: true });
    case "person-add":
      return ok({ emp_id: await addPlanPerson({ ...b, flag_no: Number(b.flag_no) }, by) });
    case "person-edit":
      await editPerson(String(b.emp_id), {
        prefix: b.prefix, first_name: b.first_name, last_name: b.last_name, gender: b.gender, tel: b.tel, role: b.role,
        cost_center: b.cost_center, area: b.area, flag_no: b.flag_no != null && b.flag_no !== "" ? Number(b.flag_no) : undefined,
      }, by);
      return ok({ ok: true });
    case "person-remove":
      await removePerson(String(b.emp_id), String(b.reason ?? "").trim(), by);
      return ok({ ok: true });
    case "person-restore":
      await removePerson(String(b.emp_id), "", by, true);
      return ok({ ok: true });
  }
  return fail("ไม่รู้จักคำสั่ง");
});
