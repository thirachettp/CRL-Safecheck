import { test } from "node:test";
import assert from "node:assert/strict";
import xlsx from "xlsx";
import { parsePlanWorkbook, mergePlan, parseFormWorkbook, excelSerialToIso } from "../lib/parsers.ts";

const { utils } = xlsx;

// จำลองโครงไฟล์จริง: หัวกระดาษ 3 แถว หัวตารางแถว 4 และชีตผู้นำธง
function planBook(rows: unknown[][], leaders: unknown[][] = []) {
  const wb = utils.book_new();
  const sheet = [
    ["", "", "", "รายชื่อพนักงานเข้าร่วมซ้อมแผนฉุกเฉิน.......... ประจำปี......"],
    ["", "", "", "แผนก........ Sort ........ ผู้นำธงอพยพ...... ทดสอบ"],
    [],
    ["จุดรวมพล", "เบอร์ธงอพยพใหม่", "เบอร์ธงอพยพเดิม", "รหัสพนักงาน", "คำนำหน้า", "ชื่อ-นามสกุล", "เพศ", "Cost Center", "แผนก/พื้นที่", "บทบาทหน้าที่"],
    ...rows,
  ];
  utils.book_append_sheet(wb, utils.aoa_to_sheet(sheet), "แบบฟอร์มสำรวจรายชื่อ");
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet([["จุดรวมพล", "เบอร์ธงอพยพ", "เบอร์ธงเดิม", "ผู้นำธงอพยพ", "Cost Center", "แผนก/พื้นที่", "หมายเหตุ"], ...leaders]),
    "รายชื่อผู้นำธง",
  );
  return wb;
}

test("อ่านไฟล์แผนอพยพตามโครงจริง", () => {
  const wb = planBook(
    [
      [1, 1, 9, 20000001, "สมชาย", "ทดสอบ", "ชาย", 82210, "Sort", "ผู้นำธงอพยพ"],
      [1, 1, 9, 20000002, "สมหญิง", "ตัวอย่าง", "หญิง", 82210, "Sort", "ผู้อพยพ"],
      [1, 1, 9, "", "", "", "", "", "", ""],
    ],
    [[1, 1, 9, "คุณสมชาย ทดสอบ", 82210, "Sort", ""], [1, 2, 10, "คุณเอ บี", 82652, "Conveyor Online", ""]],
  );
  const r = parsePlanWorkbook(wb, "1.Sort.xlsx");
  assert.equal(r.people.length, 2);
  assert.equal(r.people[0].first_name, "สมชาย");
  assert.equal(r.people[0].last_name, "ทดสอบ");
  assert.equal(r.people[0].flag_no, "1");
  assert.equal(r.people[1].gender, "หญิง");
  assert.equal(r.leaders.length, 0, "ไม่อ่านชีตรายชื่อผู้นำธง");
  const m = mergePlan([r]);
  assert.deepEqual(m.leaders.map((l) => [l.flag_no, l.leader_name]), [["1", "สมชาย ทดสอบ"]], "ผู้นำธงจากแถวข้อมูลเท่านั้น ธง 2 ในชีตผู้นำธงไม่ถูกสร้าง");
  assert.equal(r.issues.filter((i) => i.level === "error").length, 0);
});

test("คำนำหน้าจริง แยกชื่อ-นามสกุลจากช่องเดียว", () => {
  const wb = planBook([[1, 3, 12, 20000003, "นางสาว", "มาลี ใจดี", "หญิง", 1, "Canteen", "ผู้อพยพ"]]);
  const p = parsePlanWorkbook(wb, "3.xlsx").people[0];
  assert.deepEqual([p.prefix, p.first_name, p.last_name], ["นางสาว", "มาลี", "ใจดี"]);
});

test("ไฟล์ไม่มีหัวตาราง = error", () => {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["a", "b"]]), "x");
  assert.equal(parsePlanWorkbook(wb, "bad.xlsx").issues[0].level, "error");
});

test("คนซ้ำข้ามไฟล์คนละธง ถูกรายงาน", () => {
  const a = parsePlanWorkbook(planBook([[1, 1, 9, 20000001, "ก", "ข", "ชาย", 1, "A", "ผู้อพยพ"]]), "a.xlsx");
  const b = parsePlanWorkbook(planBook([[2, 17, 1, 20000001, "ก", "ข", "ชาย", 1, "B", "ผู้อพยพ"]]), "b.xlsx");
  const m = mergePlan([a, b]);
  assert.equal(m.people.length, 1);
  assert.equal(m.duplicates.length, 1);
  assert.ok(m.issues.some((i) => i.level === "warn" && i.message.includes("คนละธง")), "คนยังถูกนำเข้า = สีเหลือง");
});

test("วันที่ Excel เป็นเวลาไทย แปลงเป็น UTC", () => {
  // 6/9/2026 13:42 เวลาไทย = 06:42 UTC
  const serial = 46182 + (13 * 60 + 42) / 1440;
  assert.equal(excelSerialToIso(serial)?.slice(0, 16), "2026-06-09T06:42");
});

test("อ่าน Excel ของฟอร์ม", () => {
  const wb = utils.book_new();
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet([
      ["Id", "Start time", "Completion time", "Email", "Name", "Clock (In-Out)", "Gender"],
      [1, 46182.5, 46182.5, "A@central.co.th", "A B", "SCDC", "Female"],
      [2, 46182.6, 46182.6, "", "", "", ""],
    ]),
    "Sheet1",
  );
  const { rows } = parseFormWorkbook(wb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "a@central.co.th");
  assert.equal(rows[0].gender, "หญิง");
  assert.equal(rows[0].response_id, "1");
});

test("เพศจากตัวเลือก MS Form (Man / Female)", async () => {
  const { normalizeGender } = await import("../lib/parsers.ts");
  assert.equal(normalizeGender("Man"), "ชาย");
  assert.equal(normalizeGender("Female"), "หญิง");
});

test("ไฟล์ Template จริง: รหัส Outsource, ช่องธงใหม่ว่าง, ธงไม่ตรงชีตผู้นำธง", () => {
  const wb = planBook(
    [
      [1, 30, 29, 20014597, "นาง", "รัตนา โสดา", "หญิง", 82640, "MZ3 ฝั่ง WH", "ผู้นำธงอพยพ"],
      [1, 30, 29, 20074567, "นางสาว", "สีตอง พันธ์จันทร์ดี", "หญิง", 82640, "MZ3 ฝั่ง WH", "ผู้อพยพ"],
      [1, "", 29, 20054825, "นางสาว", "รัตนา ดำกลิ่น", "หญิง", 82640, "MZ3 ฝั่ง WH", "ผู้อพยพ"],
      [1, "", 29, "KNN250593", "นางสาว", "ยาวียะ หามะ", "หญิง", 82640, "MZ3 ฝั่ง WH", "ผู้อพยพ"],
      [1, "", 29, 20060579, "นาย", "ปราโมทย์ เมืองจันทร์", "หญิง", 82640, "MZ3 ฝั่ง WH", "ผู้อพยพ"],
    ],
    [[1, 14, 29, "คุณรัตนา โสดา", 82640, "MZ3 ฝั่ง WH", ""]],
  );
  const r = parsePlanWorkbook(wb, "t.xlsx");
  assert.equal(r.people.length, 5);
  assert.ok(r.people.every((p) => p.flag_no === "30"));
  assert.equal(r.people.find((p) => p.emp_id === "KNN250593")?.first_name, "ยาวียะ");
  assert.equal(r.leaders.length, 0, "ไม่อ่านชีตรายชื่อผู้นำธง");
  assert.ok(r.issues.some((i) => /3 คนไม่ได้กรอกเบอร์ธงใหม่/.test(i.message)));
  assert.ok(r.issues.some((i) => /คำนำหน้า "นาย" แต่เพศ "หญิง"/.test(i.message)));

  const m = mergePlan([r]);
  assert.ok(m.people.every((p) => p.flag_no === "30"), "เบอร์ธงยึดตามแถวข้อมูล");
  assert.ok(!m.issues.some((i) => i.level === "error"), "ไม่เทียบเบอร์ธงกับชีตผู้นำธง");
  const l30 = m.leaders.find((l) => l.flag_no === "30");
  assert.equal(l30?.leader_name, "รัตนา โสดา", "ผู้นำธงจากบทบาทในแถวข้อมูล");
  assert.equal(l30?.area, "MZ3 ฝั่ง WH");
  assert.equal(l30?.flag_no_old, "29");
  assert.deepEqual(m.leaders.map((l) => l.flag_no), ["30"], "มีแค่ธงจากแถวข้อมูล");
});

test("ไม่มีชีตผู้นำธง → ใช้คนที่บทบาทผู้นำธงเป็นผู้นำ", () => {
  const wb = planBook([[1, 5, 9, 20000001, "นาย", "สมชาย ทดสอบ", "ชาย", 1, "A", "ผู้นำธงอพยพ"]]);
  const m = mergePlan([parsePlanWorkbook(wb, "a.xlsx")]);
  assert.equal(m.leaders[0]?.flag_no, "5");
  assert.equal(m.leaders[0]?.leader_name, "สมชาย ทดสอบ");
});

test("หัวคอลัมน์สะกดผิด 'รหัสหนักงาน' ยังอ่านได้ และไฟล์ ~$ ถูกข้าม", async () => {
  const { isTempExcel, combinedRows } = await import("../lib/parsers.ts");
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["หัว"], ["แผนก"], [],
    ["จุดรวมพล", "เบอร์ธงอพยพใหม่", "เบอร์ธงอพยพเดิม", "รหัสหนักงาน", "คำนำหน้า", "ชื่อ-นามสกุล", "เพศ", "Cost Center", "แผนก/พื้นที่", "บทบาทหน้าที่"],
    [1, 3, 12, 20000009, "นาย", "ทดสอบ สะกดผิด", "ชาย", 1, "A", "ผู้อพยพ"]]), "ชีต1");
  const r = parsePlanWorkbook(wb, "x.xlsx");
  assert.equal(r.people[0]?.emp_id, "20000009");
  assert.ok(isTempExcel("~$1.Sort.xlsx") && isTempExcel("folder/~$a.xlsx") && !isTempExcel("1.Sort.xlsx"));
  const rows = combinedRows(mergePlan([r]));
  assert.equal(rows[0]["source sheet"], "ชีต1");
  assert.equal(rows[0]["source file"], "x.xlsx");
});

test("รหัสพนักงานรูปแบบไม่ถูกต้อง: นำเข้าพร้อมเตือน ไม่ข้ามแถว และไม่ชนกัน", () => {
  const wb = planBook([
    [1, 3, 12, "ร้านค้าโรงอาหาร", "นาง", "แม่ค้า หนึ่ง", "หญิง", 999999, "Canteen", "ผู้อพยพ"],
    [1, 3, 12, "ร้านค้าโรงอาหาร", "นาง", "แม่ค้า สอง", "หญิง", 999999, "Canteen", "ผู้อพยพ"],
    [1, 3, 12, 20000010, "นาย", "ปกติ ดี", "ชาย", 999999, "Canteen", "ผู้อพยพ"],
  ]);
  const r = parsePlanWorkbook(wb, "c.xlsx");
  assert.equal(r.people.length, 3);
  assert.ok(r.issues.some((i) => i.level === "warn" && /"ร้านค้าโรงอาหาร" รูปแบบไม่ถูกต้อง · นำเข้าไว้ก่อน/.test(i.message)));
  const m = mergePlan([r]);
  const ids = m.people.map((p) => p.emp_id).sort();
  assert.deepEqual(ids, ["20000010", "ร้านค้าโรงอาหาร", "ร้านค้าโรงอาหาร (2)"]);
  assert.equal(m.duplicates.length, 0);
});

test("ผู้ช่วยผู้นำธง ไม่นับเป็นผู้นำธง", () => {
  const wb = planBook([
    [1, 7, 17, 20000020, "นาย", "ผู้ช่วย หนึ่ง", "ชาย", 1, "A", "ผู้ช่วยผู้นำธง"],
    [1, 7, 17, 20000021, "นาย", "หัวหน้า จริง", "ชาย", 1, "A", "ผู้นำธงอพยพ"],
  ]);
  const m = mergePlan([parsePlanWorkbook(wb, "a.xlsx")]);
  assert.equal(m.leaders.find((l) => l.flag_no === "7")?.leader_name, "หัวหน้า จริง");
  assert.ok(!m.issues.some((i) => /ผู้นำธง 2 คน/.test(i.message)));
});

test("ไม่มีรหัสพนักงาน (Office Vender): นำเข้าโดยใช้ชื่อแทน พร้อมเตือน", () => {
  const wb = planBook([
    [1, 17, 31, "", "นางสาว", "เพ็ญจันทร์ เกษมรักษ์", "หญิง", "", "Office Vender", "ผู้นำธงอพยพ"],
    [1, 17, 31, "", "นาย", "พัฒนกฤช โพธิ์พยัคฆ์", "ชาย", "", "Office Vender", "ผู้อพยพ"],
    ["", "", "", "", "", "", "", "", "", ""],
  ]);
  const r = parsePlanWorkbook(wb, "17.Office_Vender.xlsx");
  assert.equal(r.people.length, 2);
  assert.equal(r.people[0].emp_id, "ไม่มีรหัส เพ็ญจันทร์ เกษมรักษ์");
  assert.equal(r.people[0].first_name, "เพ็ญจันทร์");
  assert.ok(r.issues.some((i) => /2 คนไม่มีรหัสพนักงาน \(แถว 5–6\)/.test(i.message)));
  const m = mergePlan([r]);
  assert.equal(m.leaders[0]?.leader_name, "เพ็ญจันทร์ เกษมรักษ์");
});

test("เบอร์ธงเป็นข้อความได้: 17A, OS-1, 'ธง 5', 07 → 7", async () => {
  const { normFlag, cmpFlag, flagRange } = await import("../lib/flag.ts");
  assert.equal(normFlag("17A"), "17A");
  assert.equal(normFlag("ธง 5"), "5");
  assert.equal(normFlag("07"), "7");
  assert.equal(normFlag(17), "17");
  assert.equal(normFlag("  "), null);
  assert.deepEqual(["10", "2", "OS-1", "1", "10A"].sort(cmpFlag), ["1", "2", "10", "10A", "OS-1"]);
  assert.equal(flagRange(["1", "2", "3", "5", "10A"]), "1–3, 5, 10A");
  const wb = planBook([
    [1, "17A", 31, 20000030, "นาย", "ทดสอบ ข้อความ", "ชาย", 1, "A", "ผู้นำธงอพยพ"],
    [1, "OS-1", "", 20000031, "นาย", "ทดสอบ สอง", "ชาย", 1, "A", "ผู้อพยพ"],
  ]);
  const m = mergePlan([parsePlanWorkbook(wb, "t.xlsx")]);
  assert.deepEqual(m.people.map((p) => p.flag_no), ["17A", "OS-1"]);
  assert.ok(!m.issues.some((i) => /ไม่มีเบอร์ธงใหม่/.test(i.message)));
});

test("ชื่อไทย/อังกฤษ: ตัดคำนำหน้า ค้นสลับลำดับ ค้นได้ทั้งสองภาษา", async () => {
  const { normName, matchName, isLatin, stripPrefix } = await import("../lib/names.ts");
  assert.equal(stripPrefix("นางสาว สมหญิง ใจดี"), "สมหญิง ใจดี");
  assert.equal(normName("Mr.  Somchai   JAIDEE"), "somchai jaidee");
  assert.equal(normName("Ms Somying"), "somying");
  assert.ok(isLatin("Somchai Jaidee") && !isLatin("สมชาย Jaidee") && !isLatin("1234"));
  assert.equal(matchName("jaidee somchai", ["สมชาย ใจดี", "Somchai Jaidee"]), 1, "สลับลำดับได้ เจอที่ชื่ออังกฤษ");
  assert.equal(matchName("นาย สมชาย", ["สมชาย ใจดี", "Somchai Jaidee"]), 0, "คำนำหน้าในคำค้นไม่มีผล");
  assert.equal(matchName("somchai xyz", ["สมชาย ใจดี", "Somchai Jaidee"]), -1);
});

test("นำเข้า: คอลัมน์ชื่ออังกฤษ และชื่อที่พิมพ์เป็นอังกฤษ", () => {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["หัว"], ["แผนก"], [],
    ["จุดรวมพล", "เบอร์ธงอพยพใหม่", "รหัสพนักงาน", "คำนำหน้า", "ชื่อ-นามสกุล", "ชื่อ-นามสกุล (อังกฤษ)", "เพศ", "Cost Center"],
    [1, 3, 20000041, "นาย", "สมชาย ใจดี", "Somchai Jaidee", "ชาย", 1],
    [1, 3, 20000042, "Mr.", "John Smith", "", "", 1]]), "s");
  const r = parsePlanWorkbook(wb, "x.xlsx");
  assert.equal(r.people[0].first_name, "สมชาย");
  assert.equal(r.people[0].name_en, "Somchai Jaidee");
  assert.equal(r.people[1].name_en, "John Smith");
  assert.equal(r.people[1].first_name, "John");
  assert.equal(r.people[1].gender, "ชาย", "เดาเพศจาก Mr.");
});
