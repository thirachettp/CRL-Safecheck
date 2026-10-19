"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, usePoll, fmtTime, STATUS_LABEL, STATUS_PILL, duration, useNow } from "@/components/lib";
import type { IncidentData } from "@/components/IncidentSummary";
import PresenceNote from "@/components/PresenceNote";
import AddPerson from "@/components/AddPerson";

const BUTTONS = [
  { s: "safe", label: "ปลอดภัย" },
  { s: "injured", label: "บาดเจ็บ" },
  { s: "trapped", label: "ติดอยู่ข้างใน" },
  { s: "absent", label: "ไม่อยู่ในพื้นที่" },
] as const;

/** หน้าผู้นำธง: เปิดบนมือถือที่จุดรวมพล เห็นเฉพาะคนในธงตัวเอง */
export default function FlagPage({ params }: { params: Promise<{ id: string; flag: string }> }) {
  const { id, flag } = use(params);
  const flagParam = flag === "none" ? "none" : String(Number(flag));
  const d = usePoll<IncidentData>(`/api/incidents/${id}?flag=${flagParam}`, 3000);
  const [me, setMe] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  // ผลที่กดแล้วแสดงทันที ไม่รอรอบ polling
  const [local, setLocal] = useState<Record<string, string>>({});
  useNow(1000);

  useEffect(() => {
    try { setMe(localStorage.getItem("sc_name") ?? ""); } catch {}
  }, []);
  const saveMe = (v: string) => {
    setMe(v);
    try { localStorage.setItem("sc_name", v); } catch {}
  };

  const people = useMemo(
    () => (d.data?.people ?? []).map((p) => ({ ...p, status: local[p.person_key] ?? p.status })),
    [d.data, local],
  );
  const s = q.trim().toLowerCase();
  const shown = people.filter((p) => !s || [p.name, p.emp_id, p.area, p.plate].some((x) => (x ?? "").toLowerCase().includes(s)));
  const pending = shown.filter((p) => p.status === "pending");
  const done = shown.filter((p) => p.status !== "pending");
  const leftCount = people.filter((p) => p.status === "pending").length;

  async function mark(key: string, status: string) {
    setSaving(key);
    setErr(null);
    setLocal((x) => ({ ...x, [key]: status }));
    try {
      await api(`/api/incidents/${id}/people`, { method: "PATCH", json: { person_key: key, status, by: me || `ผู้นำธง ${flag}` } });
      d.reload();
    } catch (e: any) {
      setErr(e.message);
      setLocal((x) => { const y = { ...x }; delete y[key]; return y; });
    } finally {
      setSaving(null);
    }
  }

  if (d.error && !d.data) return <main className="page"><p className="notice notice-fire">{d.error}</p></main>;
  if (!d.data) return <main className="page"><p className="muted">กำลังโหลด…</p></main>;

  const inc = d.data.incident;
  const leader = d.data.leaders.find((l: any) => String(l.flag_no) === flagParam);
  const closed = !!inc.closed_at;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className={inc.mode === "real" ? "mode-real" : "mode-drill"} style={{ padding: "6px 16px", fontSize: "0.9rem" }}>
        <span>{inc.mode === "real" ? "เหตุการณ์จริง" : "ซ้อมอพยพ"}</span>
        <span className="num">{closed ? "ปิดแล้ว" : `ผ่านไป ${duration(inc.opened_at)}`}</span>
        <Link href={`/incidents/${id}`} style={{ marginLeft: "auto" }}>ภาพรวม</Link>
      </div>
      <header className="leader-head">
        <div className="leader-flag">{flag === "none" ? "?" : flagParam}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{flag === "none" ? "ไม่ระบุธง" : leader?.leader_name ?? `ธง ${flagParam}`}</div>
          <div className="small" style={{ color: "#c9d6d0" }}>{leader ? `จุดรวมพล ${leader.assembly_point ?? "-"}, ${leader.area ?? ""}` : "คนที่จับคู่กับแผนอพยพไม่ได้"}</div>
        </div>
        <div className="leader-left">
          <b style={{ color: leftCount ? "#ffb3bf" : "#9be0bd" }}>{leftCount}</b>
          <span className="small">{leftCount ? "ยังไม่ถูกนับ" : "ครบแล้ว"}</span>
        </div>
      </header>

      <div style={{ padding: "12px 16px", display: "grid", gap: 10, background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <label className="field">ชื่อผู้เช็ก (ระบบจำไว้ในเครื่องนี้)
          <input type="text" value={me} onChange={(e) => saveMe(e.target.value)} placeholder="เช่น สุทธา" />
        </label>
        <input type="search" placeholder={`ค้นหาชื่อ รหัส หรือทะเบียนรถ ใน ${people.length} คน`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาชื่อ" />
      </div>

      {err && <p className="notice notice-fire" style={{ margin: 12 }}>บันทึกไม่สำเร็จ: {err} ลองกดอีกครั้ง</p>}

      <section aria-label="ยังไม่ถูกนับ">
        {pending.map((p) => (
          <div className="person" key={p.person_key}>
            <div className="person-top">
              <span className="person-name">{p.name} {p.is_leader && <span className="pill pill-slate">ผู้นำธง</span>}{p.plate && <span className="pill pill-slate">ทะเบียน {p.plate}</span>}</span>
              <span className="muted small">{p.gender ?? ""}</span>
            </div>
            <div className="muted small">{p.area ?? ""} {p.emp_id ? `รหัส ${p.emp_id}` : ""}{" "}<PresenceNote p={p} /></div>
            {!closed && (
              <div className="status-buttons">
                {BUTTONS.map((b) => (
                  <button key={b.s} className={`s-${b.s}`} aria-pressed={false} disabled={saving === p.person_key} onClick={() => mark(p.person_key, b.s)}>
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {pending.length === 0 && (
          <p className="notice notice-safe" style={{ margin: 16 }}>{s ? "ไม่พบชื่อที่ค้นหาในคนที่ยังไม่ถูกนับ" : "นับครบทุกคนในธงนี้แล้ว"}</p>
        )}
      </section>

      {done.length > 0 && (
        <section aria-label="นับแล้ว" style={{ marginTop: 16 }}>
          <h3 style={{ padding: "0 16px 8px" }} className="muted">นับแล้ว {done.length} คน</h3>
          {done.map((p) => (
            <ChangeRow key={p.person_key} p={p} closed={closed} onChange={(st) => mark(p.person_key, st)} />
          ))}
        </section>
      )}

      {!closed && (
        <section style={{ padding: 16 }}>
          {showAdd ? (
            <div className="panel">
              <h3 style={{ marginBottom: 10 }}>เพิ่มคนที่ไม่อยู่ในรายชื่อ</h3>
              <AddPerson incidentId={id} by={me || `ผู้นำธง ${flag}`} flag={flag === "none" ? null : Number(flag)} onAdded={() => { setShowAdd(false); d.reload(); }} />
            </div>
          ) : (
            <button className="btn btn-lg" style={{ width: "100%" }} onClick={() => setShowAdd(true)}>เพิ่มคนที่ไม่อยู่ในรายชื่อ</button>
          )}
        </section>
      )}
    </div>
  );
}

function ChangeRow({ p, closed, onChange }: { p: any; closed: boolean; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="person-done" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="person-name">{p.name}</span>
        <span className="row" style={{ gap: 8 }}>
          <span className={`pill ${STATUS_PILL[p.status]}`}>{STATUS_LABEL[p.status]}</span>
          <span className="muted small num">{fmtTime(p.status_at)}</span>
          {!closed && <button className="btn btn-ghost" style={{ minHeight: 36, padding: "2px 10px" }} onClick={() => setOpen(!open)}>{open ? "ปิด" : "แก้"}</button>}
        </span>
      </div>
      {open && (
        <div className="status-buttons">
          {[...BUTTONS, { s: "pending", label: "ยังไม่ถูกนับ" } as const].map((b) => (
            <button key={b.s} className={`s-${b.s}`} aria-pressed={p.status === b.s} onClick={() => { onChange(b.s); setOpen(false); }}>{b.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
