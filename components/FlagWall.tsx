"use client";
import Link from "next/link";

type P = { flag_no: number | null; status: string; assembly_point: string | null; area: string | null };
type L = { flag_no: number; leader_name: string; assembly_point: string | null; area: string | null };

export type FlagSummary = {
  flag: number | null; total: number; done: number; alert: number; leader?: string; ap?: string | null; area?: string | null;
};

export function summarize(people: P[], leaders: L[]): FlagSummary[] {
  const map = new Map<string, FlagSummary>();
  for (const p of people) {
    const k = String(p.flag_no ?? "none");
    const s = map.get(k) ?? { flag: p.flag_no, total: 0, done: 0, alert: 0, ap: p.assembly_point, area: p.area };
    s.total++;
    if (p.status !== "pending") s.done++;
    if (p.status === "injured" || p.status === "trapped") s.alert++;
    map.set(k, s);
  }
  for (const l of leaders) {
    const s = map.get(String(l.flag_no));
    if (s) { s.leader = l.leader_name; s.ap = l.assembly_point ?? s.ap; s.area = l.area ?? s.area; }
  }
  return [...map.values()].sort((a, b) => (a.flag ?? 1e9) - (b.flag ?? 1e9));
}

/** กำแพงธง: แต่ละธงเติมสีเขียวขึ้นตามสัดส่วนที่นับแล้ว แดงทั้งผืนเมื่อมีคนบาดเจ็บ/ติดอยู่ */
export default function FlagWall({ items, hrefFor }: { items: FlagSummary[]; hrefFor: (f: number | null) => string }) {
  if (!items.length) return <p className="muted">ยังไม่มีรายชื่อในเหตุการณ์นี้</p>;
  return (
    <div className="flag-wall">
      {items.map((s) => {
        const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
        const cls =
          s.flag === null ? "flag flag-none" : s.alert ? "flag flag-alert" : s.done === s.total ? "flag flag-done" : "flag";
        const left = s.total - s.done;
        return (
          <div className="flag-wrap" key={String(s.flag)}>
            <Link
              href={hrefFor(s.flag)}
              className={cls}
              style={{ ["--fill" as any]: `${pct}%` }}
              aria-label={`ธง ${s.flag ?? "ไม่ระบุ"} นับแล้ว ${s.done} จาก ${s.total}${s.alert ? ` มีเหตุด่วน ${s.alert}` : ""}`}
            >
              <span className="flag-no">{s.flag ?? "?"}</span>
              <span className="flag-meta">{s.flag === null ? "ไม่ระบุธง" : s.leader ?? s.area ?? `จุดรวมพล ${s.ap ?? "-"}`}</span>
              <span className="flag-count">
                {s.alert ? `เหตุด่วน ${s.alert}, ` : ""}
                {left ? `เหลือ ${left}` : "ครบ"} / {s.total}
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
