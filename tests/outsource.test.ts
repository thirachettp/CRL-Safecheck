import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAttendance, parseStaff, presentFrom } from "../lib/outsourceMap.ts";

const now = new Date("2026-10-19T07:00:00Z"); // 14:00 เวลาไทย

test("แปลงแถว SharePoint ดิบ (Title / Clock_in / Site เป็น choice)", () => {
  const a = parseAttendance({ ID: 12, Title: "OS001", Clock_in: "2026-10-19T01:00:00Z", Clock_out: null, Status: { Value: "In" }, Site: { Value: "SCDC" } })!;
  assert.equal(a.item_id, "12");
  assert.equal(a.emp_id, "OS001");
  assert.equal(a.clock_in, "2026-10-19T01:00:00.000Z");
  assert.equal(a.clock_out, null);
  assert.equal(a.site, "SCDC");
  assert.equal(parseAttendance({ ID: 1 }), null);
});

test("เวลาที่ไม่มีโซน ถือเป็นเวลาไทย", () => {
  assert.equal(parseAttendance({ item_id: "1", employee_id: "X", clock_in: "2026-10-19 08:00:00" })!.clock_in, "2026-10-19T01:00:00.000Z");
});

test("รายชื่อจาก DC_FTE (field_1..field_4)", () => {
  assert.deepEqual(parseStaff({ field_1: "OS001", field_2: "82001", field_3: "สมชาย", field_4: "ใจดี" }),
    { emp_id: "OS001", first_name: "สมชาย", last_name: "ใจดี", cost_center: "82001" });
});

test("อยู่ในพื้นที่ = เข้าภายใน 14 ชม. และยังไม่ออก ใช้แถวล่าสุดของแต่ละคน", () => {
  const rows = [
    { item_id: "1", emp_id: "A", clock_in: "2026-10-19T01:00:00Z", clock_out: null, status: null, site: "SCDC" },
    { item_id: "2", emp_id: "B", clock_in: "2026-10-19T01:00:00Z", clock_out: "2026-10-19T05:00:00Z", status: null, site: null },
    { item_id: "3", emp_id: "C", clock_in: "2026-10-18T10:00:00Z", clock_out: null, status: null, site: null }, // เกิน 14 ชม.
    { item_id: "4", emp_id: "D", clock_in: "2026-10-18T01:00:00Z", clock_out: "2026-10-18T10:00:00Z", status: null, site: null },
    { item_id: "5", emp_id: "D", clock_in: "2026-10-19T02:00:00Z", clock_out: null, status: null, site: null }, // เข้าใหม่วันนี้
  ];
  assert.deepEqual(presentFrom(rows, now).map((r) => r.emp_id).sort(), ["A", "D"]);
});
