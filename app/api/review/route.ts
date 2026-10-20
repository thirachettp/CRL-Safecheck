import { q } from "@/lib/db";
import { viewerOf } from "@/lib/auth";
import { handle, ok, fail } from "@/lib/http";
import { reviewFlag, flagCells, setAttendance, editPerson, removePerson, addPlanPerson, markReviewed, touchPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** ตรวจทานธง: ไม่ต้อง login แต่บันทึกชื่อคนแก้ทุกครั้ง */
export const GET = handle(async (req: Request) => {
  const f = Number(new URL(req.url).searchParams.get("flag"));
  const cells = await flagCells();
  const flag = Number.isInteger(f) && f > 0 ? f : cells[0]?.flag_no ?? null;
  const points = await q(`SELECT * FROM assembly_points ORDER BY sort, code`);
  const viewer = await viewerOf(req);
  if (flag == null) return ok({ flag: null, cells, people: [], points, viewer });
  const r = await reviewFlag(flag);
  // ไม่ได้เข้าสู่ระบบ = ไม่เห็นเบอร์โทร
  if (viewer === "anon") r.people = r.people.map((p: any) => ({ ...p, tel: null }));
  return ok({ flag, cells, points, viewer, ...r });
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
        // คนที่ไม่ได้เข้าสู่ระบบไม่เห็นเบอร์เดิม จึงไม่ให้เขียนทับเบอร์โทร
        first_name: b.first_name, last_name: b.last_name, gender: b.gender, tel: (await viewerOf(req)) === "anon" ? undefined : b.tel,
        cost_center: b.cost_center, area: b.area, flag_no: b.flag_no != null ? Number(b.flag_no) : undefined,
      }, by);
      await touchPlan();
      break;
    case "remove":
      await removePerson(String(b.emp_id), String(b.reason ?? "").trim(), by);
      await touchPlan();
      break;
    case "restore":
      await removePerson(String(b.emp_id), "", by, true);
      await touchPlan();
      break;
    case "add": {
      const id = await addPlanPerson({ ...b, flag_no: Number(b.flag_no) }, by);
      await touchPlan();
      return ok({ emp_id: id });
    }
    case "reviewed":
      await markReviewed(Number(b.flag), by);
      break;
    default:
      return fail("ไม่รู้จักคำสั่ง");
  }
  return ok({ ok: true });
});
