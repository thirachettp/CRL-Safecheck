import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { reviewFlag, flagCells, setAttendance, editPerson, removePerson, addPlanPerson, markReviewed } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** ตรวจทานธง: ไม่ต้อง login แต่บันทึกชื่อคนแก้ทุกครั้ง */
export const GET = handle(async (req: Request) => {
  const f = Number(new URL(req.url).searchParams.get("flag"));
  const cells = await flagCells();
  const flag = Number.isInteger(f) && f > 0 ? f : cells[0]?.flag_no ?? null;
  const points = await q(`SELECT * FROM assembly_points ORDER BY sort, code`);
  if (flag == null) return ok({ flag: null, cells, people: [], points });
  return ok({ flag, cells, points, ...(await reviewFlag(flag)) });
});

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const by = String(b.by ?? "").trim() || "ไม่ระบุชื่อ";
  switch (b.action) {
    case "attend":
      await setAttendance(`emp:${b.emp_id}`, !!b.here, by);
      break;
    case "edit":
      await editPerson(String(b.emp_id), {
        first_name: b.first_name, last_name: b.last_name, gender: b.gender, tel: b.tel,
        cost_center: b.cost_center, area: b.area, flag_no: b.flag_no != null ? Number(b.flag_no) : undefined,
      }, by);
      break;
    case "remove":
      await removePerson(String(b.emp_id), String(b.reason ?? "").trim(), by);
      break;
    case "restore":
      await removePerson(String(b.emp_id), "", by, true);
      break;
    case "add":
      return ok({ emp_id: await addPlanPerson({ ...b, flag_no: Number(b.flag_no) }, by) });
    case "reviewed":
      await markReviewed(Number(b.flag), by);
      break;
    default:
      return fail("ไม่รู้จักคำสั่ง");
  }
  return ok({ ok: true });
});
