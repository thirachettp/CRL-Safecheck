import { test } from "node:test";
import assert from "node:assert/strict";
import { computePresence } from "../lib/presence.ts";

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 19, h, m));
const ev = (at: Date, site = "SCDC") => ({ at, site });

test("รายการแรก = เข้า", () => {
  const p = computePresence([ev(T(1))], T(2));
  assert.equal(p.state, "in");
});

test("รายการที่สองภายใน 14 ชม. ไซต์เดิม = ออก", () => {
  const p = computePresence([ev(T(1)), ev(T(9))], T(10));
  assert.deepEqual([p.state, p.state === "out" && p.reason], ["out", "manual"]);
});

test("กดซ้ำภายใน 10 นาที นับครั้งเดียว ยังอยู่ข้างใน", () => {
  const p = computePresence([ev(T(1, 0)), ev(T(1, 4))], T(2));
  assert.equal(p.state, "in");
});

test("ครบ 14 ชม. ไม่มีขาที่สอง = ออกอัตโนมัติ", () => {
  const p = computePresence([ev(T(1))], T(15, 1));
  assert.equal(p.state, "out");
  assert.equal(p.state === "out" && p.reason, "auto");
});

test("ขาที่สองต่างไซต์ = ย้ายไซต์ ยังอยู่ในพื้นที่ที่ไซต์ใหม่", () => {
  const p = computePresence([ev(T(1), "SCDC"), ev(T(3), "SCDC1")], T(4));
  assert.equal(p.state, "in");
  assert.equal(p.state === "in" && p.site, "SCDC1");
});

test("กะดึกข้ามเที่ยงคืนจับคู่ถูก", () => {
  const a = new Date(Date.UTC(2026, 9, 18, 13)); // 20:00 เวลาไทย
  const b = new Date(Date.UTC(2026, 9, 18, 23)); // 06:00 เวลาไทย
  const p = computePresence([ev(a), ev(b)], new Date(Date.UTC(2026, 9, 19, 0)));
  assert.equal(p.state, "out");
});

test("หลังออกแล้ว ส่งอีกครั้ง = เข้ารอบใหม่", () => {
  const p = computePresence([ev(T(1)), ev(T(5)), ev(T(8))], T(9));
  assert.equal(p.state, "in");
});

test("ขาที่สองมาหลัง 14 ชม. = เข้ารอบใหม่ ไม่ใช่ออก", () => {
  const a = new Date(Date.UTC(2026, 9, 18, 0));
  const p = computePresence([ev(a), ev(T(1))], T(2));
  assert.equal(p.state, "in");
});

test("รายการในอนาคตไม่นับ", () => {
  const p = computePresence([ev(T(1)), ev(T(5))], T(3));
  assert.equal(p.state, "in");
});
