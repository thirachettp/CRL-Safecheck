"use client";
import { useState } from "react";
import { codeKind, codePhrase, codeMeaning, DEFAULT_KINDS, type CodeKind, type KindsCfg } from "@/lib/codes";
import { api, fmtClock } from "./lib";

type Step = { key: string; title: string; at: string | null; by?: string | null };

/**
 * แจ้งรหัส (Admin / Safety): แสดงลำดับขั้น + ขั้นถัดไปที่ควรทำ
 * 1 มีคนแจ้งเหตุ → 2 Code 500 (ไปตรวจสอบ) → 3 ยืนยันมีเหตุ (เริ่มนับคน) → 4 500 ด่วนมาก (อพยพ) → 5 คุณสบายใจ (ปิด)
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
  // ข้อความประกาศตามประเภทเหตุ เช่น "รัดประภา 520 ที่ ห้องเครื่อง"
  const cfg = kinds ?? DEFAULT_KINDS;
  const L500 = codePhrase(cfg, inc.kind, inc.area, false), LUrg = codePhrase(cfg, inc.kind, inc.area, true), LClr = codeLabel("clear", "คุณสบายใจ");
  const M500 = codeMeaning(cfg, inc.kind, false), MUrg = codeMeaning(cfg, inc.kind, true);
  const tag = drill ? "(ซ้อม) " : "";
  const what = [inc.kind, inc.area].filter(Boolean).join(" · ") || inc.title || "";

  const steps: Step[] = [
    { key: "report", title: drill ? "ขอเริ่มซ้อม / มีคนแจ้งเหตุ" : "มีคนแจ้งเหตุ", at: inc.reported_by ? inc.opened_at : null, by: inc.reported_by },
    { key: "500", title: `แจ้ง ${L500}`, at: a500?.at ?? null, by: a500?.by_name },
    { key: "confirm", title: drill ? "ยืนยันเริ่มซ้อม" : "ยืนยันมีเหตุ", at: inc.confirmed_at ?? null, by: inc.confirmed_by },
    { key: "urgent", title: `แจ้ง ${LUrg}`, at: aUrgent?.at ?? null, by: aUrgent?.by_name },
    { key: "clear", title: `แจ้ง ${LClr} · ปิด`, at: aClear?.at ?? (inc.state === "closed" ? inc.closed_at : null), by: aClear?.by_name ?? inc.closed_by },
  ];

  async function run(key: string, fn: () => Promise<any>, ok: string) {
    setMsg(null);
    withPin(async () => {
      setBusy(true);
      try { await fn(); setMsg(ok); setArm(null); onDone(); } finally { setBusy(false); }
    });
  }
  const ann = (kind: CodeKind) => () => api(`/api/incidents/${id}/announce`, { method: "POST", json: { kind } });
  const confirm = () => api(`/api/incidents/${id}`, { method: "POST", json: { action: "confirm", closedPoints: Object.keys(off).filter((k) => off[k]) } });

  // ขั้นถัดไปที่ระบบแนะนำ
  type Next = { text: string; hint: string; btn?: { label: string; tone: string; key: string; fn: () => Promise<any>; ok: string; twice?: boolean } };
  let next: Next;
  if (pending && !a500) next = {
    text: `มีคนแจ้ง${drill ? "ขอซ้อม" : "เหตุ"}: ${what}`, hint: `แจ้ง “${L500}” = ${M500 || "เจ้าหน้าที่เข้าตรวจสอบ ยังไม่ต้องอพยพ"}`,
    btn: { label: `📢 แจ้ง ${tag}${L500}`, tone: "warn", key: "500", fn: ann("check"), ok: `แจ้ง ${L500} แล้ว · ส่งแจ้งเตือนทุกคน` } };
  else if (pending) next = {
    text: `ตรวจสอบแล้ว${drill ? "พร้อมซ้อม" : "เป็นเหตุจริง"}?`, hint: `กดยืนยัน = เริ่มนับคน · ถัดไปแจ้ง ${LUrg} ให้อพยพ · ถ้าไม่ใช่เหตุ แจ้ง ${LClr} เพื่อยกเลิก`,
    btn: { label: drill ? "ยืนยันเริ่มซ้อม" : "ยืนยันมีเหตุ · เริ่มนับคน", tone: "red", key: "confirm", fn: confirm, ok: "ยืนยันแล้ว · เริ่มนับคน", twice: true } };
  else if (active && !aUrgent) next = {
    text: "ยืนยันแล้ว · เริ่มนับคน", hint: `แจ้ง “${LUrg}” = ${MUrg || "อพยพไปจุดรวมพลทันที"}`,
    btn: { label: `📢 แจ้ง ${tag}${LUrg}`, tone: "red", key: "urgent", fn: ann("urgent"), ok: `แจ้ง ${LUrg} แล้ว · ส่งแจ้งเตือนทุกคน` } };
  else if (active && !complete) next = { text: `กำลังนับคน · ยังขาด ${missing} คน`, hint: `ติดตามรายชื่อผู้สูญหายด้านล่าง · นับครบแล้วระบบจะแนะนำ ${LClr}` };
  else if (active) next = {
    text: "นับคนครบแล้ว", hint: `แจ้ง ${LClr} เพื่อบอกทุกคนว่าสถานการณ์ปกติ และปิด${drill ? "การซ้อม" : "เหตุการณ์"}`,
    btn: { label: `📢 แจ้ง ${tag}${LClr} · ปิด`, tone: "ok", key: "clear", fn: ann("clear"), ok: `แจ้ง ${LClr} แล้ว · ปิด${drill ? "การซ้อม" : "เหตุการณ์"}`, twice: true } };
  else next = { text: inc.state === "cancelled" ? "ยกเลิกแล้ว" : "ปิดแล้ว", hint: "" };

  const curIdx = steps.findIndex((s) => !s.at);
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
        <span className="muted xs">Admin / Safety · ทุก Code ส่งแจ้งเตือนถึงทุกคน</span>
      </div>
      <div className="code-steps">
        {steps.map((s, i) => (
          <div key={s.key} className={`code-step${s.at ? " done" : i === curIdx && open ? " cur" : ""}`}>
            <span className="code-n">{s.at ? "✓" : i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="small" style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="muted xs ellip">{s.at ? `${fmtClock(s.at).slice(0, 5)}${s.by ? ` · ${s.by}` : ""}` : "—"}</div>
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div className="row" style={{ gap: 12, marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "var(--subtle)", flexWrap: "wrap" }}>
          <div className="grow" style={{ minWidth: 240 }}>
            <div style={{ fontWeight: 700 }}>ถัดไป: {next.text}</div>
            <div className="muted small">{next.hint}</div>
          </div>
          {next.btn && (
            <button className="btn" disabled={busy} style={{ minHeight: 48, fontSize: 15, ...toneStyle[next.btn.tone] }} onBlur={() => setArm(null)}
              onClick={() => (next.btn!.twice && arm !== next.btn!.key ? setArm(next.btn!.key) : run(next.btn!.key, next.btn!.fn, next.btn!.ok))}>
              {arm === next.btn.key ? "กดอีกครั้งเพื่อยืนยัน" : next.btn.label}
            </button>
          )}
          {pending && (
            <button className="btn" disabled={busy} onBlur={() => setArm(null)}
              onClick={() => (arm !== "cancel" ? setArm("cancel") : run("cancel", ann("clear"), `แจ้ง ${LClr} แล้ว · ยกเลิก (ไม่ใช่เหตุ)`))}>
              {arm === "cancel" ? "กดอีกครั้งเพื่อยกเลิก" : `ไม่ใช่เหตุ · ${LClr}`}
            </button>
          )}
        </div>
      )}
      {pending && a500 && points.length > 0 && (
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
            <button key={c.id} className="btn btn-sm" disabled={busy} onClick={() => run(`c${c.id}`, () => api(`/api/incidents/${id}/announce`, { method: "POST", json: { code_id: c.id } }), `แจ้ง ${c.label} แล้ว`)}>+ {c.label}</button>
          ))}
        </div>
      )}
      {msg && <p className="notice ok" style={{ marginTop: 10 }}>{msg}</p>}
    </section>
  );
}
