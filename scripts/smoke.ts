// ทดสอบทั้งระบบด้วยข้อมูลปลอม — ใช้กับฐานข้อมูลทดสอบเท่านั้น
// BASE_URL=http://localhost:3000 ADMIN_PIN=1234 node --experimental-strip-types scripts/smoke.ts
import xlsx from "xlsx";
import { parsePlanWorkbook, mergePlan } from "../lib/parsers.ts";

const { utils } = xlsx;
const B = process.env.BASE_URL ?? "http://localhost:3000";
let token = "";
const j = async (path: string, init: { method?: string; json?: unknown; tok?: string } = {}) => {
  const r = await fetch(B + path, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init.tok ?? token ? { "x-admin-token": init.tok ?? token } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Object.assign(new Error(`${path} ${r.status} ${JSON.stringify(d)}`), { status: r.status, data: d });
  return d;
};
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
};
const fails = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };

// ---------- ไฟล์ธงจำลอง 3 แผนก 3 ธง 2 จุดรวมพล ----------
const files = [[1, "1", "Sort", 6], [2, "1", "Conveyor", 5], [3, "2", "Canteen", 4]].map(([flag, ap, area, n]: any) => {
  const wb = utils.book_new();
  const rows: any[] = [["หัวกระดาษ"], ["แผนก"], [], ["จุดรวมพล", "เบอร์ธงอพยพใหม่", "เบอร์ธงอพยพเดิม", "รหัสพนักงาน", "คำนำหน้า", "ชื่อ-นามสกุล", "เพศ", "Cost Center", "แผนก/พื้นที่", "บทบาทหน้าที่"]];
  for (let i = 0; i < n; i++) rows.push([ap, flag, flag + 8, 30000000 + flag * 100 + i, `ชื่อ${flag}-${i}`, `สกุล${i}`, i % 2 ? "หญิง" : "ชาย", 82000 + flag, area, i === 0 ? "ผู้นำธงอพยพ" : "ผู้อพยพ"]);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), "แบบฟอร์มสำรวจรายชื่อ");
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["จุดรวมพล", "เบอร์ธงอพยพ", "เบอร์ธงเดิม", "ผู้นำธงอพยพ", "Cost Center", "แผนก/พื้นที่", "หมายเหตุ"],
    [1, 1, 9, "คุณหัวหน้า หนึ่ง", 82001, "Sort", ""], [1, 2, 10, "คุณหัวหน้า สอง", 82002, "Conveyor", ""], [2, 3, 11, "คุณหัวหน้า สาม", 82003, "Canteen", ""]]), "รายชื่อผู้นำธง");
  return parsePlanWorkbook(xlsx.read(xlsx.write(wb, { type: "buffer", bookType: "xlsx" })), `${flag}.${area}.xlsx`);
});
const plan = mergePlan(files);

// ---------- รหัส ----------
ok(await fails(j("/api/auth", { method: "POST", json: { pin: "0000" } })), "รหัสผิดถูกปฏิเสธ");
token = (await j("/api/auth", { method: "POST", json: { pin: process.env.ADMIN_PIN ?? "1234" } })).token;
ok(!!token, "ADMIN_PIN เข้าได้");
ok(await fails(j("/api/plan", { method: "POST", json: { people: plan.people }, tok: "x.y" })), "นำเข้าแผนโดยไม่มีรหัสถูกปฏิเสธ");

// ---------- ตั้งค่า ----------
const imp = await j("/api/plan", { method: "POST", json: { people: plan.people, leaders: plan.leaders, files: 3 } });
ok(imp.saved === 15 && imp.version >= 1, `นำเข้า 15 คน เป็นชุดธง v${imp.version}`);
await j("/api/admin/confirmers", { method: "POST", json: { name: "Safety ทดสอบ", role: "safety", pin: "5678" } });
const safety = (await j("/api/auth", { method: "POST", json: { pin: "5678" } })).token;
ok(!!safety, "Safety Officer ใส่รหัสได้");
ok(await fails(j("/api/admin/confirmers", { tok: safety })), "Safety เข้าหน้าตั้งค่าผู้ยืนยันไม่ได้");
await j("/api/admin/points", { method: "POST", json: { code: "1", name: "จุดรวมพล 1 ลานหน้า", backup: "2" } });
await j("/api/admin/points", { method: "POST", json: { code: "2", name: "จุดรวมพล 2 ลานหลัง", backup: "1" } });

// ---------- ตรวจทานธง ----------
await j("/api/review", { method: "POST", json: { action: "attend", emp_id: "30000101", here: false, by: "ผู้ตรวจ" } });
await j("/api/review", { method: "POST", json: { action: "edit", emp_id: "30000102", flag_no: 2, by: "ผู้ตรวจ" } });
await j("/api/review", { method: "POST", json: { action: "remove", emp_id: "30000103", reason: "ลาออกแล้ว", by: "ผู้ตรวจ" } });
ok(await fails(j("/api/review", { method: "POST", json: { action: "remove", emp_id: "30000104", reason: "" } })), "ลบโดยไม่ใส่หมายเหตุถูกปฏิเสธ");
const added = await j("/api/review", { method: "POST", json: { action: "add", first_name: "คนเพิ่ม", flag_no: 3, gender: "หญิง", by: "ผู้ตรวจ" } });
await j("/api/review", { method: "POST", json: { action: "reviewed", flag: 1, by: "ผู้ตรวจ" } });
const r1 = await j("/api/review?flag=1");
ok(r1.people.filter((p: any) => !p.removed).length === 4 && r1.review?.reviewed_by === "ผู้ตรวจ", "ธง 1 เหลือ 4 คน และบันทึกผู้ตรวจ");
const ov = await j("/api/plan");
ok(ov.accuracy.moved === 1 && ov.accuracy.removed === 1 && ov.accuracy.added === 1 && ov.accuracy.unchanged === 13, `ความแม่นยำ ${ov.accuracy.pct}% (ย้าย 1 ลบ 1 เพิ่ม 1)`);
const v2 = await j("/api/admin/versions", { method: "POST", json: { action: "save" } });
ok(v2.version === imp.version + 1, `บันทึกเป็นชุดธง v${v2.version}`);

// ---------- ซ้อม ----------
const pre = (await j("/api/incidents")).current;
if (pre?.state === "active") await j(`/api/incidents/${pre.id}`, { method: "POST", json: { action: "close" } });
if (pre?.state === "pending") await j(`/api/incidents/${pre.id}`, { method: "POST", json: { action: "cancel" } });
const { id: drill } = await j("/api/incidents", { method: "POST", json: { action: "drill" } });
let s = await j(`/api/incidents/${drill}`);
const P = (k: string) => s.people.find((p: any) => p.person_key === k);
ok(P("emp:30000101")?.status === "abs", "คนที่ไม่มา = ปลอดภัยตามระบบ");
ok(!P("emp:30000103"), "คนที่ลบออกไม่เข้า snapshot");
ok(P(`emp:${added.emp_id}`)?.status === "unk", "คนที่เพิ่มเองเข้า snapshot");
ok(P("emp:30000102")?.flag_no === 2, "คนที่ย้ายธงอยู่ธงใหม่");
ok(await fails(j(`/api/incidents/${drill}/roll`, { method: "POST", json: { flag: 1, safe: ["emp:30000100", "emp:30000104", "emp:30000105"], count: 5, by: "ผู้นำธง" } })), "เช็คชื่อทั้งธงจำนวนไม่ตรงถูกปฏิเสธ");
await j(`/api/incidents/${drill}/roll`, { method: "POST", json: { flag: 1, safe: ["emp:30000100", "emp:30000104"], inj: ["emp:30000105"], count: 3, by: "ผู้นำธง" } });
s = await j(`/api/incidents/${drill}`);
ok(P("emp:30000100")?.status === "safe" && P("emp:30000105")?.status === "inj", "เช็คชื่อทั้งธง: ติ๊ก = ปลอดภัย / บาดเจ็บ");
ok(P("emp:30000101")?.status === "abs", "ไม่ติ๊ก = คงสถานะเดิม");
ok(await fails(j(`/api/incidents/${drill}/injury`, { method: "PATCH", json: { person_key: "emp:30000105", triage: "red" }, tok: "bad" })), "ระบุผู้บาดเจ็บโดยไม่มีรหัสถูกปฏิเสธ");
await j(`/api/incidents/${drill}/injury`, { method: "PATCH", json: { person_key: "emp:30000105", triage: "yellow", symptoms: "ข้อเท้าพลิก", hospital: "ปฐมพยาบาลที่จุดรวมพล" }, tok: safety });
for (const p of s.people) {
  if (p.status === "unk") await j(`/api/incidents/${drill}/people`, { method: "PATCH", json: { person_key: p.person_key, status: "safe", by: "ทดสอบ" } });
}
await j(`/api/incidents/${drill}/people`, { method: "PATCH", json: { person_key: "emp:30000201", status: "cmd", by: "ทดสอบ" } });
s = await j(`/api/incidents/${drill}`);
ok(!!s.incident.first_full_at, "นับครบ: บันทึกเวลา");
ok(P("emp:30000105").triage === "yellow" && P("emp:30000105").symptoms === "ข้อเท้าพลิก", "Safety ระบุระดับเหลือง + อาการ");
const codes = (await j("/api/admin/codes")).codes;
await j(`/api/incidents/${drill}/announce`, { method: "POST", json: { code_id: codes[0].id }, tok: safety });
s = await j(`/api/incidents/${drill}`);
ok(s.announcements.length === 1 && s.announcements[0].label === "Code 500", "บันทึกประกาศ Code 500");
ok(await fails(j("/api/incidents", { method: "POST", json: { action: "drill" } })), "เริ่มซ้อมซ้อนไม่ได้");
const closeRes = await j(`/api/incidents/${drill}`, { method: "POST", json: { action: "close" }, tok: safety });
ok(closeRes.absPending === 1, "ปิดการซ้อมได้ และเตือนปลอดภัยตามระบบที่รอยืนยัน 1 คน");
ok(await fails(j(`/api/incidents/${drill}/people`, { method: "PATCH", json: { person_key: "emp:30000101", status: "safe" } })), "เหตุการณ์ปิดแล้วแก้ไม่ได้");

// ---------- เหตุจริง: แจ้ง → ยืนยัน ----------
ok(await fails(j("/api/incidents", { method: "POST", json: { action: "report", kind: "ไฟไหม้" } })), "แจ้งเหตุโดยไม่ระบุตัวตนถูกปฏิเสธ");
// ---------- บัญชี: ยังไม่มี → ลงทะเบียน → เข้าสู่ระบบ ----------
const need = await j("/api/login", { method: "POST", json: { code: "30000100" } }).catch((e) => e);
ok(need.status === 404 && need.data?.needRegister && need.data.inPlan, "ยังไม่มีบัญชี ระบบให้ลงทะเบียน");
ok(need.data?.prefill?.first_name === "ชื่อ1-0" && need.data.prefill.cost_center === "82001", "เติมชื่อ / Cost Center จากชุดธงให้");
const ccs = await j("/api/cost-centers?q=8200");
ok(ccs.items.length === 3, "master Cost Center ตั้งต้นจากชุดธง ค้นหาได้");
const PW = "1234";
const reg = { password: PW, code: "30000100", prefix: "นาย", first_name: "ชื่อ1-0", last_name: "สกุล0", cost_center: "82001",
  email: "user100@central.co.th", tel: "081-111-2222", gender: "ชาย", emer_name: "คุณแม่", emer_tel: "0899999999", consent: true, blood: "O" };
ok(await fails(j("/api/register", { method: "POST", json: { ...reg, email: "user100@gmail.com" } })), "อีเมลที่ไม่ใช่ @central.co.th ถูกปฏิเสธ");
ok(await fails(j("/api/register", { method: "POST", json: { ...reg, last_name: "" } })), "ข้อมูลไม่ครบถูกปฏิเสธ");
ok(await fails(j("/api/register", { method: "POST", json: { ...reg, cost_center: "NOPE" } })), "Cost Center ที่ไม่มีใน master ถูกปฏิเสธ");
ok(await fails(j("/api/register", { method: "POST", json: { ...reg, password: "" } })), "ไม่ใส่รหัสผ่านถูกปฏิเสธ");
const user = await j("/api/register", { method: "POST", json: reg });
ok(user.name === "ชื่อ1-0 สกุล0", "ลงทะเบียนสำเร็จ");
ok(await fails(j("/api/register", { method: "POST", json: reg })), "ลงทะเบียนซ้ำไม่ได้");
ok(!!user.token && user.role === "user", "ลงทะเบียนแล้วได้ token บทบาทผู้ใช้ทั่วไป");
ok((await j("/api/login", { method: "POST", json: { code: "30000100" } })).next === "password", "รหัสที่มีบัญชีแล้ว ขั้นต่อไปคือรหัสผ่าน");
ok(await fails(j("/api/login", { method: "POST", json: { code: "30000100", password: "wrong123" } })), "รหัสผ่านผิดถูกปฏิเสธ");
const relog = await j("/api/login", { method: "POST", json: { code: "30000100", password: PW } });
ok(relog.name === "ชื่อ1-0 สกุล0" && !!relog.token, "เข้าสู่ระบบด้วยรหัสพนักงาน + รหัสผ่าน");
ok(await fails(j("/api/admin/users", { tok: relog.token })), "ผู้ใช้ทั่วไปเข้าหน้าจัดการผู้ใช้ไม่ได้");
// Admin ปรับบทบาท / รีเซ็ตรหัสผ่าน
const ul = await j("/api/admin/users?q=30000100");
ok(ul.users.length === 1 && ul.users[0].has_password && !("password_hash" in ul.users[0]), "Admin เห็นรายชื่อผู้ใช้ แต่ไม่เห็นรหัสผ่าน");
await j("/api/admin/users", { method: "POST", json: { action: "role", code: "30000100", role: "safety" } });
ok((await j("/api/account", { tok: relog.token })).role === "safety", "Admin ปรับเป็น Safety แล้วมีผลทันที");
ok(await fails(j("/api/admin/users", { tok: relog.token })), "Safety ยังเข้าหน้าจัดการผู้ใช้ไม่ได้");
const rs = await j("/api/admin/users", { method: "POST", json: { action: "reset", code: "30000100" } });
ok(typeof rs.temp === "string" && rs.temp.length >= 10, "Admin รีเซ็ตได้รหัสชั่วคราว");
ok(await fails(j("/api/account", { tok: relog.token })), "รีเซ็ตแล้ว token เก่าใช้ไม่ได้");
const tmpLogin = await j("/api/login", { method: "POST", json: { code: "30000100", password: rs.temp } });
ok(tmpLogin.mustChange === true, "เข้าด้วยรหัสชั่วคราวแล้วต้องเปลี่ยนรหัส");
ok(await fails(j("/api/admin/confirmers", { tok: tmpLogin.token })), "ระหว่างใช้รหัสชั่วคราวไม่มีสิทธิ์ Safety/Admin");
const changed = await j("/api/account", { method: "POST", json: { old: rs.temp, password: PW + "x" }, tok: tmpLogin.token });
ok(changed.mustChange === false && changed.role === "safety", "ตั้งรหัสใหม่แล้วกลับมามีสิทธิ์ตามบทบาท");
await j("/api/admin/users", { method: "POST", json: { action: "role", code: "30000100", role: "user" } });
const user2 = await j("/api/login", { method: "POST", json: { code: "30000100", password: PW + "x" } });
ok(await fails(j("/api/register", { method: "POST", json: { ...reg, code: "30000101" } })), "อีเมลซ้ำกับคนอื่นถูกปฏิเสธ");
const ccAdd = await j("/api/cost-centers", { method: "POST", json: { code: "x9001", name: "แผนกใหม่", by: "99999999" } });
ok(ccAdd.item.code === "X9001" && ccAdd.item.source === "user", "ผู้ใช้เพิ่ม Cost Center ใหม่ได้");
const outsider = await j("/api/register", { method: "POST", json: { ...reg, code: "99999999", email: "new@central.co.th", cost_center: "X9001", consent: false } });
ok(outsider.code === "99999999", "คนที่ไม่อยู่ในชุดธงลงทะเบียนได้");
ok(await fails(j("/api/profile", { tok: "" })), "ดูโปรไฟล์ต้องเข้าสู่ระบบ");
const pf = await j("/api/profile", { tok: user2.token });
ok(pf.profile.email === "user100@central.co.th" && pf.cost_center?.code === "82001" && pf.profile.blood === "O", "โปรไฟล์อ่านข้อมูลที่ลงทะเบียนได้");
const { id: rep } = await j("/api/incidents", { method: "POST", json: { action: "report", kind: "ไฟไหม้", area: "Sort", by: user.name }, tok: user2.token });
let cur = await j("/api/incidents");
ok(cur.current.id === rep && cur.current.state === "pending", "แจ้งเหตุแล้ว รอยืนยัน");
await j(`/api/incidents/${rep}`, { method: "POST", json: { action: "cancel", by: user.name } });
ok((await j("/api/incidents")).current === null, "ยกเลิกการแจ้งได้");
const { id: real } = await j("/api/incidents", { method: "POST", json: { action: "report", kind: "ไฟไหม้", area: "Sort" }, tok: user2.token });
ok(await fails(j(`/api/incidents/${real}`, { method: "POST", json: { action: "confirm" }, tok: "bad" })), "ยืนยันโดยไม่มีรหัสถูกปฏิเสธ");
await j(`/api/incidents/${real}`, { method: "POST", json: { action: "confirm", closedPoints: ["1"] }, tok: safety });
s = await j(`/api/incidents/${real}`);
ok(s.incident.state === "active" && s.incident.closed_points?.[0] === "1" && s.incident.confirmed_by === "Safety ทดสอบ", "ยืนยันเหตุจริง ปิดจุดรวมพล 1");
ok(s.people.length >= 15 && P("emp:30000100")?.emer === "คุณแม่ · 0899999999", "snapshot + ผู้ติดต่อฉุกเฉินจากโปรไฟล์");
ok(new Set(s.people.map((p: any) => p.cost_center)).size >= 3, "มี Cost Center ให้กรองในเหตุจริง");
ok(await fails(j(`/api/incidents/${real}/roll`, { method: "POST", json: { flag: 1, safe: [], count: 0 } })), "เช็คชื่อทั้งธงใช้ไม่ได้ในเหตุจริง");
await j(`/api/incidents/${real}/people`, { method: "PATCH", json: { person_key: "emp:30000100", status: "inj", by: "ผู้นำธง" } });
const bl = await j(`/api/incidents/${real}/injury`, { tok: safety });
ok(bl.blood["emp:30000100"] === "O", "Safety เห็นกรุ๊ปเลือดของผู้บาดเจ็บที่ยินยอม");
ok(!JSON.stringify(s.people).includes('"blood"'), "หน้าทั่วไปไม่ได้รับข้อมูลกรุ๊ปเลือด");
const add2 = await j(`/api/incidents/${real}/people`, { method: "POST", json: { name: "ผู้รับเหมา", by: "ผู้นำธง" } });
ok(!!add2.person_key, "เพิ่มคนนอกรายชื่อระหว่างเหตุ");
await j(`/api/incidents/${real}`, { method: "POST", json: { action: "close" }, tok: token });

// ---------- Outsource (Power Automate → /api/ingest/outsource) ----------
const ING = process.env.INGEST_TOKEN ?? "tok123";
const post = (body: unknown, tok = ING) => fetch(B + "/api/ingest/outsource", { method: "POST", headers: { "Content-Type": "application/json", "x-sync-token": tok }, body: JSON.stringify(body) });
ok((await post({ ID: 1 }, "bad")).status === 401, "Outsource: token ผิดถูกปฏิเสธ");
const nowIso = new Date(Date.now() - 2 * 3600e3).toISOString();
ok((await (await post({ kind: "staff", records: [{ field_1: "OS900", field_2: "82002", field_3: "สมใจ", field_4: "รับจ้าง" }] })).json()).saved === 1, "Outsource: รับรายชื่อจาก DC_FTE");
ok((await (await post({ ID: 77, Title: "OS900", Clock_in: nowIso, Clock_out: null, Site: { Value: "SCDC" } })).json()).saved === 1, "Outsource: รับแถวเข้างาน");
ok((await (await post({ ID: 78, Title: "OS901", Clock_in: nowIso, Clock_out: new Date().toISOString() })).json()).saved === 1, "Outsource: รับแถวที่ออกแล้ว");
const { id: drill2 } = await j("/api/incidents", { method: "POST", json: { action: "drill" } });
const sd = await j(`/api/incidents/${drill2}`);
const osp = sd.people.find((p: any) => p.person_key === "os:OS900");
ok(osp?.name === "สมใจ รับจ้าง" && osp.cost_center === "82002" && osp.presence_site === "SCDC", "Outsource ที่ยังไม่ออกเข้าไปอยู่ในรายชื่อเหตุการณ์ พร้อมชื่อและ Cost Center");
ok(!sd.people.some((p: any) => p.person_key === "os:OS901"), "Outsource ที่ Clock out แล้วไม่ถูกนับ");
await j(`/api/incidents/${drill2}`, { method: "POST", json: { action: "close" }, tok: token });
const src = await j("/api/sources");
ok(src.outsource.present === 1 && src.outsource.staff === 1, "หน้าแหล่งข้อมูลเห็น Outsource ในพื้นที่ 1 คน");

// ---------- Maintain ----------
ok(await fails(j("/api/maintain", { tok: "bad" })), "Maintain: ต้องใช้รหัส Admin");
const mt = await j("/api/maintain", { method: "POST" });
ok(Array.isArray(mt.steps) && mt.steps.some((x: any) => x.key === "driver") && typeof mt.pull_ms === "number", "Maintain: ดึงทุกแหล่ง จับเวลารายแหล่ง");
const osIn = mt.report.people.find((p: any) => p.source === "outsource" && p.key === "OS900");
const osOut = mt.report.people.find((p: any) => p.source === "outsource" && p.key === "OS901");
ok(osIn?.verdict === "in" && osOut?.verdict === "out", "Maintain: ตรวจ Outsource อยู่/ไม่อยู่ถูกต้อง");
ok(mt.report.summary.outsource.in === 1, "Maintain: สรุปจำนวนรายแหล่ง");

// ---------- ข้อมูลที่ต้องเป็น Admin ----------
for (const p of ["/api/sources", "/api/links", "/api/sources/driver"]) ok(await fails(j(p, { tok: "x" })), `${p} ไม่มีรหัส = ปฏิเสธ`);
ok(await fails(j("/api/sources/div/test", { method: "POST", json: {}, tok: "x" })), "ทดสอบ DIV ต้องเป็น Admin");
const pub = await j("/api/plan", { tok: "x" });
ok(Array.isArray(pub.flags) && !pub.leaders && !pub.versions, "/api/plan สาธารณะไม่มีชื่อผู้นำธง/เวอร์ชัน");

const inA = await j(`/api/incidents/${drill}`, { tok: "x" });
const inS = await j(`/api/incidents/${drill}`);
ok(inA.viewer === "anon" && inA.people.every((p: any) => p.tel == null && p.emer == null && p.email == null && p.symptoms == null), "ไม่ได้เข้าสู่ระบบ: ไม่เห็นเบอร์โทร ผู้ติดต่อฉุกเฉิน อีเมล อาการ");
ok(inS.viewer === "staff" && inS.people.some((p: any) => p.tel || p.emer || p.email), "Admin เห็นเบอร์โทร/ผู้ติดต่อฉุกเฉินตามปกติ");
const rvA = await j("/api/review", { tok: "x" });
ok(rvA.viewer === "anon" && rvA.people.every((p: any) => p.tel == null), "หน้าตรวจทานธง: ไม่ได้เข้าสู่ระบบไม่เห็นเบอร์โทร");

// ---------- ตั้งค่า › ชุดธง: เพิ่ม/แก้ ธงและคน ----------
await j("/api/admin/flags", { method: "POST", json: { action: "flag-add", flag_no: 40, leader_name: "คุณทดสอบ ธงใหม่", area: "MZ9", assembly_point: "2", flag_no_old: 99 } });
ok(await fails(j("/api/admin/flags", { method: "POST", json: { action: "flag-add", flag_no: 40 } })), "เพิ่มธงซ้ำไม่ได้");
let fo = await j("/api/plan");
ok(fo.flags.some((f: any) => f.flag_no === 40 && f.people === 0 && f.area === "MZ9"), "ธงใหม่ที่ยังไม่มีคนแสดงในรายการ");
await j("/api/admin/flags", { method: "POST", json: { action: "person-add", flag_no: 40, emp_id: "knn250593", prefix: "นางสาว", first_name: "ยาวียะ", last_name: "หามะ", gender: "หญิง", role: "ผู้นำธงอพยพ" } });
ok(await fails(j("/api/admin/flags", { method: "POST", json: { action: "person-add", flag_no: 40, emp_id: "KNN250593", first_name: "ซ้ำ" } })), "เพิ่มรหัสซ้ำไม่ได้");
let fd = await j("/api/admin/flags?flag=40");
ok(fd.people[0]?.emp_id === "KNN250593" && fd.people[0].assembly_point === "2" && fd.people[0].role === "ผู้นำธงอพยพ", "เพิ่มคน Outsource เข้าธง ได้จุดรวมพลของธง");
await j("/api/admin/flags", { method: "POST", json: { action: "person-edit", emp_id: "KNN250593", first_name: "ยาวียะห์", role: "ผู้อพยพ", tel: "0812345678" } });
fd = await j("/api/admin/flags?flag=40");
ok(fd.people[0].first_name === "ยาวียะห์" && fd.people[0].role === "ผู้อพยพ" && fd.people[0].tel === "0812345678", "แก้ชื่อ บทบาท เบอร์โทร");
await j("/api/admin/flags", { method: "POST", json: { action: "flag-save", flag_no: 40, leader_name: "คุณทดสอบ ธงใหม่", area: "MZ9", assembly_point: "1" } });
fd = await j("/api/admin/flags?flag=40");
ok(fd.people[0].assembly_point === "1", "เปลี่ยนจุดรวมพลของธง คนในธงย้ายตาม");
ok(await fails(j("/api/admin/flags", { method: "POST", json: { action: "flag-delete", flag_no: 40 } })), "ลบธงที่ยังมีคนไม่ได้");
await j("/api/admin/flags", { method: "POST", json: { action: "person-remove", emp_id: "KNN250593", reason: "ย้ายสาขา" } });
await j("/api/admin/flags", { method: "POST", json: { action: "flag-delete", flag_no: 40 } });
fo = await j("/api/plan");
ok(!fo.flags.some((f: any) => f.flag_no === 40), "ลบธงว่างได้");
ok(await fails(j("/api/admin/flags", { method: "POST", json: { action: "flag-add", flag_no: 41 }, tok: "x" })), "แก้ชุดธงต้องเป็น Admin");

// ---------- ตั้งชื่อเวอร์ชัน ----------
const sv = await j("/api/admin/versions", { method: "POST", json: { action: "save", name: "ซ้อมใหญ่ ต.ค. 2569" } });
fo = await j("/api/plan");
ok(fo.versions[0].id === sv.version && fo.versions[0].name === "ซ้อมใหญ่ ต.ค. 2569", "บันทึกเวอร์ชันพร้อมชื่อ");
await j("/api/admin/versions", { method: "POST", json: { action: "rename", id: sv.version, name: "ชุดธง 2569" } });
fo = await j("/api/plan");
ok(fo.versions[0].name === "ชุดธง 2569", "แก้ชื่อเวอร์ชันได้");
ok(fo.version.active === sv.version && !fo.version.dirty, "เวอร์ชันที่บันทึกล่าสุดเป็นเวอร์ชันที่ใช้อยู่");
const nVers = fo.versions.length;
const vOld = fo.versions.find((v: any) => v.id !== sv.version)!.id;
ok(await fails(j("/api/admin/versions", { method: "POST", json: { action: "delete", id: sv.version } })), "ลบเวอร์ชันที่ใช้อยู่ไม่ได้");
await j("/api/admin/flags", { method: "POST", json: { action: "flag-add", flag_no: 50, area: "ทดสอบ" } });
fo = await j("/api/plan");
ok(fo.version.dirty, "แก้ชุดธงแล้วขึ้นว่ามีการแก้ที่ยังไม่บันทึก");
ok(await fails(j("/api/admin/versions", { method: "POST", json: { action: "overwrite", id: vOld } })), "บันทึกทับได้เฉพาะเวอร์ชันที่ใช้อยู่");
await j("/api/admin/versions", { method: "POST", json: { action: "overwrite", id: sv.version } });
fo = await j("/api/plan");
ok(!fo.version.dirty, "บันทึกทับแล้วไม่มีแก้ค้าง");
await j("/api/admin/versions", { method: "POST", json: { action: "activate", id: vOld } });
fo = await j("/api/plan");
ok(fo.version.active === vOld && fo.versions.length === nVers, "เลือกใช้เวอร์ชันเก่าโดยไม่สร้างเวอร์ชันใหม่");
ok(!fo.flags.some((f: any) => f.flag_no === 50), "เลือกใช้เวอร์ชันเก่าแล้วได้ชุดธงของเวอร์ชันนั้น");
await j("/api/admin/versions", { method: "POST", json: { action: "activate", id: sv.version } });
fo = await j("/api/plan");
ok(fo.flags.some((f: any) => f.flag_no === 50), "สลับกลับมาเวอร์ชันที่บันทึกทับไว้ ได้ธง 50 คืน");
const nBefore = fo.versions.length;
await j("/api/admin/versions", { method: "POST", json: { action: "delete", id: vOld } });
fo = await j("/api/plan");
ok(fo.versions.length === nBefore - 1 && !fo.versions.some((v: any) => v.id === vOld), "ลบเวอร์ชันที่ไม่ได้ใช้ได้");

// ---------- บทบาท + แก้รหัสพนักงาน ----------
await j("/api/admin/flags", { method: "POST", json: { action: "person-add", flag_no: 2, emp_id: "ร้านค้าโรงอาหาร", first_name: "แม่ค้า", last_name: "ทดสอบ" } });
await j("/api/admin/flags", { method: "POST", json: { action: "person-edit", emp_id: "ร้านค้าโรงอาหาร", role: "ผู้ช่วยผู้นำธง" } });
let f2 = await j("/api/admin/flags?flag=2");
ok(f2.people.find((p: any) => p.emp_id === "ร้านค้าโรงอาหาร")?.role === "ผู้ช่วยผู้นำธง", "แก้บทบาทได้ (บทบาทอื่นนอกจากผู้นำ/ผู้อพยพ)");
ok(f2.leader?.leader_name !== "แม่ค้า ทดสอบ", "ผู้ช่วยผู้นำธงไม่ถูกตั้งเป็นผู้นำธง");
await j("/api/admin/flags", { method: "POST", json: { action: "person-edit", emp_id: "ร้านค้าโรงอาหาร", new_emp_id: "knn777777", role: "ผู้นำธงอพยพ" } });
f2 = await j("/api/admin/flags?flag=2");
ok(f2.people.some((p: any) => p.emp_id === "KNN777777") && !f2.people.some((p: any) => p.emp_id === "ร้านค้าโรงอาหาร"), "แก้รหัสพนักงานที่ผิดรูปแบบได้");
ok(f2.leader?.leader_name === "แม่ค้า ทดสอบ", "ตั้งเป็นผู้นำธงแล้ว ชื่อผู้นำธงของธงเปลี่ยนตาม");
ok(await fails(j("/api/admin/flags", { method: "POST", json: { action: "person-edit", emp_id: "KNN777777", new_emp_id: "30000200" } })), "แก้รหัสให้ซ้ำคนอื่นไม่ได้");
await j("/api/admin/flags", { method: "POST", json: { action: "person-remove", emp_id: "KNN777777", reason: "ทดสอบ" } });
await j("/api/admin/flags", { method: "POST", json: { action: "flag-save", flag_no: 2, leader_name: "คุณหัวหน้า สอง", area: "Conveyor", assembly_point: "1" } });

// ---------- จุดรวมพล: เพิ่ม แก้ ลบ (ย้ายธงไปจุดอื่น) ----------
await j("/api/admin/points", { method: "POST", json: { code: "9", name: "จุดทดสอบ", backup: null, sort: 9 } });
await j("/api/admin/points", { method: "POST", json: { code: "9", name: "จุดทดสอบ แก้ชื่อ", backup: "1", sort: 9 } });
fo = await j("/api/plan");
ok(fo.points.some((p: any) => p.code === "9" && p.name === "จุดทดสอบ แก้ชื่อ" && p.backup === "1"), "จุดรวมพล: เพิ่มและแก้ชื่อ/จุดสำรอง");
await j("/api/admin/flags", { method: "POST", json: { action: "flag-save", flag_no: 3, assembly_point: "9", leader_name: "คุณหัวหน้า สาม" } });
ok(await fails(j("/api/admin/points", { method: "POST", json: { action: "delete", code: "9" } })), "ลบจุดที่มีธงใช้อยู่ ต้องเลือกจุดย้ายก่อน");
await j("/api/admin/points", { method: "POST", json: { action: "delete", code: "9", move_to: "2" } });
fo = await j("/api/plan");
const f3 = await j("/api/admin/flags?flag=3");
ok(!fo.points.some((p: any) => p.code === "9") && f3.people.every((p: any) => p.assembly_point === "2"), "ลบจุดแล้วธงย้ายไปจุดที่เลือก");

// ---------- Code ประกาศ: เพิ่ม แก้ ลบ ----------
await j("/api/admin/codes", { method: "POST", json: { label: "Code ทดสอบ", meaning: "ก", tone: "warn" } });
let cd = (await j("/api/admin/codes")).codes.find((c: any) => c.label === "Code ทดสอบ");
await j("/api/admin/codes", { method: "POST", json: { id: cd.id, label: "Code ทดสอบ 2", meaning: "ข", tone: "err", closes: true } });
cd = (await j("/api/admin/codes")).codes.find((c: any) => c.id === cd.id);
ok(cd.label === "Code ทดสอบ 2" && cd.tone === "err" && cd.closes === true, "Code ประกาศ: แก้ชื่อ สี และใช้ปิดเหตุการณ์");
await j("/api/admin/codes", { method: "POST", json: { action: "delete", id: cd.id } });
ok(!(await j("/api/admin/codes")).codes.some((c: any) => c.id === cd.id), "Code ประกาศ: ลบได้");

// ---------- ลบธงที่มีคน: ย้ายคน / เอาคนออก ----------
await j("/api/admin/flags", { method: "POST", json: { action: "flag-add", flag_no: 60, area: "ย้ายทดสอบ" } });
await j("/api/admin/flags", { method: "POST", json: { action: "person-add", flag_no: 60, emp_id: "60000001", first_name: "ย้าย" } });
ok(await fails(j("/api/admin/flags", { method: "POST", json: { action: "flag-delete", flag_no: 60 } })), "ลบธงที่มีคน ต้องเลือกย้ายหรือเอาคนออก");
const dm = await j("/api/admin/flags", { method: "POST", json: { action: "flag-delete", flag_no: 60, move_to: 1 } });
const f1 = await j("/api/admin/flags?flag=1");
ok(dm.moved === 1 && f1.people.some((p: any) => p.emp_id === "60000001"), "ลบธงแล้วย้ายคนไปธงที่เลือก");
await j("/api/admin/flags", { method: "POST", json: { action: "flag-add", flag_no: 61 } });
await j("/api/admin/flags", { method: "POST", json: { action: "person-add", flag_no: 61, emp_id: "61000001", first_name: "ออก" } });
const dr = await j("/api/admin/flags", { method: "POST", json: { action: "flag-delete", flag_no: 61, remove_people: true } });
fo = await j("/api/plan");
ok(dr.removed === 1 && !fo.flags.some((f: any) => f.flag_no === 61), "ลบธงพร้อมเอาคนออกจากชุดธง");

for (const p of ["/", "/review", "/search", "/injury", "/profile", "/admin", "/dashboard", `/dashboard?id=${drill}`, "/sources"]) {
  const r = await fetch(B + p);
  ok(r.status === 200, `หน้า ${p} เปิดได้`);
}
