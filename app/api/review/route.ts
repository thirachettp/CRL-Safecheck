import { q } from "@/lib/db";
import { viewerOf, requireUser } from "@/lib/auth";
import { normFlag } from "@/lib/flag";
import { handle, ok, fail } from "@/lib/http";
import { reviewFlag, flagCells, searchPlan, setAttendance, editPerson, removePerson, addPlanPerson, markReviewed, touchPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** ตรวจทานธง: ต้องเข้าสู่ระบบ · บันทึกชื่อคนตรวจ/คนแก้จากบัญชีทุกครั้ง */
export const GET = handle(async (req: Request) => {
  const viewerReq = await viewerOf(req);
  if (viewerReq === "anon") return fail("ต้องเข้าสู่ระบบก่อนตรวจทานธง", 401);
  const term = new URL(req.url).searchParams.get("q");
  if (term != null) return ok({ results: (await searchPlan(term)).filter((p: any) => !p.removed) });
  const f = normFlag(new URL(req.url).searchParams.get("flag"));
  const cells = await flagCells();
  const flag: string | null = f && cells.some((c: any) => c.flag_no === f) ? f : f ?? cells[0]?.flag_no ?? null;
  const points = await q(`SELECT * FROM assembly_points ORDER BY sort, code`);
  const viewer = viewerReq;
  if (flag == null) return ok({ flag: null, cells, people: [], points, viewer });
  const r = await reviewFlag(flag);
  return ok({ flag, cells, points, viewer, ...r });
});

export const POST = handle(async (req: Request) => {
  // PIN (Admin/Safety) ก็ใช้ได้ ไม่งั้นต้องเป็นบัญชีที่เข้าสู่ระบบ
  const viewer = await viewerOf(req);
  if (viewer === "anon") return fail("ต้องเข้าสู่ระบบก่อนตรวจทานธง", 401);
  const s = await requireUser(req).catch(() => null);
  const b = await req.json();
  const by = s ? `${s.name} (${s.code})` : String(b.by ?? "").trim() || "Admin (PIN)";
  switch (b.action) {
    case "attend":
      await setAttendance(`emp:${b.emp_id}`, !!b.here, by);
      break;
    case "edit":
      await editPerson(String(b.emp_id), {
        // คนที่ไม่ได้เข้าสู่ระบบไม่เห็นเบอร์เดิม จึงไม่ให้เขียนทับเบอร์โทร
        first_name: b.first_name, last_name: b.last_name, gender: b.gender, tel: b.tel, role: b.role,
        cost_center: b.cost_center, area: b.area, flag_no: normFlag(b.flag_no) ?? undefined,
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
      const id = await addPlanPerson({ ...b, flag_no: normFlag(b.flag_no) ?? "" }, by);
      await touchPlan();
      return ok({ emp_id: id });
    }
    case "reviewed":
      await markReviewed(normFlag(b.flag) ?? "", by);
      break;
    default:
      return fail("ไม่รู้จักคำสั่ง");
  }
  return ok({ ok: true });
});
