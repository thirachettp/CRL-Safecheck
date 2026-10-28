import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccuracy, judge, basisOf } from "../lib/accuracy.ts";

const P = (o: any) => ({ person_key: "emp:" + Math.random(), name: "x", here: true, status: "unk", ...o });

test("judge: ระบบคาดไม่อยู่ + ยืนยันไม่อยู่จริง = ถูก · กลับเจอตัว = ผิด", () => {
  assert.equal(judge(P({ here: false, status: "gone" })), "correct");
  assert.equal(judge(P({ here: false, status: "safe" })), "wrong");
  assert.equal(judge(P({ here: false, status: "abs" })), "open");
  assert.equal(judge(P({ here: true, status: "safe" })), "correct");
  assert.equal(judge(P({ here: true, status: "in" })), "correct");
  assert.equal(judge(P({ here: true, status: "gone" })), "wrong");
  assert.equal(judge(P({ here: true, status: "unk" })), "open");
});

test("computeAccuracy: % ถูก, แยกตามเหตุผล, คนที่ระบบไม่มี", () => {
  const a = computeAccuracy([
    P({ here: false, status: "gone", pred_basis: "review_out", flag_no: "1" }),
    P({ here: false, status: "safe", pred_basis: "sys_out_div", flag_no: "1" }),
    P({ here: true, status: "safe", pred_basis: "review_in", flag_no: "2" }),
    P({ here: true, status: "safe", pred_basis: "none", flag_no: "2" }),
    P({ here: true, status: "gone", pred_basis: "none", flag_no: "2" }),
    P({ here: true, status: "unk", pred_basis: "none", flag_no: "3" }),
    P({ here: true, status: "safe", added_by: "manual", flag_no: "3" }),
  ]);
  assert.equal(a.overall.n, 6);
  assert.equal(a.overall.correct, 3);
  assert.equal(a.overall.wrong, 2);
  assert.equal(a.overall.accuracy, 60);
  assert.equal(a.absent.accuracy, 50);
  assert.equal(a.danger.length, 1);
  assert.equal(a.wasted.length, 1);
  assert.equal(a.missed.n, 1);
  const none = a.byBasis.find((b) => b.key === "none")!;
  assert.equal(none.n, 3); assert.equal(none.wrong, 1);
  assert.equal(a.byGroup[0].wrong, 1);
});

test("basisOf: เหตุการณ์เก่าเดาจากข้อความ", () => {
  assert.equal(basisOf(P({ here: false, status_note: "ตรวจทานธง: ไม่มา" })), "review_out");
  assert.equal(basisOf(P({ here: false, status_note: "ระบบ: DIV+ เช็คเอาท์แล้ว (ล่าสุด 10:00)" })), "sys_out_div");
  assert.equal(basisOf(P({ person_key: "plate:1", presence: "kiosk" })), "src_kiosk");
});
