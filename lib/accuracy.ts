// วัดความแม่นยำของสิ่งที่ระบบคาด (มา / ไม่มา) เทียบกับที่คนยืนยันจริงระหว่างซ้อม/เกิดเหตุ — ไม่ขึ้นกับ db เพื่อให้ทดสอบได้

export type AccPerson = {
  person_key: string; name: string; emp_id?: string | null; here: boolean; status: string; added_by?: string | null;
  pred_basis?: string | null; pred_note?: string | null; status_note?: string | null; presence?: string | null;
  flag_no?: string | null; cost_center?: string | null; status_by?: string | null; status_at?: string | null;
};

export const BASIS_LABEL: Record<string, string> = {
  review_in: "ตรวจทานธง: มา",
  review_out: "ตรวจทานธง: ไม่มา",
  review_out_sys_in: "ตรวจทานว่าไม่มา แต่ระบบเข้า-ออกเห็นว่าอยู่",
  sys_in: "ระบบเข้า-ออก: อยู่ (DIV+ / Outsource)",
  sys_out_os: "Outsource: ไม่ได้ Clock in / ออกแล้ว",
  sys_out_div: "DIV+: เช็คเอาท์แล้ว",
  none: "ไม่มีข้อมูล (ระบบถือว่าอยู่)",
  src_div: "นอกชุดธง: DIV+ (MS Form)",
  src_outsource: "นอกชุดธง: Outsource",
  src_kiosk: "คนขับรถ (KIOS)",
  src_plan: "ชุดธง",
};

/** เหตุการณ์เก่าที่ยังไม่ได้เก็บ pred_basis: เดาจากข้อความเหตุผล */
export function basisOf(p: AccPerson): string {
  if (p.pred_basis) return p.pred_basis;
  const n = p.pred_note ?? p.status_note ?? "";
  if (/^ตรวจทานว่าไม่มา/.test(n)) return "review_out_sys_in";
  if (/^ตรวจทานธง: ไม่มา/.test(n)) return "review_out";
  if (/Outsource/.test(n) && !p.here) return "sys_out_os";
  if (/DIV\+/.test(n) && !p.here) return "sys_out_div";
  if (p.presence && p.presence !== "plan") return p.person_key.startsWith("emp:") ? "sys_in" : `src_${p.presence}`;
  return "none";
}

const PRESENT = ["safe", "cmd", "inj", "in"];
/** ผล: correct = ระบบคาดถูก · wrong = คาดผิด · open = ยังไม่มีใครยืนยัน */
export function judge(p: AccPerson): "correct" | "wrong" | "open" {
  if (p.here) return PRESENT.includes(p.status) ? "correct" : p.status === "gone" ? "wrong" : "open";
  return p.status === "gone" ? "correct" : PRESENT.includes(p.status) ? "wrong" : "open";
}

type Tally = { n: number; correct: number; wrong: number; open: number };
const tally = (): Tally => ({ n: 0, correct: 0, wrong: 0, open: 0 });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const withPct = (t: Tally) => ({ ...t, accuracy: pct(t.correct, t.correct + t.wrong), verified: pct(t.correct + t.wrong, t.n) });

export function computeAccuracy(people: AccPerson[], groupBy: "flag" | "cc" = "flag") {
  const sys = people.filter((p) => p.added_by !== "manual");
  const all = tally(), abs = tally(), pres = tally();
  const basis = new Map<string, Tally>(), group = new Map<string, Tally>();
  const danger: AccPerson[] = [], wasted: AccPerson[] = [];
  for (const p of sys) {
    const r = judge(p);
    const b = basisOf(p);
    const g = groupBy === "cc" ? p.cost_center ?? "ไม่ระบุ" : p.flag_no ?? "ไม่ระบุธง";
    for (const t of [all, p.here ? pres : abs, basis.get(b) ?? basis.set(b, tally()).get(b)!, group.get(g) ?? group.set(g, tally()).get(g)!]) {
      t.n++; t[r]++;
    }
    if (r === "wrong") (p.here ? wasted : danger).push(p);
  }
  const manual = people.filter((p) => p.added_by === "manual");
  return {
    overall: withPct(all),
    // ระบบคาดว่าไม่อยู่ (ปลอดภัยตามระบบ): ถูก = ยืนยันว่าไม่อยู่จริง · ผิด = จริงๆ อยู่ (อันตราย ถ้าไม่มีใครตรวจ)
    absent: withPct(abs),
    // ระบบคาดว่าอยู่ (ต้องนับ): ถูก = เจอตัว / ยืนยันสถานะ · ผิด = จริงๆ ไม่อยู่ (เสียเวลาตามหา)
    present: withPct(pres),
    // คนที่ระบบไม่มีในรายชื่อเลย (ต้องเพิ่มเอง)
    missed: { n: manual.length, of: people.length, pct: pct(manual.length, people.length), people: manual },
    byBasis: [...basis.entries()].map(([k, t]) => ({ key: k, label: BASIS_LABEL[k] ?? k, ...withPct(t) })).sort((a, b) => b.n - a.n),
    byGroup: [...group.entries()].map(([k, t]) => ({ key: k, ...withPct(t) }))
      .sort((a, b) => b.wrong - a.wrong || (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.n - a.n),
    danger, wasted,
  };
}
