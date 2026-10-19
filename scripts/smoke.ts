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
  if (!r.ok) throw Object.assign(new Error(`${path} ${r.status} ${JSON.stringify(d)}`), { status: r.status });
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
const user = await j("/api/login", { method: "POST", json: { code: "30000100" } });
ok(user.name === "ชื่อ1-0 สกุล0", "เข้าสู่ระบบด้วยรหัสพนักงาน");
ok(await fails(j("/api/login", { method: "POST", json: { code: "99999999" } })), "รหัสที่ไม่มีในชุดธงถูกปฏิเสธ");
await j("/api/profile", { method: "POST", json: { code: "30000100", name: user.name, tel: "081-111-2222", emer_name: "คุณแม่", emer_tel: "089", consent: true, blood: "O" } });
const { id: rep } = await j("/api/incidents", { method: "POST", json: { action: "report", kind: "ไฟไหม้", area: "Sort", by: user.name } });
let cur = await j("/api/incidents");
ok(cur.current.id === rep && cur.current.state === "pending", "แจ้งเหตุแล้ว รอยืนยัน");
await j(`/api/incidents/${rep}`, { method: "POST", json: { action: "cancel", by: user.name } });
ok((await j("/api/incidents")).current === null, "ยกเลิกการแจ้งได้");
const { id: real } = await j("/api/incidents", { method: "POST", json: { action: "report", kind: "ไฟไหม้", area: "Sort", by: user.name } });
ok(await fails(j(`/api/incidents/${real}`, { method: "POST", json: { action: "confirm" }, tok: "bad" })), "ยืนยันโดยไม่มีรหัสถูกปฏิเสธ");
await j(`/api/incidents/${real}`, { method: "POST", json: { action: "confirm", closedPoints: ["1"] }, tok: safety });
s = await j(`/api/incidents/${real}`);
ok(s.incident.state === "active" && s.incident.closed_points?.[0] === "1" && s.incident.confirmed_by === "Safety ทดสอบ", "ยืนยันเหตุจริง ปิดจุดรวมพล 1");
ok(s.people.length >= 15 && P("emp:30000100")?.emer === "คุณแม่ · 089", "snapshot + ผู้ติดต่อฉุกเฉินจากโปรไฟล์");
ok(new Set(s.people.map((p: any) => p.cost_center)).size >= 3, "มี Cost Center ให้กรองในเหตุจริง");
ok(await fails(j(`/api/incidents/${real}/roll`, { method: "POST", json: { flag: 1, safe: [], count: 0 } })), "เช็คชื่อทั้งธงใช้ไม่ได้ในเหตุจริง");
await j(`/api/incidents/${real}/people`, { method: "PATCH", json: { person_key: "emp:30000100", status: "inj", by: "ผู้นำธง" } });
const bl = await j(`/api/incidents/${real}/injury`, { tok: safety });
ok(bl.blood["emp:30000100"] === "O", "Safety เห็นกรุ๊ปเลือดของผู้บาดเจ็บที่ยินยอม");
ok(!JSON.stringify(s.people).includes('"blood"'), "หน้าทั่วไปไม่ได้รับข้อมูลกรุ๊ปเลือด");
const add2 = await j(`/api/incidents/${real}/people`, { method: "POST", json: { name: "ผู้รับเหมา", by: "ผู้นำธง" } });
ok(!!add2.person_key, "เพิ่มคนนอกรายชื่อระหว่างเหตุ");
await j(`/api/incidents/${real}`, { method: "POST", json: { action: "close" }, tok: token });

for (const p of ["/", "/review", "/search", "/injury", "/profile", "/admin", "/dashboard", `/dashboard?id=${drill}`, "/sources"]) {
  const r = await fetch(B + p);
  ok(r.status === 200, `หน้า ${p} เปิดได้`);
}
