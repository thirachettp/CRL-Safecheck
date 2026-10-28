import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFeedback, summarize, toCsv, SELECTS, SELECT_KEYS, RATINGS, type FeedbackRow } from "../lib/feedback.ts";

const full = (over: any = {}) => ({
  client_id: "abcd1234-efgh",
  select: Object.fromEntries(SELECT_KEYS.map((k) => [k, SELECTS[k].opts[0]])),
  ratings: Object.fromEntries(RATINGS.map((r) => [r.id, 4])),
  problems: ["ช้าหรือค้าง", "ช้าหรือค้าง", "ไม่มีในรายการ"],
  name: "  สมชาย   ใจดี ", good: "ดี", improve: "",
  ...over,
});

test("ตอบครบ: รับได้ ตัดช่องว่าง ตัดปัญหาซ้ำและที่ไม่มีในรายการ", () => {
  const r = cleanFeedback(full({ incident_id: "7" }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.v.name, "สมชาย ใจดี");
    assert.deepEqual(r.v.answers.problems, ["ช้าหรือค้าง"]);
    assert.equal(r.v.incident_id, 7);
  }
});

test("ขาดคำถามบังคับ หรือค่านอกตัวเลือก: ปฏิเสธ", () => {
  const a = full(); delete a.select.find;
  assert.equal(cleanFeedback(a).ok, false);
  assert.equal(cleanFeedback(full({ ratings: { ...full().ratings, ease: 6 } })).ok, false);
  assert.equal(cleanFeedback(full({ ratings: { ...full().ratings, ease: 0 } })).ok, false);
  assert.equal(cleanFeedback(full({ select: { ...full().select, ready: "อื่นๆ" } })).ok, false);
  assert.equal(cleanFeedback(full({ client_id: "x" })).ok, false);
  assert.equal(cleanFeedback(null).ok, false);
});

test("สรุปผล: คะแนนเฉลี่ย จำนวนตอบ และ % พร้อมใช้", () => {
  const mk = (ease: number, ready: string) => ({ answers: { select: { ...full().select, ready }, ratings: { ...full().ratings, ease }, problems: [] } }) as any;
  const s = summarize([mk(5, SELECTS.ready.opts[0]), mk(3, SELECTS.ready.opts[1]), mk(4, SELECTS.ready.opts[0]), mk(4, SELECTS.ready.opts[2])]);
  assert.equal(s.n, 4);
  assert.equal(s.avg.ease, 4);
  assert.equal(s.avg.speed, 4);
  assert.equal(s.counts.ready[SELECTS.ready.opts[0]], 2);
  assert.equal(s.readyPct, 50);
  assert.equal(summarize([]).readyPct, null);
});

test("CSV: ใส่เครื่องหมายคำพูดในข้อความได้ และมี BOM", () => {
  const c = cleanFeedback(full({ good: 'พูดว่า "ดี"' }));
  assert.ok(c.ok);
  const row = { id: 1, incident_id: null, name: "ก", emp_id: null, site: null, answers: c.ok ? c.v.answers : null, good: 'พูดว่า "ดี"', improve: null, created_at: "", updated_at: "" } as FeedbackRow;
  const out = toCsv([row]);
  assert.ok(out.startsWith("﻿"));
  assert.ok(out.includes('"พูดว่า ""ดี"""'));
});
