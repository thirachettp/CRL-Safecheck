"use client";
import { useState } from "react";
import { codeKind, codePhrase, codeMeaning, DEFAULT_KINDS, type CodeKind, type KindsCfg } from "@/lib/codes";
import { api, fmtClock } from "./lib";

type Step = { key: string; title: string; sub?: string; at: string | null; by?: string | null;
  btn?: { label: string; tone: string; enabled: boolean; fn: () => Promise<any>; ok: string; twice?: boolean } };

/**
 * แจ้งรหัส (Admin / Safety / LP): 5 ขั้น แต่ละขั้นมีปุ่มของตัวเองอยู่ที่เดิมเสมอ
 * 1 ขอเริ่มซ้อม / มีคนแจ้ง → 2 ยืนยันเริ่ม (เริ่มนับคน) → 3 คุณรัดประภา 500 → 4 … ด่วนมาก → 5 คุณสบายใจ · ปิด
 */
export default function CodePanel({ id, inc, anns, codes, points, missing, complete, withPin, onDone, kinds }: {
  id: number; inc: any; anns: any[]; codes: any[]; points: any[]; missing: number; complete: boolean; kinds?: KindsCfg;
  withPin: (fn: () => Promise<void>) => void; onDone: () => void;
}) {
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [arm, setArm] = useState<string | null>(null);
  const drill = inc.mode === "drill";
  const pending = inc.state === "pending";
  const active = inc.state === "active";
  const kindOf = (a: any): CodeKind => a.kind ?? codeKind(codes.find((c) => c.id === a.code_id) ?? { label: a.label });
  const firstAnn = (k: CodeKind) => anns.find((a) => kindOf(a) === k) ?? null;
  const a500 = firstAnn("check"), aUrgent = firstAnn("urgent"), aClear = firstAnn("clear");
  const codeLabel = (k: CodeKind, fb: string) => codes.find((c) => codeKind(c) === k)?.label ?? fb;
  // ข้อความประกาศตามประเภทเหตุ เช่น "คุณรัดประภา 520 ที่ ห้องเครื่อง"
  const cfg = kinds ?? DEFAULT_KINDS;
  const L500 = codePhrase(cfg, inc.kind, inc.area, false), LUrg = codePhrase(cfg, inc.kind, inc.area, true), LClr = codeLabel("clear", "คุณสบายใจ");
  const M500 = codeMeaning(cfg, inc.kind, false), MUrg = codeMeaning(cfg, inc.kind, true);
  const num = L500.replace(/ ที่ .*$/, "");
  const what = [inc.kind, inc.area].filter(Boolean).join(" · ") || inc.title || "";

  async function run(fn: () => Promise<any>, ok: string) {
    setMsg(null);
    withPin(async () => {
      setBusy(true);
      try { await fn(); setMsg(ok); setArm(null); onDone(); } finally { setBusy(false); }
    });
  }
  const ann = (kind: CodeKind) => () => api(`/api/incidents/${id}/announce`, { method: "POST", json: { kind } });
  const confirm = () => api(`/api/incidents/${id}`, { method: "POST", json: { action: "confirm", closedPoints: Object.keys(off).filter((k) => off[k]) } });

  const steps: Step[] = [
    { key: "report", title: drill ? "ขอเริ่มซ้อม" : "มีคนแจ้งเหตุ", sub: what,
      at: inc.reported_at ?? (inc.reported_by ? inc.opened_at : inc.confirmed_at ?? inc.opened_at), by: inc.reported_by ?? inc.confirmed_by,
      btn: { label: drill ? "ยกเลิกคำขอซ้อม" : "ไม่ใช่เหตุ · ยกเลิก", tone: "", enabled: pending, fn: ann("clear"), ok: `ยกเลิกแล้ว · แจ้ง ${LClr}`, twice: true } },
    { key: "confirm", title: drill ? "ยืนยันเริ่มซ้อม" : "ยืนยันมีเหตุ", sub: "เริ่มนับคน · แจ้งเตือนทุกคน",
      at: pending ? null : inc.confirmed_at ?? inc.opened_at, by: inc.confirmed_by,
      btn: { label: drill ? "ยืนยันเริ่มซ้อม" : "ยืนยันมีเหตุ", tone: "red", enabled: pending, fn: confirm, ok: "ยืนยันแล้ว · เริ่มนับคน", twice: true } },
    { key: "500", title: `แจ้ง ${L500}`, sub: M500 || "เจ้าหน้าที่เข้าตรวจสอบ ยังไม่ต้องอพยพ", at: a500?.at ?? null, by: a500?.by_name,
      btn: { label: `📢 แจ้ง ${num}`, tone: "warn", enabled: active && !a500, fn: ann("check"), ok: `แจ้ง ${L500} แล้ว · ส่งแจ้งเตือนทุกคน` } },
    { key: "urgent", title: `แจ้ง ${LUrg}`, sub: MUrg || "อพยพไปจุดรวมพลทันที", at: aUrgent?.at ?? null, by: aUrgent?.by_name,
      btn: { label: `📢 แจ้ง ${num} ด่วนมาก`, tone: "red", enabled: active && !aUrgent, fn: ann("urgent"), ok: `แจ้ง ${LUrg} แล้ว · ส่งแจ้งเตือนทุกคน` } },
    { key: "clear", title: `แจ้ง ${LClr} · ปิด`, sub: complete ? "นับคนครบแล้ว" : active ? `ยังขาด ${missing} คน` : "เหตุการณ์กลับเข้าสู่ภาวะปกติ",
      at: aClear?.at ?? (inc.state === "closed" ? inc.closed_at : null), by: aClear?.by_name ?? inc.closed_by,
      btn: { label: `📢 ${LClr} · ปิด`, tone: "ok", enabled: active, fn: ann("clear"), ok: `แจ้ง ${LClr} แล้ว · ปิด${drill ? "การซ้อม" : "เหตุการณ์"}`, twice: true } },
  ];
  const curIdx = steps.findIndex((s) => !s.at);
  const cur = steps[curIdx];
  const hint = !cur ? (inc.state === "cancelled" ? "ยกเลิกแล้ว" : "ปิดแล้ว")
    : cur.key === "confirm" ? `${drill ? "พร้อมซ้อม" : "ตรวจสอบแล้วเป็นเหตุจริง"}? กดยืนยัน = เริ่มนับคน${points.length ? " · เลือกปิดจุดรวมพลด้านล่างก่อนได้" : ""}`
    : cur.key === "500" ? `แจ้ง “${L500}” = ${cur.sub}`
    : cur.key === "urgent" ? `แจ้ง “${LUrg}” = ${cur.sub}`
    : complete ? `นับคนครบแล้ว · แจ้ง ${LClr} เพื่อปิด${drill ? "การซ้อม" : "เหตุการณ์"}` : `กำลังนับคน · ยังขาด ${missing} คน · นับครบแล้วแจ้ง ${LClr}`;
  const toneStyle: Record<string, React.CSSProperties> = {
    warn: { background: "#B45309", borderColor: "#B45309", color: "#fff" },
    red: { background: "#B91C1C", borderColor: "#B91C1C", color: "#fff" },
    ok: { background: "#166534", borderColor: "#166534", color: "#fff" },
  };
  const open = pending || active;
  return (
    <section className="card" style={{ padding: "14px 18px", borderColor: pending ? "#B45309" : undefined }}>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <b className="grow" style={{ fontSize: 16 }}>แจ้งรหัส {drill && <span className="chip warn sm">ซ้อม</span>}</b>
        <span className="muted xs">Admin / Safety / LP · ทุก Code ส่งแจ้งเตือนถึงทุกคน</span>
      </div>
      <div className="code-steps">
        {steps.map((s, i) => {
          const b = s.btn!;
          const isCur = i === curIdx && open;
          const k = s.key;
          return (
            <div key={k} className={`code-step${s.at ? " done" : isCur ? " cur" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <span className="code-n">{s.at ? "✓" : i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{s.title}</div>
                  {s.sub && <div className="muted xs">{s.sub}</div>}
                  <div className="xs ellip" style={{ marginTop: 2, fontWeight: 600, color: s.at ? "#166534" : "var(--muted)" }}>{s.at ? `${fmtClock(s.at).slice(0, 5)}${s.by ? ` · ${s.by}` : ""}` : "ยังไม่ทำ"}</div>
                </div>
              </div>
              <div style={{ flexGrow: 1 }} />
              {open ? (
                <button className="btn btn-sm" disabled={busy || !b.enabled} onBlur={() => setArm(null)}
                  style={{ marginTop: 8, minHeight: 40, width: "100%", ...(b.enabled ? toneStyle[b.tone] ?? {} : {}) }}
                  onClick={() => (b.twice && arm !== k ? setArm(k) : run(b.fn, b.ok))}>
                  {arm === k ? "กดอีกครั้งเพื่อยืนยัน" : k === "report" ? (pending ? b.label : "✓ รับเรื่องแล้ว") : s.at ? (k === "confirm" ? "✓ ยืนยันแล้ว" : "✓ แจ้งแล้ว") : b.label}
                </button>
              ) : <div style={{ marginTop: 8, minHeight: 40 }} />}
            </div>
          );
        })}
      </div>
      {open && (
        <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 12, background: "var(--subtle)" }}>
          <b>ถัดไป:</b> <span className="small">{hint}</span>
        </div>
      )}
      {pending && points.length > 0 && (
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <span className="muted xs">จุดรวมพลที่ใช้ไม่ได้ (แตะเพื่อปิด ก่อนกดยืนยัน):</span>
          {points.map((p) => (
            <button key={p.code} className={`pill${off[p.code] ? " on" : ""}`} style={off[p.code] ? { background: "#7F1D1D", borderColor: "#7F1D1D" } : undefined}
              onClick={() => setOff({ ...off, [p.code]: !off[p.code] })} aria-pressed={!!off[p.code]}>{p.name}{off[p.code] ? " · ปิด" : ""}</button>
          ))}
        </div>
      )}
      {open && codes.some((c) => codeKind(c) === "other") && (
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <span className="muted xs">แจ้ง Code อื่น:</span>
          {codes.filter((c) => codeKind(c) === "other").map((c) => (
            <button key={c.id} className="btn btn-sm" disabled={busy} onClick={() => run(() => api(`/api/incidents/${id}/announce`, { method: "POST", json: { code_id: c.id } }), `แจ้ง ${c.label} แล้ว`)}>+ {c.label}</button>
          ))}
        </div>
      )}
      {msg && <p className="notice ok" style={{ marginTop: 10 }}>{msg}</p>}
    </section>
  );
}
