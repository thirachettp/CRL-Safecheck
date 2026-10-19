"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PcHeader from "@/components/PcHeader";
import { useAdmin } from "@/components/identity";
import { api, usePoll, fmtClock, fmtDateTime, duration, useNow, LBL, EVAC, inPool, TRI } from "@/components/lib";
import { IClock } from "@/components/Icons";

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
  const list = usePoll<{ current: any; incidents: any[] }>("/api/incidents", 5000);
  const cur = list.data?.current;
  const id = qid ? Number(qid) : cur?.state === "active" ? cur.id : null;
  if (!list.data) return <div className="wrap"><p className="muted">กำลังโหลด…</p></div>;
  if (id) return <IncidentDash id={id} />;
  const past = list.data.incidents.filter((i) => i.state === "closed");
  return (
    <div className="wrap">
      <div className="card stack" style={{ padding: 20 }}>
        <h1 style={{ fontSize: 24 }}>{cur?.state === "pending" ? "มีการแจ้งเหตุ รอยืนยัน" : "ไม่มีเหตุการณ์หรือการซ้อมตอนนี้"}</h1>
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
  const now = useNow(1000);

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
      const at = complete ? done.reduce((mx, p) => (p.status_at && p.status_at > mx ? p.status_at : mx), "") : "";
      return { k, name: real ? mem[0]?.cc_name ?? "" : "", pts: [...new Set(mem.map((p) => effPoint(p.assembly_point)))].join(", "),
        done: done.length, total: mem.length, inn, unk, complete, at };
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
  const elapsedMs = new Date(inc.first_full_at ?? (inc.closed_at ?? new Date(now).toISOString())).getTime() - new Date(inc.opened_at).getTime();
  const over = elapsedMs > target * 1000;
  const completeGroups = m.rows.filter((r) => r.complete).length;
  const lastAt = inc.first_full_at;
  const C = 2 * Math.PI * 44;
  const codes: any[] = d.data.codes ?? [];
  const anns: any[] = d.data.announcements ?? [];

  return (
    <>
      <div style={{ background: real ? "#B91C1C" : "#FCD34D", color: real ? "#fff" : "#422006" }}>
        <div className="row" style={{ maxWidth: 1440, margin: "0 auto", padding: "12px 32px", gap: 16 }}>
          <span className="chip" style={{ background: real ? "#fff" : "#422006", color: real ? "#B91C1C" : "#FCD34D", fontSize: 13, padding: "5px 12px" }}>{real ? "INCIDENT จริง" : "ซ้อม · DRILL"}</span>
          <b style={{ fontSize: 18 }}>{real ? `${inc.kind ?? ""} ${inc.area ?? ""} · ยืนยันโดย ${inc.confirmed_by ?? "—"}` : `${inc.title ?? "ซ้อมอพยพ"}${inc.plan_version ? ` · ชุดธง v${inc.plan_version}` : ""}`}</b>
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

      {ask && (
        <form onSubmit={submitPin} className="row" style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}>
          <b>ใส่รหัส Admin / Safety Officer</b>
          <input className="in mono" style={{ width: 160, marginTop: 0 }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus aria-label="รหัส" />
          <button className="btn btn-pri btn-sm" type="submit">ยืนยัน</button><button className="btn btn-sm" type="button" onClick={() => setAsk(null)}>ยกเลิก</button>
        </form>
      )}
      {err && <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}><p className="notice warn">{err}</p></div>}

      <div className="wrap">
        <div className="g3">
          <section className="card stack" style={{ padding: 18, gap: 10 }}>
            <div className="muted small" style={{ fontWeight: 700 }}>ฐานข้อมูล · คนทั้งหมด (snapshot)</div>
            <div className="row" style={{ alignItems: "baseline", gap: 8 }}><span className="mono" style={{ fontSize: 56, fontWeight: 700, lineHeight: 1 }}>{m.pool.length}</span><span style={{ fontSize: 18 }}>คน</span></div>
            <div className="row" style={{ gap: 16, fontSize: 14 }}><span>ชาย <b className="mono">{m.g(m.pool, "ชาย")}</b></span><span>หญิง <b className="mono">{m.g(m.pool, "หญิง")}</b></span>
              {m.pool.length - m.g(m.pool, "ชาย") - m.g(m.pool, "หญิง") > 0 && <span className="muted">ไม่ระบุ <b className="mono">{m.pool.length - m.g(m.pool, "ชาย") - m.g(m.pool, "หญิง")}</b></span>}</div>
            <div className="muted xs" style={{ border: "1px dashed #9CA3AF", borderRadius: 10, padding: "8px 10px", marginTop: "auto" }}>
              ปลอดภัยตามระบบ (ไม่นับใน %) <b style={{ color: "var(--ink)" }}>{m.absAll}</b> · รอยืนยัน {m.absPend}</div>
          </section>

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
              const flagsHere = [...new Set(x.total.map((y) => y.flag_no).filter((f) => f != null))].sort((a, b) => a - b);
              return (
                <div key={k} className="stack" style={{ gap: 4, padding: "8px 0", borderTop: "1px solid var(--line-3)" }}>
                  <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "nowrap" }}>
                    <b className="grow">{k === "ไม่ระบุจุด" ? k : pName(k)}</b><span className="mono" style={{ fontWeight: 600 }}>{x.evac.length} / {x.total.length} คน</span>
                    <span className="mono muted" style={{ width: 44, textAlign: "right" }}>{p}%</span></div>
                  <div className="bar"><div style={{ width: `${p}%`, background: "#1F3A5F" }} /></div>
                  <div className="muted xs">ชาย <b style={{ color: "var(--ink)" }}>{m.g(x.evac, "ชาย")}</b> · หญิง <b style={{ color: "var(--ink)" }}>{m.g(x.evac, "หญิง")}</b>
                    {!real && flagsHere.length > 0 && ` · ธง ${flagsHere.length > 6 ? `${flagsHere[0]}–${flagsHere[flagsHere.length - 1]}` : flagsHere.join(", ")}`}</div>
                </div>
              );
            })}
            <div className="stack" style={{ gap: 4, padding: "8px 0", borderTop: "1px solid var(--line-3)" }}>
              <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "nowrap" }}><b className="grow">กองอำนวยการกลาง</b><span className="mono" style={{ fontWeight: 600 }}>{m.cmd.length} คน</span></div>
              <div className="muted xs">ชาย <b style={{ color: "var(--ink)" }}>{m.g(m.cmd, "ชาย")}</b> · หญิง <b style={{ color: "var(--ink)" }}>{m.g(m.cmd, "หญิง")}</b> · นับเป็นอพยพแล้ว</div>
            </div>
          </section>

          <section className="card stack" style={{ padding: 18, gap: 12 }}>
            <div className="muted small" style={{ fontWeight: 700 }}>Summary HC · นับได้จริงเทียบฐานข้อมูล</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
              <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12 }}><div className="muted xs" style={{ fontWeight: 600 }}>นับได้จริง</div>
                <div className="mono" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{m.evac.length}</div><div className="muted xs">จาก {m.pool.length} คน</div></div>
              <div className="stack" style={{ background: "var(--bg)", borderRadius: 12, padding: 12, justifyContent: "center", gap: 4, fontSize: 14 }}>
                <div>ชาย <b className="mono" style={{ fontSize: 18 }}>{m.g(m.evac, "ชาย")}</b> <span className="muted">/ {m.g(m.pool, "ชาย")}</span></div>
                <div>หญิง <b className="mono" style={{ fontSize: 18 }}>{m.g(m.evac, "หญิง")}</b> <span className="muted">/ {m.g(m.pool, "หญิง")}</span></div></div>
              <div style={{ background: "#FEF2F2", border: "2px solid #B91C1C", borderRadius: 12, padding: 12, color: "#991B1B" }}>
                <div className="xs" style={{ fontWeight: 700 }}>ผู้สูญหาย</div><div className="mono" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{m.missing.length}</div>
                <div className="xs">ยังไม่ทราบ {m.missing.filter((p) => p.status === "unk").length} · ในคลัง {m.missing.filter((p) => p.status === "in").length}</div></div>
              <div style={{ background: "#FFF1F2", borderRadius: 12, padding: 12, color: "#881337" }}>
                <div className="xs" style={{ fontWeight: 700 }}>ผู้บาดเจ็บ</div><div className="mono" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{m.inj.length}</div>
                <div className="xs">นับรวมในยอดนับได้แล้ว</div></div>
            </div>
          </section>
        </div>

        <section className="card row" style={{ padding: "14px 18px", gap: 20, borderColor: over ? "#B91C1C" : "#14532D" }}>
          <div className="row" style={{ gap: 10 }}><IClock size={22} color={over ? "#B91C1C" : "#14532D"} /><b>เวลานับรายชื่อ</b><span className="muted small">เป้า {duration(new Date(0).toISOString(), new Date(target * 1000).toISOString())} นาที</span></div>
          <div className="small">{real ? "คนแรกยืนยัน" : "ยืนยันคนแรก"} <b className="mono">{m.firstDone ? fmtClock(m.firstDone) : "—"}</b></div>
          <div className="small">นับครบ <b className="mono">{lastAt ? fmtClock(lastAt) : "—"}</b>{!lastAt && m.rows.length - completeGroups > 0 && <span className="muted"> รอ {m.rows.length - completeGroups} {real ? "CC" : "ธง"}</span>}</div>
          <div className="small">{real ? "Cost Center" : "ธง"}ครบ <b>{completeGroups}</b> / {m.rows.length}</div>
          <div className="grow" />
          <div className="row" style={{ alignItems: "baseline", gap: 8, color: over ? "#B91C1C" : "#14532D" }}>
            <span className="mono" style={{ fontSize: 30, fontWeight: 700 }}>{duration(inc.opened_at, inc.first_full_at ?? (inc.closed_at ?? new Date(now).toISOString()))}</span>
            <span className="small" style={{ fontWeight: 700 }}>{over ? `เกินเป้า ${duration(new Date(0).toISOString(), new Date(elapsedMs - target * 1000).toISOString())}` : lastAt ? "นับครบในเป้า" : "ยังอยู่ในเป้า"}</span>
          </div>
        </section>

        <div className="g2">
          <section className="card">
            <div className="card-h"><span className="grow">รายชื่อผู้สูญหาย</span><span className="chip" style={{ background: "#FEE2E2", color: "#991B1B" }}>{m.missing.length} คน</span></div>
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>#</th><th>ชื่อ-นามสกุล</th><th>แผนก</th><th>{real ? "Cost Center" : "ธง"}</th><th>จุดรวมพล</th><th>สถานะ</th></tr></thead>
              <tbody>
                {m.missing.length === 0 && <tr><td colSpan={6} className="muted">ไม่มี</td></tr>}
                {m.missing.slice(0, 100).map((p, i) => (
                  <tr key={p.person_key}>
                    <td className="mono">{i + 1}</td><td><b>{p.name}</b>{p.plate && <div className="muted xs">{p.plate}</div>}</td>
                    <td>{p.cc_name ?? p.area ?? "—"}</td><td className="mono">{real ? p.cost_center ?? "—" : p.flag_no != null ? `ธง ${p.flag_no}` : "—"}</td>
                    <td>{p.assembly_point ? pName(effPoint(p.assembly_point)) : "—"}</td>
                    <td><span className={`chip s-${p.status}`}>{LBL[p.status]}</span>{p.status_note && <div className="muted xs" style={{ marginTop: 2 }}>{p.status_note}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {m.missing.length > 100 && <div className="muted xs" style={{ padding: "10px 18px" }}>แสดง 100 จาก {m.missing.length} คน</div>}
          </section>
          <section className="card" style={{ paddingBottom: 8 }}>
            <div className="card-h"><span className="grow">รายชื่อผู้ได้รับบาดเจ็บ</span><span className="muted xs" style={{ fontWeight: 500 }}>Safety ระบุระดับ · อาการ · รพ.</span></div>
            {[TRI[2], TRI[3], TRI[1], TRI[0], null].map((t) => {
              const rows = m.inj.filter((p) => (t ? p.triage === t.id : !p.triage));
              return (
                <div key={t?.id ?? "pend"}>
                  <div className="row" style={{ gap: 8, padding: "10px 18px 6px", fontWeight: 700, fontSize: 13, color: t ? t.fg : "#4B5058", flexWrap: "nowrap" }}>
                    <span className="dot" style={{ width: 12, height: 12, background: t ? t.dot : "#9CA3AF" }} />{t ? `${t.label} · ${t.name}` : "รอ Safety ระบุระดับ"}
                    <span className="mono" style={{ marginLeft: "auto" }}>{rows.length}</span></div>
                  <table className="tbl"><thead><tr><th style={{ width: "24%" }}>ชื่อ-นามสกุล</th><th style={{ width: "20%" }}>แผนก</th><th style={{ width: "14%" }}>จุดรวมพล</th><th>อาการ</th><th style={{ width: "20%" }}>รพ.ที่นำส่ง</th></tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={5} className="muted">ไม่มี</td></tr>}
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

        <div className="g2">
          <section className="card">
            <div className="card-h"><span className="grow">แยกตาม{real ? " Cost Center" : "ธง"} · ไม่ครบขึ้นก่อน</span><span className="muted xs" style={{ fontWeight: 500 }}>ไม่ครบ (แดง) = มีคนยังไม่ทราบ หรือยังอยู่ในคลัง</span></div>
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>{real ? "Cost Center" : "ธง"}</th><th>จุดรวมพล</th><th>นับได้</th><th>ในคลัง</th><th>ไม่ทราบ</th><th>เวลาครบ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.k} className={r.complete ? "" : "bad"}>
                    <td><b className="mono">{r.k}</b> {r.name && <span className="muted">{r.name}</span>}</td>
                    <td className="small">{r.pts.split(", ").map((c) => (c === "ไม่ระบุจุด" ? c : pName(c))).join(", ")}</td>
                    <td className="mono">{r.done} / {r.total}</td><td className="mono">{r.inn || "–"}</td><td className="mono" style={{ fontWeight: 700 }}>{r.unk || "–"}</td>
                    <td className="mono">{r.complete && r.at ? fmtClock(r.at) : "—"}</td>
                    <td><span className="chip" style={r.complete ? { background: "#DCFCE7", color: "#14532D" } : { background: "#FEE2E2", color: "#991B1B" }}>{r.complete ? "ครบ" : "ไม่ครบ"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>นับได้ รวมคนที่อยู่กองอำนวยการกลาง</div>
          </section>
          <section className="card" style={{ alignSelf: "start" }}>
            <div className="card-h">สรุปการประกาศสถานการณ์ฉุกเฉิน</div>
            {anns.map((a) => (
              <div key={a.id} className="row" style={{ gap: 12, padding: "10px 18px", borderTop: "1px solid var(--line-3)", flexWrap: "nowrap" }}>
                <span className="mono" style={{ fontWeight: 600, width: 64 }}>{fmtClock(a.at).slice(0, 5)}</span>
                <span className={`chip ${a.tone ?? "grey"}`} style={{ fontSize: 13 }}>{a.label}</span>
                <span className="muted small grow">{a.meaning ?? ""}</span><span className="muted xs">โดย {a.by_name ?? "—"}</span>
              </div>
            ))}
            {codes.filter((c) => !anns.some((a) => a.code_id === c.id)).map((c) => (
              <div key={c.id} className="row" style={{ gap: 12, padding: "10px 18px", borderTop: "1px solid var(--line-3)", flexWrap: "nowrap" }}>
                <span className="mono" style={{ fontWeight: 600, width: 64 }}>—</span><span className="chip grey" style={{ fontSize: 13, color: "#4B5058" }}>{c.label}</span>
                <span className="muted small grow">ยังไม่ประกาศ</span>
              </div>
            ))}
            {active && (
              <div className="row" style={{ padding: "12px 18px", borderTop: "1px solid var(--line-3)", gap: 8, background: "var(--subtle)", borderRadius: "0 0 14px 14px" }}>
                <span className="muted xs" style={{ width: "100%" }}>บันทึกประกาศ (Safety / Admin เท่านั้น) · เวลาบันทึกอัตโนมัติ</span>
                {codes.map((c) => (
                  <button key={c.id} className="btn btn-sm" onClick={() => withPin(async () => { await api(`/api/incidents/${id}/announce`, { method: "POST", json: { code_id: c.id } }); d.reload(); })}>+ {c.label}</button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
