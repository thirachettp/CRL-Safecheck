import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFields, normalizePlate, toVehicles, toIso, shouldHold, prepareRows } from "../lib/kioskMap.ts";

const rows = [
  { id: 1, license_plate: "70-1234", province: "กรุงเทพมหานคร", driver_name: "สมชาย ขับดี", driver_phone: "0812345678", transport_company: "ABC ขนส่ง", dock_no: "D12", checkin_time: "2026-10-19 08:15:00", status_id: 2 },
  { id: 2, license_plate: "70 1234", province: "กรุงเทพมหานคร", driver_name: null, driver_phone: null, transport_company: "ABC ขนส่ง", dock_no: "D12", checkin_time: "2026-10-19 07:00:00", status_id: 2 },
  { id: 3, license_plate: "3ฒก-881", province: "ชลบุรี", driver_name: "เอ บี", driver_phone: "", transport_company: "XYZ", dock_no: null, checkin_time: "2026-10-19T09:00:00+07:00", status_id: 2 },
  { id: 4, license_plate: "", province: "", driver_name: "ไม่มีทะเบียน", driver_phone: "", transport_company: "", dock_no: null, checkin_time: null, status_id: 2 },
];

test("เดาคอลัมน์จากชื่อ", () => {
  const f = detectFields(rows);
  assert.equal(f.plate, "license_plate");
  assert.equal(f.driver_name, "driver_name");
  assert.equal(f.phone, "driver_phone");
  assert.equal(f.company, "transport_company");
  assert.equal(f.checkin_at, "checkin_time");
  assert.equal(f.zone, "dock_no");
});

// โครงจริงจาก vms_dpark_withtransaction_detail (ข้อมูลปลอม)
const real = [
  { visitor_transaction_id: 501, visitor_vehicle_plate: "1กข 1234", visitor_ticketnumber: "T1", visitor_checkin_date: "2026-10-19T08:10:00",
    visitor_checkout_date: null, visitor_purpose: "ส่งสินค้า", visitor_places: [{ PlaceName: "Dock 3" }, { PlaceName: "Inbound" }],
    appid: 34, status_id: 2, status: "Check-in", dpark_transaction_id: 9, dpark_car_plate: "1กข1234", dpark_checkin: "2026-10-19T08:05:00",
    dpark_parkingtime: 30, dpark_imageurl: "https://x/img.jpg", visitor_person_id: 77, visitor_citizenid: "1100000000000",
    visitor_name: "สมศักดิ์ ส่งของ", visitor_email: null, visitor_phone: "0810000000", visitor_address: "บ้าน", visitor_company: "ขนส่งทดสอบ", use_passport: false },
  { visitor_transaction_id: 502, visitor_vehicle_plate: "", dpark_car_plate: "", visitor_checkin_date: null, dpark_checkin: "2026-10-19T09:00:00",
    visitor_name: "เดินเท้า", visitor_places: [], status_id: 2, visitor_citizenid: "1", dpark_parkingtime: 0 },
];

test("โครงจริงของ KIOS: ตัดข้อมูลอ่อนไหว รวมสถานที่ จับคอลัมน์ถูก", () => {
  const p = prepareRows(real);
  assert.equal("visitor_citizenid" in p[0], false);
  assert.equal("visitor_address" in p[0], false);
  assert.equal("dpark_imageurl" in p[0], false);
  assert.equal(p[0].places, "Dock 3; Inbound");
  const f = detectFields(p);
  assert.equal(f.plate, "visitor_vehicle_plate");
  assert.equal(f.plate_alt, "dpark_car_plate");
  assert.equal(f.driver_name, "visitor_name");
  assert.equal(f.phone, "visitor_phone");
  assert.equal(f.company, "visitor_company");
  assert.equal(f.checkin_at, "visitor_checkin_date");
  assert.equal(f.checkin_alt, "dpark_checkin");
  assert.equal(f.zone, "places");
  const { vehicles, skipped } = toVehicles(p, f);
  assert.equal(skipped, 0);
  assert.equal(vehicles.length, 2);
  assert.equal(vehicles[0].driver_name, "สมศักดิ์ ส่งของ");
  assert.equal(vehicles[0].zone, "Dock 3; Inbound");
  const walk = vehicles.find((v) => v.plate.startsWith("ID-"))!;
  assert.equal(walk.plate, "ID-502");
  assert.equal(walk.checkin_at, "2026-10-19T02:00:00.000Z");
});

test("override ชื่อคอลัมน์ได้", () => {
  assert.equal(detectFields(rows, { plate: "id" }).plate, "id");
});

test("ทะเบียนที่พิมพ์ต่างกันได้ key เดียวกัน", () => {
  assert.equal(normalizePlate("70-1234"), normalizePlate(" 70 1234 "));
  assert.equal(normalizePlate("3ฒก-881"), "3ฒก881");
});

test("รถคันเดียวหลายแถว เหลือแถวที่เข้าล่าสุด และแถวไม่มีทะเบียนยังนับด้วยรหัสรายการ", () => {
  const { vehicles, skipped } = toVehicles(rows, detectFields(rows));
  assert.equal(vehicles.length, 3);
  assert.equal(skipped, 0);
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
