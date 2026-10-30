import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFields, normalizePlate, toVehicles, toIso, shouldHold, prepareRows, typeBreakdown } from "../lib/kioskMap.ts";

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
  const { vehicles, skipped } = toVehicles(p, f, new Date("2026-10-19T12:00:00Z"));
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
  const { vehicles, skipped } = toVehicles(rows, detectFields(rows), new Date("2026-10-19T12:00:00Z"));
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

test("KIOS: error HTML จาก gateway สรุปสั้น ๆ", async () => {
  const { kioskError } = await import("../lib/kiosk.ts");
  const m = kioskError(502, '<!DOCTYPE html><html class="no-js"><head><title>Bad gateway | example.com</title></head><body>...</body></html>');
  assert.match(m, /^KIOS ไม่ตอบ \(502 Bad Gateway/);
  assert.ok(m.length < 160 && !m.includes("<"));
  assert.match(kioskError(400, '{"code":"PGRST202","message":"no fn","hint":"try p_date"}'), /PGRST202 · no fn · คำแนะนำ: try p_date/);
});

test("KIOS: Body เลื่อนวันได้ {{today-2}}", async () => {
  const { rpcBody } = await import("../lib/kiosk.ts");
  process.env.KIOS_RPC_BODY = '{"from":"{{today-2}}","to":"{{today}}","y":"{{yesterday}}"}';
  const b = JSON.parse(rpcBody(new Date("2026-10-20T03:00:00Z")));
  assert.deepEqual(b, { from: "2026-10-18", to: "2026-10-20", y: "2026-10-19" });
  delete process.env.KIOS_RPC_BODY;
});

test("KIOS: ล่มแล้วไม่ยิงซ้ำทันที (พัก 1 นาทีที่ syncDriver)", async () => {
  const http = await import("node:http");
  let n = 0;
  const srv = http.createServer((req, res) => { n++; res.writeHead(502, { "content-type": "text/html" }); res.end("<html></html>"); });
  await new Promise<void>((r) => srv.listen(0, r));
  process.env.KIOS_BASE_URL = `http://127.0.0.1:${(srv.address() as any).port}`; process.env.KIOS_API_KEY = "k";
  const { fetchKiosk } = await import("../lib/kiosk.ts");
  await assert.rejects(fetchKiosk(), /KIOS ไม่ตอบ \(502 Bad Gateway\).*ลองใหม่ได้ใน 1 นาที/);
  assert.equal(n, 1);
  srv.close();
  delete process.env.KIOS_BASE_URL; delete process.env.KIOS_API_KEY;
});

test("KIOS: ตัดทะเบียนที่เป็นลิงก์ (ใช้ทะเบียนสำรองถ้ามี) และรถที่เข้าเกิน 2 วัน", () => {
  const now = new Date("2026-10-21T08:00:00Z");
  const rows = [
    { visitor_vehicle_plate: "https://lin.ee/6FJYb0T", dpark_car_plate: null, visitor_transaction_id: 1, visitor_checkin_time: "2026-10-21T07:00:00Z" },
    { visitor_vehicle_plate: "https://lin.ee/6FJYb0T", dpark_car_plate: "ญฐ1748", visitor_transaction_id: 2, visitor_checkin_time: "2026-10-21T06:00:00Z" },
    { visitor_vehicle_plate: "1กข1234", visitor_transaction_id: 3, visitor_checkin_time: "2026-10-17T06:00:00Z" },
    { visitor_vehicle_plate: "2กข5678", visitor_transaction_id: 4, visitor_checkin_time: "2026-10-20T09:00:00Z" },
  ];
  const r = toVehicles(rows, detectFields(rows), now);
  assert.deepEqual(r.vehicles.map((v) => v.plate_display).sort(), ["2กข5678", "ญฐ1748"]);
  assert.equal(r.url, 1);
  assert.equal(r.old, 1);
});

test("ยังอยู่ = ยังไม่มีเวลาออก (ไม่เชื่อสถานะของ KIOS)", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  const rows = [
    { visitor_transaction_id: 1, visitor_vehicle_plate: "2ฒก4564", visitor_checkin_date: "2026-10-29T15:28:22", visitor_checkout_date: null, status_id: 3 },
    { visitor_transaction_id: 2, visitor_vehicle_plate: "2ฒล1444", visitor_checkin_date: "2026-10-29T15:28:12", visitor_checkout_date: "2026-10-29T16:00:00", status_id: 2 },
    { visitor_transaction_id: 3, visitor_vehicle_plate: "605282", visitor_checkin_date: "2026-10-29T15:29:02", visitor_checkout_date: "-", status_id: 3 },
  ];
  const f = detectFields(rows);
  assert.equal(f.checkout_at, "visitor_checkout_date");
  assert.equal(f.checkin_at, "visitor_checkin_date");
  const r = toVehicles(rows, f, now);
  assert.deepEqual(r.vehicles.map((v) => v.plate_display).sort(), ["2ฒก4564", "605282"]);
  assert.equal(r.out, 1);
});

test("แยกตามรูปแบบการทำรายการ freeMember / Visitor", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  const rows = [
    { visitor_transaction_id: 1, visitor_vehicle_plate: "1กข1", visitor_checkin_date: "2026-10-29T15:00:00", visitor_checkout_date: null, transaction_type: "Visitor" },
    { visitor_transaction_id: null, visitor_vehicle_plate: null, dpark_car_plate: "2ฒก4564", dpark_checkin: "2026-10-29T15:28:22", transaction_type: "freeMember" },
    { visitor_transaction_id: 3, visitor_vehicle_plate: "3คค3", visitor_checkin_date: "2026-10-29T15:00:00", visitor_checkout_date: "2026-10-29T16:00:00", transaction_type: "Visitor" },
  ];
  const b = typeBreakdown(rows, detectFields(rows), now);
  assert.equal(b.column, "transaction_type");
  const fm = b.types.find((t) => t.type === "freeMember")!;
  assert.equal(fm.rows, 1); assert.equal(fm.in_lot, 1);
  const vi = b.types.find((t) => t.type === "Visitor")!;
  assert.equal(vi.rows, 2); assert.equal(vi.in_lot, 1); assert.equal(vi.out, 1);
});

test("อ่าน Excel รายงานรถเข้าออก (dParkTransactions): freeMember ที่ยังไม่ออก = อยู่ในลาน", async () => {
  const { parseDparkReport, DPARK_FIELDS } = await import("../lib/kioskMap.ts");
  const aoa = [
    [null, null, null, "รายงานรถเข้าออกทั้งหมด"], [],
    ["ลำดับ", "เวลาเข้า", "เวลาออก", "ระยะเวลาจอด", "ประตูทางเข้า", "ประตูทางออก", "หมายเลขบัตร", "เลขทะเบียน", "โปรไฟล์", "ประเภท"],
    [2289853, "29/10/2026 16:35:33", "-", "00:00:00", "ทางเข้า ป้อมรปภ.", "-", "ญฐ1748", "ญฐ1748", "Visitor ปกติ", "freeMember"],
    [2289851, "29/10/2026 16:30:06", "29/10/2026 16:30:06", "00:00:00.001", "ทางเข้า ป้อมรปภ.", "ทางออก ป้อมรปภ.", "3ฒธ5518", "3ฒธ5518", "ปกติ", "freeMember"],
    [2289858, "29/10/2026 16:49:03", "-", "00:00:00", "ทางเข้า ป้อมรปภ.", "-", "415020", "415020", "Visitor ปกติ", "visitor"],
  ];
  const { rows } = parseDparkReport(aoa);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].checkin_at, "2026-10-29T09:35:33.000Z");
  assert.equal(rows[1].checkout_at, "2026-10-29T09:30:06.000Z");
  const v = toVehicles(rows as any, DPARK_FIELDS, new Date("2026-10-29T10:00:00Z"));
  assert.deepEqual(v.vehicles.map((x) => x.plate_display).sort(), ["415020", "ญฐ1748"]);
  assert.equal(v.vehicles.find((x) => x.plate_display === "ญฐ1748")!.company, "freeMember");
});

test("รวมรายการลานจอด (มี freeMember) กับ visitor: ใช้ลานจอดตัดสิน เติมชื่อคนขับจาก visitor", async () => {
  const { dparkFields, mergeDriverSources } = await import("../lib/kioskMap.ts");
  const now = new Date("2026-10-29T10:00:00Z");
  const dp = [
    { transactionid: 11, carplatenumber: "2ฒล6541", carplatecity: "กรุงเทพมหานคร", transactionchkin: "2026-10-29T16:00:00", transactionchkout: null, transactiontypename: "visitor" },
    { transactionid: 12, carplatenumber: "ญฐ1748", carplatecity: "กรุงเทพมหานคร", transactionchkin: "2026-10-29T16:35:33", transactionchkout: null, transactiontypename: "freeMember" },
    { transactionid: 13, carplatenumber: "3ฒธ5518", carplatecity: "กรุงเทพมหานคร", transactionchkin: "2026-10-29T16:30:06", transactionchkout: "2026-10-29T16:30:06", transactiontypename: "freeMember" },
    { transactionid: 14, carplatenumber: "9กก9999", carplatecity: "กรุงเทพมหานคร", transactionchkin: "2026-10-29T15:00:00", transactionchkout: "2026-10-29T16:00:00", transactiontypename: "visitor" },
  ];
  const f = dparkFields(dp);
  assert.equal(f.plate, "carplatenumber"); assert.equal(f.plate_alt, null); assert.equal(f.checkout_at, "transactionchkout");
  const d = toVehicles(dp, f, now);
  const vis = toVehicles([
    { visitor_transaction_id: 1, visitor_vehicle_plate: "2ฒล6541", visitor_checkin_date: "2026-10-29T16:00:00", visitor_name: "สมชาย", visitor_phone: "081" },
    { visitor_transaction_id: 2, visitor_vehicle_plate: "9กก9999", visitor_checkin_date: "2026-10-29T15:00:00", visitor_name: "ค้าง", visitor_phone: "082" },
  ], detectFields([{ visitor_transaction_id: 1, visitor_vehicle_plate: "x", visitor_checkin_date: "x", visitor_name: "x", visitor_phone: "x" }]), now).vehicles;
  const seen = new Set(dp.map((r) => normalizePlate(r.carplatenumber)));
  const m = mergeDriverSources(d.vehicles, seen, vis);
  assert.deepEqual(m.vehicles.map((v) => v.plate).sort(), ["2ฒล6541", "ญฐ1748"]);
  assert.equal(m.vehicles.find((v) => v.plate === "2ฒล6541")!.driver_name, "สมชาย");
  assert.equal(m.visOnly, 0); // 9กก9999 ลานจอดบอกออกแล้ว ไม่นับ แม้ visitor ยังไม่ออก
});

test("สมาชิกลานจอด: ทะเบียน ชื่อ รหัสพนักงาน (ไม่ใช้เลข 13 หลัก)", async () => {
  const { memberEntries } = await import("../lib/kioskMap.ts");
  const r = memberEntries([
    { id: 1, ticketMemberName: "สมชาย ใจดี", ticketMemberTaxID: "20076487", ticketMemberCarPlate: "ญฐ1748, 1กข 1234", ticketMemberTel: "0811111111", AppID: 34 },
    { id: 2, ticketMemberName: "สมหญิง", ticketMemberTaxID: "1100000000000", ticketMemberCarPlate: "2ฒก4564" },
  ]);
  assert.equal(r.cols.name, "ticketMemberName"); assert.equal(r.cols.plate, "ticketMemberCarPlate"); assert.equal(r.cols.emp, "ticketMemberTaxID");
  assert.deepEqual(r.entries.map((e) => [e.plate, e.emp]), [["ญฐ1748", "20076487"], ["1กข1234", "20076487"], ["2ฒก4564", null]]);
});

test("สมาชิก + รถ (dpark_Car) จับคู่ด้วย ticketMemberID", async () => {
  const { joinMemberCars, memberEntries } = await import("../lib/kioskMap.ts");
  const rows = joinMemberCars(
    [{ ticketMemberID: 7, ticketMemberName: "ทดสอบ สมาชิก", ticketMemberTaxID: "20371039", ticketMemberTel: "081" },
     { ticketMemberID: 8, ticketMemberName: "ปิดใช้งาน", ticketMemberTaxID: "20000000", ticketMemberActive: false }],
    [{ carID: 1, carPlateNumber: "1กข 1234", ticketMemberID: 7, Deleted: false }, { carID: 2, carPlateNumber: "9ขข9999", ticketMemberID: 7, Deleted: true },
     { carID: 3, carPlateNumber: "5คค5555", ticketMemberID: 8 }]);
  const { entries } = memberEntries(rows);
  assert.deepEqual(entries.map((e) => [e.plate, e.name, e.emp]), [["1กข1234", "ทดสอบ สมาชิก", "20371039"]]);
});
