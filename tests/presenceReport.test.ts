import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDiv, checkOutsource, checkDriver, summarize, bkk } from "../lib/presenceReport.ts";

const now = new Date("2026-10-19T08:00:00Z"); // 15:00 ไทย
const at = (hhmm: string, day = "2026-10-19") => new Date(`${day}T${hhmm}:00+07:00`);

test("เวลาไทย HH:MM และใส่วันเมื่อข้ามวัน", () => {
  assert.equal(bkk(at("08:05"), now), "08:05");
  assert.equal(bkk(at("22:10", "2026-10-18"), now), "18/10 22:10");
});

test("MS Form: เข้าครั้งเดียว = อยู่ พร้อมเวลาที่เหลือก่อนออกอัตโนมัติ", () => {
  const r = checkDiv("a@central.co.th", "เอ", [{ at: at("08:00"), site: "SCDC1" }], now);
  assert.equal(r.verdict, "in");
  assert.match(r.reason, /เข้า 08:00 ที่ SCDC1/);
  assert.match(r.reason, /อีก 7 ชม\./);
});

test("MS Form: ส่งซ้ำใน 10 นาทีไม่นับ และติดธงให้ตรวจ", () => {
  const r = checkDiv("a@x", "เอ", [{ at: at("08:00"), site: "S" }, { at: at("08:04"), site: "S" }], now);
  assert.equal(r.verdict, "in");
  assert.match(r.flags.join(), /ส่งซ้ำภายใน 10 นาที 1 ครั้ง/);
});

test("MS Form: ส่งครั้งที่สองไซต์เดิม = ไม่อยู่ / เกิน 14 ชม. = ออกอัตโนมัติ", () => {
  assert.equal(checkDiv("a", "a", [{ at: at("08:00"), site: "S" }, { at: at("12:00"), site: "S" }], now).verdict, "out");
  const auto = checkDiv("b", "b", [{ at: at("00:30"), site: "S" }], new Date("2026-10-19T18:00:00Z"));
  assert.equal(auto.verdict, "out");
  assert.match(auto.reason, /ออกอัตโนมัติ 19\/10 14:30/);
});

test("Outsource: Clock in ยังไม่ออก = อยู่, ออกแล้ว = ไม่อยู่, ลืมกดออกเกิน 14 ชม. = ไม่อยู่", () => {
  const r = (ci: string, co: string | null, d = "2026-10-19") => [{ emp_id: "E", clock_in: at(ci, d).toISOString(), clock_out: co ? at(co, d).toISOString() : null, status: null, site: "SCDC" }];
  assert.equal(checkOutsource("E", "อี", r("07:00", null), now).verdict, "in");
  assert.equal(checkOutsource("E", "อี", r("07:00", "12:00"), now).verdict, "out");
  const forgot = checkOutsource("E", "อี", r("00:00", null), new Date("2026-10-19T18:00:00Z"));
  assert.equal(forgot.verdict, "out");
  assert.match(forgot.reason, /ลืมกดออก/);
  assert.match(checkOutsource("E", null, r("09:00", "08:00"), now).flags.join(), /เวลาออกก่อนเวลาเข้า.*|ไม่พบชื่อ/);
});

test("KIOS: ทะเบียนเป็นลิงก์ และค้างลานนาน ถูกติดธง", () => {
  const d = checkDriver({ plate: "https://bit.ly/x", plate_display: null, driver_name: null, zone: null, checkin_at: at("08:00", "2026-10-17").toISOString() }, now);
  assert.equal(d.verdict, "in");
  assert.match(d.flags.join(" "), /ไม่มีทะเบียน/);
  assert.match(d.flags.join(" "), /ค้างในลาน/);
});

test("สรุปแยกแหล่งและไซต์", () => {
  const s = summarize([
    checkDiv("a", "a", [{ at: at("08:00"), site: "SCDC1" }], now),
    checkOutsource("E", "e", [{ emp_id: "E", clock_in: at("07:00").toISOString(), clock_out: null, status: null, site: "SCDC1" }], now),
  ]);
  assert.equal(s.total.in, 2);
  assert.deepEqual(s.sites, [{ site: "SCDC1", n: 2 }]);
});
