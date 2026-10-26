"use client";
// ค้นหาคนในชุดธงทุกธง (ชื่อ / รหัสพนักงาน / Cost Center / แผนก) แล้วกระโดดไปธงของคนนั้น
import { useEffect, useRef, useState } from "react";
import { api } from "./lib";
import { ISearch, IClose } from "./Icons";

export type PlanHit = {
  emp_id: string; prefix: string | null; first_name: string; last_name: string | null; name_en?: string | null; flag_no: string | null;
  cost_center: string | null; area: string | null; role: string | null; removed?: boolean;
};

export default function PlanSearch({ endpoint, onPick, placeholder = "ค้นหาทุกธง: ชื่อ / รหัสพนักงาน / Cost Center" }: {
  endpoint: string; onPick: (h: PlanHit) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlanHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const t = q.trim();
    if (!t) { setHits(null); return; }
    const n = ++seq.current;
    setBusy(true);
    const h = setTimeout(() => {
      api<{ results: PlanHit[] }>(`${endpoint}?q=${encodeURIComponent(t)}`)
        .then((r) => { if (n === seq.current) setHits(r.results); })
        .catch(() => { if (n === seq.current) setHits([]); })
        .finally(() => { if (n === seq.current) setBusy(false); });
    }, 250);
    return () => clearTimeout(h);
  }, [q, endpoint]);
  return (
    <div style={{ position: "relative" }}>
      <label className="row psearch">
        <ISearch size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="ค้นหาคนทุกธง"
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && hits?.[0]) { onPick(hits[0]); setQ(""); } }} />
        {q && <button type="button" className="lk" style={{ minHeight: 0, padding: 0 }} onClick={() => setQ("")} aria-label="ล้างคำค้น"><IClose size={14} /></button>}
      </label>
      {hits && (
        <div className="psearch-list" role="listbox">
          {busy && hits.length === 0 && <div className="muted small" style={{ padding: 12 }}>กำลังค้นหา…</div>}
          {!busy && hits.length === 0 && <div className="muted small" style={{ padding: 12 }}>ไม่พบ “{q.trim()}”</div>}
          {hits.map((h) => (
            <button key={h.emp_id} type="button" className="psearch-i" role="option" onClick={() => { onPick(h); setQ(""); }}>
              <span className="grow" style={{ minWidth: 0 }}>
                <b>{h.prefix ? `${h.prefix} ` : ""}{h.first_name} {h.last_name}</b>{h.name_en && <span className="muted xs" lang="en" style={{ marginLeft: 6 }}>{h.name_en}</span>}{h.removed && <span className="chip sm grey" style={{ marginLeft: 6 }}>ลบออกแล้ว</span>}
                <span className="muted xs" style={{ display: "block" }}><span className="mono">{h.emp_id}</span> · {[h.cost_center, h.area].filter(Boolean).join(" ") || "—"}{h.role && /^\s*ผู้นำ/.test(h.role) ? " · ผู้นำธง" : ""}</span>
              </span>
              <span className="chip sm" style={{ background: "#EEF2F7", color: "#1F3A5F" }}>ธง {h.flag_no ?? "—"}</span>
            </button>
          ))}
          {hits.length >= 50 && <div className="muted xs" style={{ padding: "8px 12px" }}>แสดง 50 คนแรก พิมพ์ให้เจาะจงขึ้น</div>}
        </div>
      )}
    </div>
  );
}
