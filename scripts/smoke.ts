import xlsx from "xlsx";
import { parsePlanWorkbook, mergePlan } from "../lib/parsers.ts";
const { utils } = xlsx;
const B = process.env.BASE_URL ?? "http://localhost:3000";
const j = async (path: string, init?: any) => {
  const r = await fetch(B + path, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.json ? JSON.stringify(init.json) : undefined });
  const d = await r.json(); if (!r.ok) throw new Error(path + " " + JSON.stringify(d)); return d;
};
// ไฟล์จำลอง 3 แผนก 3 ธง (ข้อมูลปลอม)
const files = [[1, "Sort", 8], [2, "Conveyor Online", 6], [3, "Canteen", 5]].map(([flag, area, n]: any) => {
  const wb = utils.book_new();
  const rows: any[] = [["หัวกระดาษ"], ["แผนก"], [], ["จุดรวมพล","เบอร์ธงอพยพใหม่","เบอร์ธงอพยพเดิม","รหัสพนักงาน","คำนำหน้า","ชื่อ-นามสกุล","เพศ","Cost Center","แผนก/พื้นที่","บทบาทหน้าที่"]];
  for (let i = 0; i < n; i++) rows.push([1, flag, flag + 8, 30000000 + flag * 100 + i, `ชื่อ${flag}-${i}`, `สกุล${i}`, i % 2 ? "หญิง" : "ชาย", 82000, area, i === 0 ? "ผู้นำธงอพยพ" : "ผู้อพยพ"]);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), "แบบฟอร์มสำรวจรายชื่อ");
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["จุดรวมพล","เบอร์ธงอพยพ","เบอร์ธงเดิม","ผู้นำธงอพยพ","Cost Center","แผนก/พื้นที่","หมายเหตุ"],[1,1,9,"คุณหัวหน้า หนึ่ง",82210,"Sort",""],[1,2,10,"คุณหัวหน้า สอง",82652,"Conveyor Online",""],[1,3,12,"คุณหัวหน้า สาม",999999,"Canteen",""]]), "รายชื่อผู้นำธง");
  return parsePlanWorkbook(xlsx.read(xlsx.write(wb, { type: "buffer", bookType: "xlsx" })), `${flag}.${area}.xlsx`);
});
const m = mergePlan(files);
console.log("parsed", m.people.length, "leaders", m.leaders.length, "issues", m.issues.length);
console.log("plan save", await j("/api/plan", { method: "POST", json: { people: m.people, leaders: m.leaders } }));

const now = Date.now(), h = 3600e3;
const ci = (email: string, site: string, at: number, name = "Test") => j("/api/sources/div/test", { method: "POST", json: { email, name, gender: "female", site, at: new Date(at).toISOString() } });
await ci("a@central.co.th", "SCDC", now - 2 * h, "A in");                 // อยู่ข้างใน, จับคู่กับ 30000101
await ci("b@central.co.th", "SCDC", now - 5 * h, "B out");
await ci("b@central.co.th", "SCDC", now - 1 * h, "B out");                // ออกแล้ว
await ci("c@central.co.th", "SCDC", now - 15 * h, "C auto");              // ออกอัตโนมัติ
await ci("d@central.co.th", "SCDC", now - 30 * 60e3, "D visitor");        // อยู่ข้างใน ไม่จับคู่ → ไม่ระบุธง
await ci("d@central.co.th", "SCDC", now - 27 * 60e3, "D visitor");        // กดซ้ำใน 10 นาที
await ci("e@central.co.th", "PWB", now - 1 * h, "E other site");          // ไซต์อื่น
console.log("links", await j("/api/links", { method: "POST", json: { rows: [{ email: "a@central.co.th", emp_id: "30000101" }, { email: "b@central.co.th", emp_id: "30000102" }] } }));

const { id } = await j("/api/incidents", { method: "POST", json: { mode: "drill", divSites: ["SCDC"], includePlan: true } });
let s = await j(`/api/incidents/${id}`);
const byKey = (k: string) => s.people.find((p: any) => p.person_key === k);
console.log("incident", id, "people", s.people.length, "(expect 19 plan + 1 visitor = 20)");
console.log("A presence", byKey("emp:30000101").presence, byKey("emp:30000101").presence_site);
console.log("B presence", byKey("emp:30000102").presence, "(expect plan: ออกแล้ว)");
console.log("D unmatched", !!byKey("div:d@central.co.th"), "E other site absent:", !byKey("div:e@central.co.th"));

await j(`/api/incidents/${id}/people`, { method: "PATCH", json: { person_key: "emp:30000101", status: "safe", by: "tester" } });
// คนใหม่เช็กอินหลังเปิดเคส → refresh ต้องเพิ่มเข้า และห้ามทับสถานะเดิม
await ci("f@central.co.th", "SCDC", now - 60e3, "F late");
const r = await j(`/api/incidents/${id}/refresh`, { method: "POST" });
s = await j(`/api/incidents/${id}`);
console.log("refresh added", r.added, "(expect 1)", "A still safe:", byKey("emp:30000101").status === "safe");
await j(`/api/incidents/${id}/people`, { method: "POST", json: { name: "ผู้รับเหมา ทดสอบ", flag_no: 2, gender: "ชาย", by: "tester" } });
s = await j(`/api/incidents/${id}`);
for (const p of s.people) if (p.status === "pending") await j(`/api/incidents/${id}/people`, { method: "PATCH", json: { person_key: p.person_key, status: p.person_key.startsWith("emp:301") ? "absent" : "safe", by: "tester" } });
s = await j(`/api/incidents/${id}`);
console.log("all counted, first_full_at set:", !!s.incident.first_full_at, "total", s.people.length);
const fl = await j(`/api/incidents/${id}?flag=2`);
console.log("flag 2 people", fl.people.length, "(expect 6 + 1 manual = 7)");
await j(`/api/incidents/${id}`, { method: "PATCH", json: { action: "close" } });
try { await j(`/api/incidents/${id}/people`, { method: "PATCH", json: { person_key: "emp:30000101", status: "pending" } }); console.log("FAIL: closed accepted"); } catch { console.log("closed incident rejects changes: ok"); }
console.log("list", (await j("/api/incidents")).incidents.map((i: any) => [i.id, i.mode, i.total, i.pending]));
console.log("sources", (await j("/api/sources")).states.map((x: any) => [x.key, !!x.last_ok_at, x.last_error]));
console.log("graph sync (unconfigured)", await j("/api/sources/div/sync", { method: "POST" }));
