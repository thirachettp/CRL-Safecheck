"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import MobileShell from "@/components/MobileShell";
import PinGate from "@/components/PinGate";
import { api, usePoll, TRI } from "@/components/lib";
import { IBack, IClose } from "@/components/Icons";

const HOSPITALS = ["ปฐมพยาบาลที่จุดรวมพล"];

export default function InjuryPage() {
  const cur = usePoll<{ current: any }>("/api/incidents", 5000);
  const inc = cur.data?.current;
  return (
    <MobileShell>
      <PinGate title="ผู้บาดเจ็บ · สำหรับ Safety">
        {() => (inc?.state === "active" ? <Injury id={inc.id} mode={inc.mode} /> : (
          <div className="m-body" style={{ padding: 16 }}>
            <div className="card stack" style={{ padding: 18 }}>
              <b>ตอนนี้ไม่มีเหตุการณ์หรือการซ้อม</b>
              <p className="muted small">หน้านี้ใช้ระหว่างเหตุการณ์ คนถือธงกด “บาดเจ็บ” แล้วรายชื่อจะขึ้นที่นี่ทันที</p>
              <Link className="btn" href="/">กลับหน้าแรก</Link>
            </div>
          </div>
        ))}
      </PinGate>
    </MobileShell>
  );
}

function Injury({ id, mode }: { id: number; mode: string }) {
  const d = usePoll<{ people: any[]; points: any[] }>(`/api/incidents/${id}`, 4000);
  const blood = usePoll<{ blood: Record<string, string> }>(`/api/incidents/${id}/injury`, 15000);
  const [draft, setDraft] = useState<Record<string, { symptoms?: string; hospital?: string }>>({});
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ORD: Record<string, number> = { "": 0, black: 1, red: 2, yellow: 3, green: 4 };
  const rows = useMemo(() => (d.data?.people ?? []).filter((p) => p.status === "inj")
    .sort((a, b) => ORD[a.triage ?? ""] - ORD[b.triage ?? ""]), [d.data]);
  const n: Record<string, number> = { green: 0, yellow: 0, red: 0, black: 0 };
  let pend = 0;
  for (const r of rows) r.triage ? n[r.triage]++ : pend++;
  const pName = (c: string) => d.data?.points.find((x: any) => x.code === c)?.name ?? c;

  async function save(p: any, patch: any) {
    setErr(null);
    try {
      await api(`/api/incidents/${id}/injury`, { method: "PATCH", json: {
        person_key: p.person_key, triage: p.triage, symptoms: draft[p.person_key]?.symptoms ?? p.symptoms ?? "",
        hospital: draft[p.person_key]?.hospital ?? p.hospital ?? "", ...patch } });
      d.reload();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      <div style={{ background: "#B91C1C", color: "#fff", padding: "12px 16px 10px", position: "sticky", top: 0, zIndex: 6 }}>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <Link href="/" aria-label="กลับ" style={{ width: 36, height: 44, display: "inline-flex", alignItems: "center", color: "#fff" }}><IBack /></Link>
          <div className="grow"><b>ผู้บาดเจ็บ · สำหรับ Safety</b><div className="xs" style={{ opacity: .9 }}>เข้าด้วยรหัส Safety · {mode === "real" ? "INCIDENT จริง" : "ซ้อม"}</div></div>
          <span className="xs" style={{ fontWeight: 700, background: "#fff", color: "#B91C1C", borderRadius: 8, padding: "4px 8px" }}>{pend} รอระบุ</span>
        </div>
      </div>
      <div className="row" style={{ padding: "10px 12px", background: "#fff", borderBottom: "1px solid var(--line)", flexWrap: "nowrap" }}>
        <div className="muted xs grow">รายชื่อมาจากธง · คนถือธงกด “บาดเจ็บ” แล้วขึ้นที่นี่ทันที</div>
        <button className="lk boxed" onClick={() => setAdding(true)}>+ เพิ่มจากรายชื่อ</button>
      </div>
      <div className="m-body" style={{ gap: 10 }}>
        {err && <p className="notice err">{err}</p>}
        {rows.length === 0 && <p className="muted small" style={{ textAlign: "center", padding: 16 }}>ยังไม่มีผู้บาดเจ็บ</p>}
        {rows.map((r) => {
          const t = TRI.find((x) => x.id === r.triage);
          const bl = blood.data?.blood?.[r.person_key];
          return (
            <div key={r.person_key} className="card stack" style={{ padding: 12, gap: 10, borderLeft: `6px solid ${t ? t.dot : "#9CA3AF"}` }}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="grow">
                  <b style={{ fontSize: 15 }}>{r.name}</b> {r.gender && <span className="chip sm" style={{ background: "var(--bg)", color: "#4B5058" }}>{r.gender}</span>}
                  {bl && <span className="chip sm err" style={{ marginLeft: 4 }}>กรุ๊ปเลือด {bl}</span>}
                  <div className="muted xs">ธง {r.flag_no ?? "?"} · {r.cost_center ?? ""} {r.cc_name ?? r.area ?? ""} · {r.assembly_point ? pName(r.assembly_point) : "—"}</div>
                  <div className="muted" style={{ fontSize: 11 }}>กดบาดเจ็บโดย {r.status_by ?? "—"}</div>
                </div>
                <span className="chip sm" style={{ background: t ? t.bg : "var(--bg)", color: t ? t.fg : "#4B5058" }}>{t ? `${t.label} · ${t.name}` : "รอระบุระดับ"}</span>
              </div>
              <div>
                <div className="xs" style={{ fontWeight: 700, marginBottom: 4 }}>ระดับความรุนแรง</div>
                <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  {TRI.map((x) => {
                    const on = r.triage === x.id;
                    return (
                      <button key={x.id} className={`tri${on ? ` on-${x.id}` : ""}`} aria-pressed={on} onClick={() => save(r, { triage: on ? null : x.id })}>
                        <span className="d" style={{ background: on ? "#fff" : x.dot }} />{x.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="lb">อาการ
                <input className="in" placeholder="เช่น สูดดมควัน, แผลไฟไหม้ที่แขน" value={draft[r.person_key]?.symptoms ?? r.symptoms ?? ""}
                  onChange={(e) => setDraft({ ...draft, [r.person_key]: { ...draft[r.person_key], symptoms: e.target.value } })}
                  onBlur={() => draft[r.person_key]?.symptoms !== undefined && save(r, {})} />
              </label>
              <label className="lb">นำส่งโรงพยาบาล
                <input className="in" list="hosp" placeholder="ยังไม่นำส่ง / ชื่อโรงพยาบาล" value={draft[r.person_key]?.hospital ?? r.hospital ?? ""}
                  onChange={(e) => setDraft({ ...draft, [r.person_key]: { ...draft[r.person_key], hospital: e.target.value } })}
                  onBlur={() => draft[r.person_key]?.hospital !== undefined && save(r, {})} />
              </label>
            </div>
          );
        })}
        <datalist id="hosp">{[...new Set([...HOSPITALS, ...rows.map((r) => r.hospital).filter(Boolean)])].map((h) => <option key={h} value={h} />)}</datalist>
      </div>
      <div className="m-foot stack" style={{ gap: 6 }}>
        <div className="muted xs" style={{ textAlign: "center" }}>แดง {n.red} · ดำ {n.black} · เหลือง {n.yellow} · เขียว {n.green} · รอระบุ {pend}</div>
        <Link className="btn btn-pri btn-block" href="/dashboard">ดู Dashboard</Link>
      </div>
      {adding && <PickPerson people={(d.data?.people ?? []).filter((p) => p.status !== "inj")} onClose={() => setAdding(false)}
        onPick={async (p) => { await save(p, { triage: null }); setAdding(false); }} />}
    </>
  );
}

function PickPerson({ people, onPick, onClose }: { people: any[]; onPick: (p: any) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const list = s ? people.filter((p) => [p.name, p.emp_id, p.plate].filter(Boolean).join(" ").toLowerCase().includes(s)).slice(0, 20) : [];
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="row"><b className="grow" style={{ fontSize: 17 }}>เพิ่มผู้บาดเจ็บจากรายชื่อ</b>
          <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button></div>
        <input className="in" autoFocus placeholder="ค้นหาชื่อ รหัส ทะเบียน" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.map((p) => (
          <button key={p.person_key} className="btn" style={{ justifyContent: "flex-start" }} onClick={() => onPick(p)}>
            {p.name} <span className="muted xs">ธง {p.flag_no ?? "?"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
