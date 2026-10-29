"use client";
import { matchName, normName } from "@/lib/names";
import { cmpFlag } from "@/lib/flag";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PcHeader from "@/components/PcHeader";
import { useAdmin } from "@/components/identity";
import { api, usePoll, fmtClock, fmtDateTime, duration, useNow, LBL, EVAC, inPool, TRI, rangeText, ago } from "@/components/lib";
import { IClock } from "@/components/Icons";
import CodePanel from "@/components/CodePanel";
import Timeline from "@/components/Timeline";
import AccuracyView from "@/components/AccuracyView";
import ReviewQR from "@/components/ReviewQR";
import Tabs, { useTab } from "@/components/Tabs";

export default function DashboardPage() {
  return (
    <>
      <PcHeader />
      <Suspense><Dash /></Suspense>
    </>
  );
}

function Dash() {
  const qid = useSearchParams().get("id");
  const list = usePoll<{ current: any; pending?: any; incidents: any[] }>("/api/incidents", 5000);
  const cur = list.data?.current;
  const id = qid ? Number(qid) : cur?.state === "active" || cur?.state === "pending" ? cur.id : null;
  if (!list.data) return <div className="wrap"><p className="muted">กำลังโหลด…</p></div>;
  const pend = list.data.pending;
  if (id) return (
    <>
      {pend && (
        <Link href={`/dashboard?id=${pend.id}`} style={{ display: "block", background: "#B91C1C", color: "#fff", padding: "10px 16px", fontWeight: 700, textDecoration: "none" }}>
          🚨 มีแจ้งเหตุจริงระหว่างซ้อม: {pend.kind} · {pend.area || "ไม่ระบุพื้นที่"} · แจ้งโดย {pend.reported_by} — แตะเพื่อแจ้งรหัส / ยืนยัน (ยืนยันแล้วระบบจบการซ้อมให้)
        </Link>
      )}
      <IncidentDash id={id} />
    </>
  );
  const past = list.data.incidents.filter((i) => i.state === "closed");
  return (
    <div className="wrap">
      <div className="card stack" style={{ padding: 20 }}>
        <h1 style={{ fontSize: 24 }}>{cur?.state === "pending" ? (cur.mode === "drill" ? "มีคำขอเริ่มซ้อมอพยพ รอยืนยัน" : "มีการแจ้งเหตุ รอยืนยัน") : "ไม่มีเหตุการณ์หรือการซ้อมตอนนี้"}</h1>
        <p className="muted">{cur?.state === "pending" ? `${cur.kind} · ${cur.area} · แจ้งโดย ${cur.reported_by} — ยืนยันได้จากหน้าแรกบนมือถือ` : "Dashboard จะแสดงสด เมื่อเริ่มซ้อมจากหน้าตั้งค่า หรือยืนยันเหตุจริง"}</p>
      </div>
      <div className="card">
        <div className="card-h">ประวัติ</div>
        {past.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มีเหตุการณ์ที่ปิดแล้ว</div>}
        <table className="tbl"><tbody>
          {past.map((i) => (
            <tr key={i.id}>
              <td><span className={`chip ${i.mode === "real" ? "err" : "warn"}`}>{i.mode === "real" ? "จริง" : "ซ้อม"}</span></td>
              <td><Link href={`/dashboard?id=${i.id}`}>{i.mode === "real" ? `${i.kind ?? ""} ${i.area ?? ""}` : i.title}</Link></td>
              <td>{fmtDateTime(i.opened_at)}</td>
              <td className="mono">{i.first_full_at ? `นับครบใน ${duration(i.opened_at, i.first_full_at)}` : `ค้าง ${i.missing} คน`}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}

function IncidentDash({ id }: { id: number }) {
  const d = usePoll<any>(`/api/incidents/${id}`, 3000);
  const { admin, unlock } = useAdmin();
  const [pin, setPin] = useState("");
  const [ask, setAsk] = useState<null | (() => Promise<void>)>(null);
  const [closeArm, setCloseArm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dq, setDq] = useState("");
  const now = useNow(1000);
  const [tab, setTab] = useTab("dash", ["live", "acc"] as const, "live");

  const inc = d.data?.incident;
  const real = inc?.mode === "real";
  const people: any[] = d.data?.people ?? [];
  const points: any[] = d.data?.points ?? [];
  const closedSet = new Set<string>(inc?.closed_points ?? []);
  const pName = (c: string) => points.find((p) => p.code === c)?.name ?? `จุดรวมพล ${c}`;
  const effPoint = (c: string | null) => {
    if (!c) return "ไม่ระบุจุด";
    if (!closedSet.has(c)) return c;
    return points.find((p) => p.code === c)?.backup ?? c;
  };

  const m = useMemo(() => {
    const pool = people.filter((p) => inPool(p.status));
    const evac = pool.filter((p) => EVAC.includes(p.status));
    const g = (arr: any[], s: string) => arr.filter((p) => p.gender === s).length;
    const byPoint = new Map<string, { total: any[]; evac: any[] }>();
    for (const p of pool) {
      if (p.status === "cmd") continue;
      const k = effPoint(p.assembly_point);
      const x = byPoint.get(k) ?? { total: [], evac: [] };
      x.total.push(p); if (EVAC.includes(p.status)) x.evac.push(p);
      byPoint.set(k, x);
    }
    const grpKey = (p: any) => (real ? p.cost_center ?? "ไม่ระบุ" : p.flag_no == null ? "ไม่ระบุธง" : String(p.flag_no));
    const groups = new Map<string, any[]>();
    for (const p of pool) groups.set(grpKey(p), [...(groups.get(grpKey(p)) ?? []), p]);
    const rows = [...groups.entries()].map(([k, mem]) => {
      const done = mem.filter((p) => EVAC.includes(p.status));
      const inn = mem.filter((p) => p.status === "in").length, unk = mem.filter((p) => p.status === "unk").length;
      const complete = !inn && !unk;
      // เริ่มนับแล้ว = มีคนในกลุ่มถูกระบุสถานะแล้วอย่างน้อย 1 คน (ปลอดภัย / บาดเจ็บ / ในคลัง)
      const started = mem.some((p) => p.status !== "unk");
      const at = complete ? done.reduce((mx, p) => (p.status_at && p.status_at > mx ? p.status_at : mx), "") : "";
      return { k, name: real ? mem[0]?.cc_name ?? "" : "", pts: [...new Set(mem.map((p) => effPoint(p.assembly_point)))].join(", "),
        done: done.length, total: mem.length, inn, unk, complete, started, at };
    }).sort((a, b) => Number(a.complete) - Number(b.complete) || (a.complete ? a.at.localeCompare(b.at) : b.unk + b.inn - (a.unk + a.inn)));
    const firstDone = evac.reduce((mn, p) => (p.status_at && (!mn || p.status_at < mn) ? p.status_at : mn), "");
    return {
      pool, evac, g, byPoint, rows,
      cmd: pool.filter((p) => p.status === "cmd"),
      missing: pool.filter((p) => p.status === "unk" || p.status === "in").sort((a, b) => (a.status === "in" ? -1 : 1) - (b.status === "in" ? -1 : 1)),
      inj: pool.filter((p) => p.status === "inj"),
      absAll: people.filter((p) => !p.here || p.status === "abs" || p.status === "gone").length,
      absPend: people.filter((p) => p.status === "abs").length,
      firstDone,
    };
  }, [people, real, points, inc]);
  const found = useMemo(() => {
    const t = dq.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t) return [];
    return people.filter((p) => (normName(dq) && matchName(dq, [p.name, p.name_en]) >= 0) || [p.name, p.name_en, p.emp_id, p.cost_center, p.cc_name, p.area, p.plate, p.email]
      .some((x) => x && String(x).toLowerCase().includes(t)));
  }, [people, dq]);
  const list = dq.trim() ? found : m.missing;

  async function withPin(fn: () => Promise<void>) {
    setErr(null);
    if (admin) { try { await fn(); } catch (e: any) { setErr(e.message); } return; }
    setAsk(() => fn);
  }
  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    try { await unlock(pin); const fn = ask; setAsk(null); setPin(""); if (fn) await fn(); } catch (x: any) { setErr(x.message); }
  }

  if (!d.data) return <div className="wrap"><p className="muted">{d.error ?? "กำลังโหลด…"}</p></div>;
  const active = inc.state === "active";
  const pct = m.pool.length ? Math.round((m.evac.length / m.pool.length) * 100) : 0;
  const target = d.data.target ?? 300;
  // เวลานับรายชื่อ เริ่มเมื่อมีคนแรกยืนยัน
  const tStart = m.firstDone || null;
  const tEnd = inc.first_full_at ?? (inc.closed_at ?? new Date(now).toISOString());
  const elapsedMs = tStart ? Math.max(0, new Date(tEnd).getTime() - new Date(tStart).getTime()) : 0;
  const over = elapsedMs > target * 1000;
  const completeGroups = m.rows.filter((r) => r.complete).length;
  const lastAt = inc.first_full_at;
  const C = 2 * Math.PI * 44;
  const codes: any[] = d.data.codes ?? [];
  const anns: any[] = d.data.announcements ?? [];

  if (inc.state === "pending") return (
    <>
      <div style={{ background: real ? "#7F1D1D" : "#FCD34D", color: real ? "#fff" : "#422006" }}>
        <div className="row" style={{ maxWidth: 1440, margin: "0 auto", padding: "12px 32px", gap: 16 }}>
          <span className="chip" style={{ background: real ? "#fff" : "#422006", color: real ? "#7F1D1D" : "#FCD34D", fontSize: 13, padding: "5px 12px" }}>{real ? "แจ้งเหตุ · รอยืนยัน" : "ขอซ้อม · รอยืนยัน"}</span>
          <b style={{ fontSize: 18 }}>{[inc.kind, inc.area].filter(Boolean).join(" · ") || inc.title} · แจ้งโดย {inc.reported_by ?? "—"} {fmtClock(inc.opened_at).slice(0, 5)}</b>
        </div>
      </div>

      {ask && (
        <form onSubmit={submitPin} className="row" style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}>
          <b>ใส่รหัส Admin / Safety Officer</b>
          <input className="in mono" style={{ width: 160, marginTop: 0 }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus aria-label="รหัส" />
          <button className="btn btn-pri btn-sm" type="submit">ยืนยัน</button><button className="btn btn-sm" type="button" onClick={() => setAsk(null)}>ยกเลิก</button>
        </form>
      )}
      {err && <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}><p className="notice warn">{err}</p></div>}
      <div className="wrap">
        <CodePanel id={id} inc={inc} anns={anns} codes={codes} points={points} missing={0} complete={false} withPin={withPin} onDone={d.reload} kinds={d.data.kinds} />
        <section className="card">
          <div className="card-h">บันทึกการประกาศ</div>
          {anns.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มีการประกาศ</div>}
          {anns.map((a) => (
            <div key={a.id} className="row" style={{ gap: 12, padding: "10px 18px", borderTop: "1px solid var(--line-3)", flexWrap: "nowrap" }}>
              <span className="mono" style={{ fontWeight: 600, width: 64 }}>{fmtClock(a.at).slice(0, 5)}</span>
              <span className={`chip ${a.tone ?? "grey"}`} style={{ fontSize: 13 }}>{a.label}</span>
              <span className="muted small grow">{a.meaning ?? ""}</span><span className="muted xs">โดย {a.by_name ?? "—"}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );

  return (
    <>
      <div style={{ background: real ? "#B91C1C" : "#FCD34D", color: real ? "#fff" : "#422006" }}>
        <div className="row" style={{ maxWidth: 1440, margin: "0 auto", padding: "12px 32px", gap: 16 }}>
          <span className="chip" style={{ background: real ? "#fff" : "#422006", color: real ? "#B91C1C" : "#FCD34D", fontSize: 13, padding: "5px 12px" }}>{real ? "INCIDENT จริง" : "ซ้อม · DRILL"}</span>
          <b style={{ fontSize: 18 }}>{real ? `${inc.kind ?? ""} ${inc.area ?? ""} · ยืนยันโดย ${inc.confirmed_by ?? "—"}` : `${inc.title ?? "ซ้อมอพยพ"}${inc.plan_name ? ` · ชุดธง ${inc.plan_name}` : ""}`}</b>
          <div className="grow" />
          <span className="small" style={{ background: real ? "rgba(255,255,255,.2)" : "rgba(66,32,6,.12)", borderRadius: 999, padding: "4px 12px" }}>
            {active ? <>อัปเดตล่าสุด <b className="mono">{fmtClock(d.data.now)}</b> · อัปเดตทุก 3 วินาที</> : <>ปิดเมื่อ <b className="mono">{fmtDateTime(inc.closed_at)}</b> โดย {inc.closed_by ?? "—"}</>}
          </span>
          {active && (
            <button className="btn btn-sm" onBlur={() => setCloseArm(false)} onClick={() => {
              if (!closeArm) return setCloseArm(true);
              withPin(async () => { const r = await api(`/api/incidents/${id}`, { method: "POST", json: { action: "close" } }); setCloseArm(false);
                if (r.absPending) setErr(`ปิดแล้ว · ยังมีปลอดภัยตามระบบที่รอยืนยัน ${r.absPending} คน`); d.reload(); });
            }}>{closeArm ? (m.absPend ? `ยังรอยืนยัน ${m.absPend} คน · กดอีกครั้งเพื่อปิด` : "กดอีกครั้งเพื่อยืนยัน") : real ? "ปิดเคส" : "จบการซ้อม"}</button>
          )}
        </div>
      </div>

      {inc.state === "closed" && !real && (
        <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}><ReviewQR incidentId={id} /></div>
      )}

      {ask && (
        <form onSubmit={submitPin} className="row" style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}>
          <b>ใส่รหัส Admin / Safety Officer</b>
          <input className="in mono" style={{ width: 160, marginTop: 0 }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus aria-label="รหัส" />
          <button className="btn btn-pri btn-sm" type="submit">ยืนยัน</button><button className="btn btn-sm" type="button" onClick={() => setAsk(null)}>ยกเลิก</button>
        </form>
      )}
      {err && <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}><p className="notice warn">{err}</p></div>}

      <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}>
        <Tabs tabs={[{ id: "live", label: real ? "ภาพรวมเหตุการณ์" : "ภาพรวมการซ้อม" }, { id: "acc", label: "ตรวจความแม่นยำของระบบ" }]} value={tab} onChange={setTab} />
      </div>
      {tab === "acc" ? <AccuracyView id={id} real={real} /> : (
      <div className="wrap">
        {!active && <Timeline inc={inc} anns={anns} codes={codes} firstDone={m.firstDone || null} now={now} />}
        {(active || inc.state === "pending") && (
          <CodePanel id={id} inc={inc} anns={anns} codes={codes} points={points} missing={m.missing.length}
            complete={m.pool.length > 0 && m.missing.length === 0} withPin={withPin} onDone={d.reload} kinds={d.data.kinds} />
        )}
        <div className="kpis">
          <div className="kpi">
            <div className="kpi-l">ฐานข้อมูล (snapshot)</div>
            <div className="kpi-n">{m.pool.length}<span className="kpi-u">คน</span></div>
            <div className="kpi-s">ชาย {m.g(m.pool, "ชาย")} · หญิง {m.g(m.pool, "หญิง")}{m.pool.length - m.g(m.pool, "ชาย") - m.g(m.pool, "หญิง") > 0 ? ` · ไม่ระบุ ${m.pool.length - m.g(m.pool, "ชาย") - m.g(m.pool, "หญิง")}` : ""}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">นับได้จริง</div>
            <div className="kpi-n">{m.evac.length}<span className="kpi-u">/ {m.pool.length}</span><span className="kpi-pct">{pct}%</span></div>
            <div className="kpi-s">ชาย {m.g(m.evac, "ชาย")}/{m.g(m.pool, "ชาย")} · หญิง {m.g(m.evac, "หญิง")}/{m.g(m.pool, "หญิง")}</div>
          </div>
          <div className="kpi danger">
            <div className="kpi-l">ผู้สูญหาย</div>
            <div className="kpi-n">{m.missing.length}<span className="kpi-u">คน</span></div>
            <div className="kpi-s">ยังไม่ทราบ {m.missing.filter((p) => p.status === "unk").length} · ในคลัง {m.missing.filter((p) => p.status === "in").length}</div>
          </div>
          <div className={`kpi${m.inj.length ? " inj" : ""}`}>
            <div className="kpi-l">ผู้บาดเจ็บ</div>
            <div className="kpi-n">{m.inj.length}<span className="kpi-u">คน</span></div>
            <div className="kpi-s">{m.inj.length ? `รอ Safety ระบุ ${m.inj.filter((p) => !p.triage).length}` : "นับรวมในยอดนับได้แล้ว"}</div>
          </div>
          <div className="kpi quiet">
            <div className="kpi-l">ปลอดภัยตามระบบ</div>
            <div className="kpi-n">{m.absAll}<span className="kpi-u">คน</span></div>
            <div className="kpi-s">รอยืนยัน {m.absPend} · ไม่นับใน %</div>
          </div>
        </div>

        <section className="card row" style={{ padding: "14px 18px", gap: 20, borderColor: over ? "#B91C1C" : "#14532D" }}>
          <div className="row" style={{ gap: 10 }}><IClock size={22} color={over ? "#B91C1C" : "#14532D"} /><b>เวลานับรายชื่อ</b><span className="muted small">เป้า {duration(new Date(0).toISOString(), new Date(target * 1000).toISOString())} นาที</span></div>
          <div className="small">{real ? "คนแรกยืนยัน" : "ยืนยันคนแรก"} <b className="mono">{m.firstDone ? fmtClock(m.firstDone) : "—"}</b></div>
          <div className="small">นับครบ <b className="mono">{lastAt ? fmtClock(lastAt) : "—"}</b>{!lastAt && m.rows.length - completeGroups > 0 && <span className="muted"> รอ {m.rows.length - completeGroups} {real ? "CC" : "ธง"}</span>}</div>
          <div className="small">{real ? "Cost Center" : "ธง"}ครบ <b>{completeGroups}</b> / {m.rows.length}</div>
          <div className="grow" />
          <div className="row" style={{ alignItems: "baseline", gap: 8, color: over ? "#B91C1C" : "#14532D" }}>
            <span className="mono" style={{ fontSize: 30, fontWeight: 700 }}>{tStart ? duration(tStart, tEnd) : "0:00"}</span>
            <span className="small" style={{ fontWeight: 700 }}>{!tStart ? "เริ่มจับเวลาเมื่อมีคนแรกยืนยัน" : over ? `เกินเป้า ${duration(new Date(0).toISOString(), new Date(elapsedMs - target * 1000).toISOString())}` : lastAt ? "นับครบในเป้า" : "ยังอยู่ในเป้า"}</span>
          </div>
        </section>

        <SourceStrip sources={d.data?.sources ?? []} people={people} now={now} incidentId={id} active={inc.state === "active"} onDone={d.reload} />

        <Heatmap rows={m.rows} real={real} />

        {active && <Timeline inc={inc} anns={anns} codes={codes} firstDone={m.firstDone || null} now={now} />}

        <div className="g2">
          <section className="card">
            <div className="card-h" style={{ flexWrap: "wrap", gap: 8 }}>
              <span className="grow">{dq.trim() ? "ผลค้นหา (ทุกคนในเหตุการณ์)" : "รายชื่อผู้สูญหาย"}</span>
              <input className="in" style={{ marginTop: 0, width: 260, minHeight: 36 }} placeholder="ค้นหา ชื่อ / รหัสพนักงาน / Cost Center" value={dq} onChange={(e) => setDq(e.target.value)} aria-label="ค้นหาคนในเหตุการณ์" />
              <span className="chip" style={{ background: "#FEE2E2", color: "#991B1B" }}>{dq.trim() ? `${found.length} คน` : `${m.missing.length} คน`}</span>
            </div>
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>#</th><th>ชื่อ-นามสกุล</th><th>แผนก</th><th>{real ? "Cost Center" : "ธง"}</th><th>จุดรวมพล</th><th>สถานะ</th></tr></thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={6} className="muted">{dq.trim() ? "ไม่พบ" : "ไม่มี"}</td></tr>}
                {list.slice(0, 100).map((p, i) => (
                  <tr key={p.person_key}>
                    <td className="mono">{i + 1}</td><td><b>{p.name}</b><div className="muted xs mono">{[p.emp_id, p.plate].filter(Boolean).join(" · ")}</div></td>
                    <td>{p.cc_name ?? p.area ?? "—"}{p.cost_center && <div className="muted xs mono">{p.cost_center}</div>}</td><td className="mono">{real ? p.cost_center ?? "—" : p.flag_no != null ? `ธง ${p.flag_no}` : "—"}</td>
                    <td>{p.assembly_point ? pName(effPoint(p.assembly_point)) : "—"}</td>
                    <td><span className={`chip s-${p.status}`}>{LBL[p.status]}</span>{p.status_note && <div className="muted xs" style={{ marginTop: 2 }}>{p.status_note}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {list.length > 100 && <div className="muted xs" style={{ padding: "10px 18px" }}>แสดง 100 จาก {list.length} คน</div>}
          </section>
          <div className="stack" style={{ gap: 20, minWidth: 0 }}>
          <section className="card" style={{ padding: 18 }}>
            <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
              <div className="grow"><div className="muted small" style={{ fontWeight: 700 }}>ความคืบหน้าการอพยพ</div>
                <div className="small" style={{ marginTop: 4 }}>อพยพแล้ว <b className="mono">{m.evac.length}</b> / {m.pool.length} คน<br /><span className="muted xs">รวมกองอำนวยการกลาง และผู้บาดเจ็บ</span></div></div>
              <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${pct}%`}>
                <circle cx="56" cy="56" r="44" fill="none" stroke="#ECEAE4" strokeWidth="12" />
                <circle cx="56" cy="56" r="44" fill="none" stroke="#1F3A5F" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 56 56)" />
                <text x="56" y="62" textAnchor="middle" fontSize="20" fontWeight="700" fill="#17191C" fontFamily="IBM Plex Mono, monospace">{pct}%</text>
              </svg>
            </div>
            {[...m.byPoint.entries()].sort().map(([k, x]) => {
              const p = x.total.length ? Math.round((x.evac.length / x.total.length) * 100) : 0;
              const flagsHere = [...new Set(x.total.map((y) => y.flag_no).filter((f) => f != null))].map(String).sort(cmpFlag);
              return (
                <div key={k} className="stack" style={{ gap: 4, padding: "8px 0", borderTop: "1px solid var(--line-3)" }}>
                  <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "nowrap" }}>
                    <b className="grow">{k === "ไม่ระบุจุด" ? k : pName(k)}</b><span className="mono" style={{ fontWeight: 600 }}>{x.evac.length} / {x.total.length} คน</span>
                    <span className="mono muted" style={{ width: 44, textAlign: "right" }}>{p}%</span></div>
                  <div className="bar"><div style={{ width: `${p}%`, background: "#1F3A5F" }} /></div>
                  <div className="muted xs">ชาย <b style={{ color: "var(--ink)" }}>{m.g(x.evac, "ชาย")}</b> · หญิง <b style={{ color: "var(--ink)" }}>{m.g(x.evac, "หญิง")}</b>
                    {!real && flagsHere.length > 0 && ` · ธง ${rangeText(flagsHere)}`}</div>
                </div>
              );
            })}
            <div className="stack" style={{ gap: 4, padding: "8px 0", borderTop: "1px solid var(--line-3)" }}>
              <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "nowrap" }}><b className="grow">กองอำนวยการกลาง</b><span className="mono" style={{ fontWeight: 600 }}>{m.cmd.length} คน</span></div>
              <div className="muted xs">ชาย <b style={{ color: "var(--ink)" }}>{m.g(m.cmd, "ชาย")}</b> · หญิง <b style={{ color: "var(--ink)" }}>{m.g(m.cmd, "หญิง")}</b> · นับเป็นอพยพแล้ว</div>
            </div>
          </section>
            <section className="card" style={{ paddingBottom: m.inj.length ? 8 : 0 }}>
              <div className="card-h"><span className="grow">รายชื่อผู้ได้รับบาดเจ็บ</span>
                <span className={`chip${m.inj.length ? "" : " grey"}`} style={m.inj.length ? { background: "#FFE4E6", color: "#881337" } : undefined}>{m.inj.length} คน</span></div>
              {m.inj.length === 0 && <div className="muted small" style={{ padding: "0 18px 16px" }}>ยังไม่มีผู้บาดเจ็บ · คนถือธงกด “บาดเจ็บ” แล้วจะขึ้นที่นี่ทันที Safety ระบุระดับ · อาการ · รพ. ต่อได้</div>}
              {[TRI[2], TRI[3], TRI[1], TRI[0], null].map((t) => {
                const rows = m.inj.filter((p) => (t ? p.triage === t.id : !p.triage));
                if (!rows.length) return null;
                return (
                  <div key={t?.id ?? "pend"}>
                    <div className="row" style={{ gap: 8, padding: "10px 18px 6px", fontWeight: 700, fontSize: 14, color: t ? t.fg : "#4B5058", flexWrap: "nowrap" }}>
                      <span className="dot" style={{ width: 12, height: 12, background: t ? t.dot : "#9CA3AF" }} />{t ? `${t.label} · ${t.name}` : "รอ Safety ระบุระดับ"}
                      <span className="mono" style={{ marginLeft: "auto" }}>{rows.length}</span></div>
                    <table className="tbl"><thead><tr><th style={{ width: "26%" }}>ชื่อ-นามสกุล</th><th style={{ width: "20%" }}>แผนก</th><th style={{ width: "16%" }}>จุดรวมพล</th><th>อาการ</th><th style={{ width: "18%" }}>รพ.ที่นำส่ง</th></tr></thead>
                      <tbody>
                        {rows.map((p) => (
                          <tr key={p.person_key}><td><b>{p.name}</b></td><td>{p.cc_name ?? p.area ?? "—"}</td><td>{p.assembly_point ? pName(effPoint(p.assembly_point)) : "—"}</td>
                            <td>{p.symptoms || (t ? "—" : <span className="muted">คนถือธงกดบาดเจ็บ · รอ Safety</span>)}</td><td>{p.hospital || "—"}</td></tr>
                        ))}
                      </tbody></table>
                  </div>
                );
              })}
            </section>
          </div>
        </div>

        <div className="g2">
          <section className="card">
            <div className="card-h"><span className="grow">แยกตาม{real ? " Cost Center" : "ธง"} · ไม่ครบขึ้นก่อน</span><span className="muted xs" style={{ fontWeight: 500 }}>เขียว = ครบ · แดง = นับแล้วแต่ยังขาด (ในคลัง / ไม่ทราบ) · ขาว = ยังไม่เริ่มนับ</span></div>
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>{real ? "Cost Center" : "ธง"}</th><th>จุดรวมพล</th><th>นับได้</th><th>ในคลัง</th><th>ไม่ทราบ</th><th>เวลาครบ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.k} className={!r.complete && r.started ? "bad" : ""}>
                    <td><b className="mono">{r.k}</b> {r.name && <span className="muted">{r.name}</span>}</td>
                    <td className="small">{r.pts.split(", ").map((c) => (c === "ไม่ระบุจุด" ? c : pName(c))).join(", ")}</td>
                    <td className="mono">{r.done} / {r.total}</td><td className="mono">{r.inn || "–"}</td><td className="mono" style={{ fontWeight: 700 }}>{r.unk || "–"}</td>
                    <td className="mono">{r.complete && r.at ? fmtClock(r.at) : "—"}</td>
                    <td><span className="chip" style={r.complete ? { background: "#DCFCE7", color: "#14532D" } : r.started ? { background: "#FEE2E2", color: "#991B1B" } : { background: "#fff", color: "var(--muted)", border: "1px solid var(--line-2)" }}>{r.complete ? "ครบ" : r.started ? "ขาด" : "ยังไม่เริ่ม"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>นับได้ รวมคนที่อยู่กองอำนวยการกลาง</div>
          </section>
        </div>
      </div>
      )}
    </>
  );
}

/** สถานะการดึงข้อมูลจากแต่ละแหล่ง + จำนวนคนที่มาจากแหล่งนั้นในเหตุการณ์ */
const PRESENCE: Record<string, string> = { div: "div", outsource: "outsource", driver: "kiosk" };
function SourceStrip({ sources, people, now, incidentId, active, onDone }: {
  sources: any[]; people: any[]; now: number; incidentId: number; active: boolean; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function refresh() {
    setBusy(true); setMsg(null);
    try { const r: any = await api(`/api/incidents/${incidentId}/refresh`, { method: "POST" }); setMsg(`ดึงแล้ว · เพิ่ม ${r.added ?? 0} คน`); onDone(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  const state = (x: any) => {
    if (!x.ready) return { c: "#9CA3AF", t: "ยังไม่เชื่อม" };
    const failed = x.last_error && (!x.last_ok_at || new Date(x.last_try_at) > new Date(x.last_ok_at));
    if (failed) return { c: "#B91C1C", t: `ดึงไม่สำเร็จ ${ago(x.last_try_at, now)}` };
    if (!x.last_ok_at) return { c: "#C2410C", t: "ยังไม่มีข้อมูล" };
    const age = now - new Date(x.last_ok_at).getTime();
    return { c: age > 30 * 60e3 ? "#C2410C" : "#166534", t: `อัปเดต ${ago(x.last_ok_at, now)}` };
  };
  return (
    <section className="card" style={{ padding: "12px 18px" }}>
      <div className="row" style={{ gap: 18 }}>
        <b className="small">สถานะการดึงข้อมูล</b>
        {sources.map((x) => {
          const st = state(x);
          const pk = PRESENCE[x.key];
          const n = pk ? people.filter((p) => p.presence === pk).length : null;
          return (
            <div key={x.key} className="row" style={{ gap: 6, flexWrap: "nowrap" }} title={x.last_error ?? undefined}>
              <span className="dot" style={{ background: st.c }} />
              <span className="small"><b>{x.label}</b> <span className="muted">{st.t}{n != null && x.ready ? ` · ในเหตุการณ์ ${n} คน` : ""}</span></span>
            </div>
          );
        })}
        <span className="grow" />
        {msg && <span className="muted xs">{msg}</span>}
        {active && <button className="btn btn-sm" onClick={refresh} disabled={busy}>{busy ? "กำลังดึง…" : "ดึงข้อมูลอีกครั้ง"}</button>}
      </div>
      {sources.some((x) => x.ready && x.last_error && (!x.last_ok_at || new Date(x.last_try_at) > new Date(x.last_ok_at))) && (
        <div className="xs" style={{ marginTop: 6, color: "#9F1239" }}>
          {sources.filter((x) => x.ready && x.last_error && (!x.last_ok_at || new Date(x.last_try_at) > new Date(x.last_ok_at))).map((x) => `${x.label}: ${x.last_error}`).join(" · ")}
        </div>
      )}
    </section>
  );
}

/** Heatmap ราย ธง (ซ้อม) / Cost Center (เหตุจริง) · เขียว = ครบ · ขาว = ยังนับไม่ครบ · แดง = มีคนขาด (ยังอยู่ในคลัง) · กดเพื่อดูรายชื่อ */
function Heatmap({ rows, real }: { rows: { k: string; name: string; done: number; total: number; inn: number; unk: number; complete: boolean; started: boolean }[]; real: boolean }) {
  const sorted = [...rows].sort((a, b) => (real ? a.k.localeCompare(b.k) : cmpFlag(a.k === "ไม่ระบุธง" ? null : a.k, b.k === "ไม่ระบุธง" ? null : b.k)));
  const isRed = (r: { complete: boolean; started: boolean }) => !r.complete && r.started;
  const green = rows.filter((r) => r.complete).length, red = rows.filter(isRed).length;
  const white = rows.length - green - red;
  const gid = (k: string) => (!real && k === "ไม่ระบุธง" ? "none" : k);
  return (
    <section className="card" style={{ padding: "14px 18px" }}>
      <div className="row" style={{ gap: 14, marginBottom: 10 }}>
        <b className="grow">ภาพรวมราย{real ? " Cost Center" : "ธง"}</b>
        <span className="row xs" style={{ gap: 4 }}><span className="hm-key hm-ok" />ครบแล้ว {green}</span>
        <span className="row xs" style={{ gap: 4 }}><span className="hm-key" />ยังไม่เริ่มนับ {white}</span>
        <span className="row xs" style={{ gap: 4 }}><span className="hm-key hm-bad" />นับแล้วแต่ยังขาด (ในคลัง / ไม่ทราบ) {red}</span>
        <span className="muted xs">กดช่องเพื่อดูรายชื่อ</span>
      </div>
      <div className="hm">
        {sorted.map((r) => {
          const cls = r.complete ? "hm-ok" : isRed(r) ? "hm-bad" : "";
          const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
          return (
            <Link key={r.k} href={`/search?g=${encodeURIComponent(gid(r.k))}`} className={`hm-c ${cls}`}
              title={`${real ? "Cost Center" : "ธง"} ${r.k}${r.name ? ` ${r.name}` : ""} · นับได้ ${r.done}/${r.total}${r.inn ? ` · ขาด (ในคลัง) ${r.inn}` : ""}${r.unk ? ` · ยังไม่ทราบ ${r.unk}` : ""}`}>
              <b className="mono">{!real && r.k === "ไม่ระบุธง" ? "?" : r.k}</b>
              {real && r.name && <span className="hm-n">{r.name}</span>}
              <span className="mono hm-v">{r.done}/{r.total}</span>
              {isRed(r) ? <span className="hm-t">ขาด {r.inn + r.unk}{r.inn ? ` · ในคลัง ${r.inn}` : ""}</span> : !r.complete && <span className="hm-bar"><span style={{ width: `${pct}%` }} /></span>}
            </Link>
          );
        })}
        {rows.length === 0 && <span className="muted small">ยังไม่มีข้อมูล</span>}
      </div>
    </section>
  );
}
