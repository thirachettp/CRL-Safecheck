import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFields, normalizePlate, toVehicles, toIso, shouldHold } from "../lib/kioskMap.ts";

const rows = [
  { id: 1, license_plate: "70-1234", province: "กรุงเทพมหานคร", driver_name: "สมชาย ขับดี", driver_phone: "0812345678", transport_company: "ABC ขนส่ง", dock_no: "D12", checkin_time: "2026-10-19 08:15:00", status_id: 2 },
  { id: 2, license_plate: "70 1234", province: "กรุงเทพมหานคร", driver_name: null, driver_phone: null, transport_company: "ABC ขนส่ง", dock_no: "D12", checkin_time: "2026-10-19 07:00:00", status_id: 2 },
  { id: 3, license_plate: "3ฒก-881", province: "ชลบุรี", driver_name: "เอ บี", driver_phone: "", transport_company: "XYZ", dock_no: null, checkin_time: "2026-10-19T09:00:00+07:00", status_id: 2 },
  { id: 4, license_plate: "", province: "", driver_name: "ไม่มีทะเบียน", driver_phone: "", transport_company: "", dock_no: null, checkin_time: null, status_id: 2 },
];

test("เดาคอลัมน์จากชื่อ", () => {
  const f = detectFields(rows);
  assert.deepEqual(f, {
    plate: "license_plate", province: "province", driver_name: "driver_name", phone: "driver_phone",
    company: "transport_company", checkin_at: "checkin_time", zone: "dock_no",
  });
});

test("override ชื่อคอลัมน์ได้", () => {
  assert.equal(detectFields(rows, { plate: "id" }).plate, "id");
});

test("ทะเบียนที่พิมพ์ต่างกันได้ key เดียวกัน", () => {
  assert.equal(normalizePlate("70-1234"), normalizePlate(" 70 1234 "));
  assert.equal(normalizePlate("3ฒก-881"), "3ฒก881");
});

test("รถคันเดียวหลายแถว เหลือแถวที่เข้าล่าสุด และข้ามแถวไม่มีทะเบียน", () => {
  const { vehicles, skipped } = toVehicles(rows, detectFields(rows));
  assert.equal(vehicles.length, 2);
  assert.equal(skipped, 1);
  const v = vehicles.find((x) => x.plate.startsWith("701234"))!;
  assert.equal(v.driver_name, "สมชาย ขับดี");
  assert.equal(v.checkin_at, "2026-10-19T01:15:00.000Z");
  assert.equal(v.plate_display, "70-1234 กรุงเทพมหานคร");
});

test("เวลาไม่มีโซน ถือเป็นเวลาไทย", () => {
  assert.equal(toIso("2026-10-19 08:00:00"), "2026-10-19T01:00:00.000Z");
  assert.equal(toIso("2026-10-19T08:00:00Z"), "2026-10-19T08:00:00.000Z");
  assert.equal(toIso(""), null);
});

test("จำนวนรถลดฮวบ = กักไว้", () => {
  assert.equal(shouldHold(40, 10), true);
  assert.equal(shouldHold(40, 30), false);
  assert.equal(shouldHold(5, 0), false);
});
