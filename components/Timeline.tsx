"use client";
import { codeKind } from "@/lib/codes";
import { fmtClock, duration } from "./lib";

type Ev = { at: string; title: string; sub?: string | null; by?: string | null; tone?: string; kind: string };

/** ลำดับเหตุการณ์: แจ้ง → ประกาศรหัส → ยืนยัน → คนแรกยืนยัน → นับครบ → ปิด พร้อมเวลาแต่ละช่วง */
export default function Timeline({ inc, anns, codes, firstDone, now }: { inc: any; anns: any[]; codes: any[]; firstDone: string | null; now: number }) {
  const drill = inc.mode === "drill";
  const start = inc.reported_at ?? inc.confirmed_at ?? inc.opened_at;
  const confirmAt = inc.confirmed_at ?? inc.opened_at;
  const ev: Ev[] = [];
  if (inc.reported_at) ev.push({ at: inc.reported_at, kind: "report", title: drill ? "ขอเริ่มซ้อม" : "มีคนแจ้งเหตุ", sub: [inc.kind, inc.area].filter(Boolean).join(" · "), by: inc.reported_by });
  ev.push({ at: confirmAt, kind: "confirm", title: drill ? "เริ่มซ้อม · เริ่มนับคน" : "ยืนยันมีเหตุ · เริ่มนับคน", by: inc.confirmed_by });
  for (const a of anns) {
    const k = a.kind ?? codeKind(codes.find((c) => c.id === a.code_id) ?? { label: a.label });
    ev.push({ at: a.at, kind: `code-${k}`, title: `ประกาศ “${a.label}”`, sub: a.meaning, by: a.by_name, tone: a.tone ?? "grey" });
  }
  if (firstDone) ev.push({ at: firstDone, kind: "first", title: "คนแรกยืนยันปลอดภัย · เริ่มจับเวลานับรายชื่อ" });
  if (inc.first_full_at) ev.push({ at: inc.first_full_at, kind: "full", title: "นับคนครบ" });
  if (inc.closed_at && inc.state === "closed") ev.push({ at: inc.closed_at, kind: "close", title: drill ? "จบการซ้อม" : "ปิดเหตุการณ์", by: inc.closed_by });
  ev.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "report" ? -1 : 0));

  const at = (k: string) => ev.find((e) => e.kind === k)?.at ?? null;
  const urgent = at("code-urgent"), c500 = at("code-check");
  const end = inc.closed_at ?? new Date(now).toISOString();
  const span = (a: string | null, b: string | null) => (a && b ? duration(a, b) : "—");
  const keys: [string, string, string | null, string | null][] = [
    ...(inc.reported_at ? [["แจ้ง → ประกาศ 500", "", inc.reported_at, c500] as [string, string, string | null, string | null]] : []),
    ...(inc.reported_at ? [["แจ้ง → ยืนยัน", "", inc.reported_at, confirmAt] as [string, string, string | null, string | null]] : []),
    ["ยืนยัน → ประกาศด่วนมาก", "", confirmAt, urgent],
    ["ยืนยัน → คนแรกปลอดภัย", "", confirmAt, firstDone],
    ["เวลานับรายชื่อ (คนแรก → ครบ)", "main", firstDone, inc.first_full_at],
    ["รวมทั้งหมด", "main", start, inc.state === "closed" ? inc.closed_at : end],
  ];
  return (
    <section className="card">
      <div className="card-h"><span className="grow">ลำดับเหตุการณ์ · รหัสที่ประกาศ · เวลาแต่ละช่วง</span>
        {inc.state !== "closed" && <span className="muted xs" style={{ fontWeight: 500 }}>อัปเดตสด</span>}</div>
      <div className="row" style={{ gap: 8, padding: "12px 18px", flexWrap: "wrap", borderBottom: "1px solid var(--line-3)" }}>
        {keys.map(([label, cls, a, b]) => (
          <div key={label} style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "6px 12px", background: cls ? "#F0F9FF" : "#fff" }}>
            <div className="muted xs">{label}</div>
            <b className="mono" style={{ fontSize: cls ? 20 : 16 }}>{span(a, b)}</b>
          </div>
        ))}
      </div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th style={{ width: 90 }}>เวลา</th><th>เหตุการณ์</th><th style={{ width: 110 }}>ห่างจากขั้นก่อน</th><th style={{ width: 110 }}>นับจากเริ่ม</th><th>โดย</th></tr></thead>
        <tbody>{ev.map((e, i) => (
          <tr key={i}>
            <td className="mono" style={{ fontWeight: 600 }}>{fmtClock(e.at)}</td>
            <td>{e.tone ? <span className={`chip ${e.tone}`} style={{ fontSize: 13 }}>{e.title.replace(/^ประกาศ /, "")}</span> : <b>{e.title}</b>}
              {e.tone && <span className="muted xs" style={{ marginLeft: 6 }}>ประกาศรหัส</span>}
              {e.sub && <div className="muted xs">{e.sub}</div>}</td>
            <td className="mono">{i ? `+${duration(ev[i - 1].at, e.at)}` : "—"}</td>
            <td className="mono">{duration(start, e.at)}</td>
            <td className="small">{e.by ?? "—"}</td>
          </tr>
        ))}
        {anns.length === 0 && <tr><td colSpan={5} className="muted small">ยังไม่มีการประกาศรหัส</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}
