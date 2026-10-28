"use client";
// แท็บ “รีวิว” ในหน้าตั้งค่า: ผลรีวิวหลังซ้อม เห็นเฉพาะ Admin
import { useMemo } from "react";
import { api, usePoll, fmtDateTime } from "./lib";
import ReviewQR from "./ReviewQR";
import { RATINGS, SELECTS, PROBLEMS, summarize, toCsv, type FeedbackRow, type SelectKey } from "@/lib/feedback";

const TARGET = 100;
const TONE: Partial<Record<SelectKey, Record<string, string>>> = {
  find: { "เจอแต่ต้องลองหลายครั้ง": "#B45309", "หาไม่เจอ": "#B91C1C" },
  correct: { "ผิดบางส่วน": "#B45309", "ผิดเกือบทั้งหมด": "#B91C1C" },
  status: { "ไม่ตรง": "#B91C1C", "ไม่แน่ใจ": "#B45309" },
  time: { "1 – 3 นาที": "#B45309", "มากกว่า 3 นาที": "#B91C1C" },
  ready: { "พร้อมถ้าแก้ตามที่แจ้ง": "#B45309", "ยังไม่พร้อม": "#B91C1C" },
};

function Bars({ items, total, color }: { items: [string, number][]; total: number; color?: (k: string) => string | undefined }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {items.map(([k, v]) => (
        <div key={k} className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <span className="small" style={{ flex: "1 1 0", minWidth: 0 }}>{k}</span>
          <div style={{ width: 150, height: 10, background: "#EEF0F2", borderRadius: 5, overflow: "hidden", flex: "none" }}>
            <div style={{ width: `${total ? (v / total) * 100 : 0}%`, height: "100%", background: color?.(k) ?? "#1F3A5F" }} />
          </div>
          <b className="mono small" style={{ width: 32, textAlign: "right", flex: "none" }}>{v}</b>
        </div>
      ))}
    </div>
  );
}

export default function ReviewPanel() {
  const r = usePoll<{ rows: FeedbackRow[] }>("/api/feedback", 15000);
  const rows = r.data?.rows ?? [];
  const s = useMemo(() => summarize(rows), [rows]);

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "safecheck-review.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="wrap">
      <div className="stack" style={{ maxWidth: 860, gap: 16 }}>
        <ReviewQR title="QR สำหรับให้ผู้ทดสอบสแกนไปรีวิว" />
        {r.error && <p className="notice err">{r.error}</p>}
        {!r.data && !r.error && <p className="muted">กำลังโหลด…</p>}
        {r.data && !rows.length && (
          <div className="card" style={{ padding: 18 }}>
            <b>ยังไม่มีคนส่งรีวิว</b>
            <p className="muted small" style={{ margin: "4px 0 0" }}>เมื่อมีคนสแกน QR แล้วส่งแบบรีวิว จำนวนและคะแนนเฉลี่ยจะขึ้นที่นี่ (เป้าหมาย {TARGET} คน) · เห็นเฉพาะ Admin</p>
          </div>
        )}
        {!!rows.length && (
          <>
            <div className="card row" style={{ padding: 16, gap: 24 }}>
              <div><b style={{ fontSize: 28 }}>{s.n}<span className="muted" style={{ fontSize: 16 }}> / {TARGET}</span></b><div className="muted xs">ส่งรีวิวแล้ว</div></div>
              <div><b style={{ fontSize: 28 }}>{s.overall?.toFixed(2) ?? "-"}</b><div className="muted xs">คะแนนเฉลี่ยรวม (เต็ม 5)</div></div>
              <div><b style={{ fontSize: 28 }}>{s.readyPct}%</b><div className="muted xs">ตอบว่าพร้อมใช้งานจริง</div></div>
              <div className="grow" />
              <button className="btn" onClick={exportCsv}>ดาวน์โหลด CSV</button>
            </div>

            <div className="card stack" style={{ padding: 16 }}>
              <b>คะแนนเฉลี่ยรายข้อ</b>
              <Bars total={5} items={RATINGS.map((x) => [x.label, s.avg[x.id] ?? 0] as [string, number])} />
              <div className="muted xs">แสดงเป็นแท่งเทียบเต็ม 5 · ตัวเลขทางขวาเป็นคะแนนเฉลี่ย</div>
            </div>

            <div className="card stack" style={{ padding: 16, gap: 16 }}>
              <b>ผลการลองใช้</b>
              {(["find", "correct", "status", "time"] as SelectKey[]).map((k) => (
                <div key={k} className="stack" style={{ gap: 6 }}>
                  <span className="small" style={{ fontWeight: 600 }}>{SELECTS[k].label}</span>
                  <Bars total={s.n} items={Object.entries(s.counts[k])} color={(o) => TONE[k]?.[o]} />
                </div>
              ))}
            </div>

            <div className="card stack" style={{ padding: 16, gap: 16 }}>
              <b>ปัญหาที่เจอ</b>
              <Bars total={s.n} items={PROBLEMS.map((p) => [p, s.problems[p]] as [string, number])} />
              <b>พร้อมใช้งานจริงหรือยัง</b>
              <Bars total={s.n} items={Object.entries(s.counts.ready)} color={(o) => TONE.ready?.[o]} />
              <b>แยกตามกลุ่ม</b>
              <Bars total={s.n} items={Object.entries(s.counts.group)} />
              <b>แยกตามอุปกรณ์</b>
              <Bars total={s.n} items={Object.entries(s.counts.device)} />
            </div>

            <div className="card stack" style={{ padding: 16 }}>
              <b>ข้อความจากผู้ทดสอบ</b>
              {rows.filter((x) => x.good || x.improve).length === 0 && <span className="muted small">ยังไม่มีข้อความ</span>}
              {rows.filter((x) => x.good || x.improve).map((x) => (
                <div key={x.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div className="muted xs">{x.answers?.select?.group}{x.name ? ` · ${x.name}` : ""} · {fmtDateTime(x.updated_at)}</div>
                  {x.good && <div className="small"><b>ดี:</b> {x.good}</div>}
                  {x.improve && <div className="small"><b>ควรปรับปรุง:</b> {x.improve}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
