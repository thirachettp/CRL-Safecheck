"use client";
// แบบรีวิวหลังซ้อม: เปิดจาก QR ได้เลย ไม่ต้อง login
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MobileShell from "@/components/MobileShell";
import { api } from "@/components/lib";
import { PROBLEMS, RATINGS, SELECTS, SELECT_KEYS, type SelectKey, type RatingKey } from "@/lib/feedback";

const CID_KEY = "sc_fb_id";
function clientId() {
  try {
    let id = localStorage.getItem(CID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CID_KEY, id); }
    return id;
  } catch { return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

export default function FeedbackPage() {
  return <Suspense><Feedback /></Suspense>;
}

function Feedback() {
  const sp = useSearchParams();
  const incident_id = Number(sp.get("i")) || null;
  const [sel, setSel] = useState<Partial<Record<SelectKey, string>>>({});
  const [rate, setRate] = useState<Partial<Record<RatingKey, number>>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [t, setT] = useState({ name: "", emp_id: "", site: "", good: "", improve: "" });
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [cid, setCid] = useState("");
  useEffect(() => setCid(clientId()), []);

  function toggleProblem(p: string) {
    setProblems((cur) => {
      if (p === "ไม่พบปัญหา") return cur.includes(p) ? [] : [p];
      const next = cur.filter((x) => x !== "ไม่พบปัญหา");
      return next.includes(p) ? next.filter((x) => x !== p) : [...next, p];
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss = [...SELECT_KEYS.filter((k) => !sel[k]), ...RATINGS.filter((r) => !rate[r.id]).map((r) => r.id)];
    setMissing(miss);
    if (miss.length) {
      setErr("ยังตอบไม่ครบ ข้อที่ยังไม่ได้ตอบมีกรอบสีแดง");
      document.getElementById(`fb-${miss[0]}`)?.scrollIntoView({ block: "center" });
      return;
    }
    setBusy(true); setErr(null);
    try {
      await api("/api/feedback", { method: "POST", json: { client_id: cid, incident_id, select: sel, ratings: rate, problems, ...t } });
      setDone(true); window.scrollTo(0, 0);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  if (done) {
    return (
      <MobileShell>
        <div className="m-body" style={{ padding: 16 }}>
          <div className="card stack" style={{ padding: 18, gap: 10 }}>
            <b style={{ fontSize: 18 }}>ส่งรีวิวแล้ว ขอบคุณครับ</b>
            <p className="muted small" style={{ margin: 0 }}>คำตอบของคุณถูกบันทึกแล้ว ถ้าอยากแก้ไข กดแก้ไขแล้วส่งอีกครั้ง ระบบจะเก็บคำตอบล่าสุด</p>
            <button className="btn" onClick={() => setDone(false)}>แก้ไขคำตอบ</button>
          </div>
        </div>
      </MobileShell>
    );
  }

  const radio = (k: SelectKey) => (
    <div id={`fb-${k}`} className="card stack" style={{ padding: 14, gap: 8, borderColor: missing.includes(k) && !sel[k] ? "#B91C1C" : undefined }}>
      <b>{SELECTS[k].label}</b>
      <div className="row" style={{ gap: 6 }}>
        {SELECTS[k].opts.map((o) => (
          <button type="button" key={o} className={`pill${sel[k] === o ? " on" : ""}`} aria-pressed={sel[k] === o} onClick={() => setSel({ ...sel, [k]: o })}>{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <MobileShell>
      <div className="m-top row" style={{ gap: 6, flexWrap: "nowrap" }}><b className="grow">รีวิว SafeCheck</b></div>
      <form className="m-body stack" style={{ padding: 16, gap: 14 }} onSubmit={submit} noValidate>
        <p className="muted small" style={{ margin: 0 }}>กรอกหลังลองใช้ในการซ้อม ใช้เวลาประมาณ 3 นาที ไม่ต้องเข้าสู่ระบบ</p>

        <div className="card stack" style={{ padding: 14, gap: 8 }}>
          <b>ข้อมูลผู้ทดสอบ <span className="muted xs">(ไม่บังคับ)</span></b>
          <label className="lb">ชื่อ<input className="in" value={t.name} maxLength={80} onChange={(e) => setT({ ...t, name: e.target.value })} autoComplete="off" /></label>
          <label className="lb">รหัสพนักงาน / ทะเบียนรถ (คนขับ)<input className="in" value={t.emp_id} maxLength={30} onChange={(e) => setT({ ...t, emp_id: e.target.value })} autoComplete="off" /></label>
          <label className="lb">ไซต์ / แผนก<input className="in" value={t.site} maxLength={80} onChange={(e) => setT({ ...t, site: e.target.value })} autoComplete="off" /></label>
        </div>

        {(["group", "device", "role"] as SelectKey[]).map(radio)}
        <b style={{ marginTop: 4 }}>ผลการลองใช้</b>
        {(["find", "correct", "status", "time"] as SelectKey[]).map(radio)}

        <b style={{ marginTop: 4 }}>ให้คะแนน <span className="muted xs">1 = น้อยที่สุด · 5 = มากที่สุด</span></b>
        {RATINGS.map((r) => (
          <div key={r.id} id={`fb-${r.id}`} className="card stack" style={{ padding: 14, gap: 8, borderColor: missing.includes(r.id) && !rate[r.id] ? "#B91C1C" : undefined }}>
            <b>{r.label}</b>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className={`pill${rate[r.id] === n ? " on" : ""}`} aria-pressed={rate[r.id] === n} aria-label={`${r.label} ${n} คะแนน`} onClick={() => setRate({ ...rate, [r.id]: n })}>{n}</button>
              ))}
            </div>
          </div>
        ))}

        <div className="card stack" style={{ padding: 14, gap: 8 }}>
          <b>ปัญหาที่เจอ <span className="muted xs">เลือกได้หลายข้อ</span></b>
          <div className="row" style={{ gap: 6 }}>
            {PROBLEMS.map((p) => <button type="button" key={p} className={`pill${problems.includes(p) ? " on" : ""}`} aria-pressed={problems.includes(p)} onClick={() => toggleProblem(p)}>{p}</button>)}
          </div>
          <label className="lb">สิ่งที่ดีอยู่แล้ว<textarea className="in" style={{ minHeight: 80, padding: 10 }} value={t.good} maxLength={1000} onChange={(e) => setT({ ...t, good: e.target.value })} /></label>
          <label className="lb">สิ่งที่ควรปรับปรุง<textarea className="in" style={{ minHeight: 80, padding: 10 }} value={t.improve} maxLength={1000} onChange={(e) => setT({ ...t, improve: e.target.value })} /></label>
        </div>

        {radio("ready")}

        {err && <p className="notice err" role="alert">{err}</p>}
        <button className="btn btn-pri btn-lg" type="submit" disabled={busy || !cid}>{busy ? "กำลังส่ง…" : "ส่งรีวิว"}</button>
      </form>
    </MobileShell>
  );
}
