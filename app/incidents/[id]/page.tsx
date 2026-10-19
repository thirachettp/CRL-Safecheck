"use client";
import { use, useMemo, useState } from "react";
import { api, usePoll, fmtTime, STATUS_LABEL, STATUS_PILL } from "@/components/lib";
import IncidentSummary, { ModeBanner, type IncidentData } from "@/components/IncidentSummary";
import SourceBar from "@/components/SourceBar";
import AddPerson from "@/components/AddPerson";
import PresenceNote from "@/components/PresenceNote";

export default function CommanderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const d = usePoll<IncidentData>(`/api/incidents/${id}`, 3000);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [closeArmed, setCloseArmed] = useState(false);
  const [q, setQ] = useState("");

  const urgent = useMemo(() => (d.data?.people ?? []).filter((p) => p.status === "injured" || p.status === "trapped"), [d.data]);
  const pending = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d.data?.people ?? [])
      .filter((p) => p.status === "pending")
      .filter((p) => !s || [p.name, p.emp_id, p.email, p.area, p.plate, String(p.flag_no ?? "")].some((x) => (x ?? "").toLowerCase().includes(s)));
  }, [d.data, q]);

  if (d.error && !d.data) return <main className="page"><p className="notice notice-fire">{d.error}</p></main>;
  if (!d.data) return <main className="page"><p className="muted">กำลังโหลด…</p></main>;
  const inc = d.data.incident;
  const closed = !!inc.closed_at;

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const r = await api(`/api/incidents/${id}/refresh`, { method: "POST" });
      setRefreshMsg(r.added ? `เพิ่มรายชื่อใหม่ ${r.added} คน` : "ไม่มีรายชื่อใหม่");
      d.reload();
    } catch (e: any) {
      setRefreshMsg(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function close() {
    if (!closeArmed) return setCloseArmed(true);
    await api(`/api/incidents/${id}`, { method: "PATCH", json: { action: "close" } });
    setCloseArmed(false);
    d.reload();
  }

  async function mark(key: string, status: string) {
    await api(`/api/incidents/${id}/people`, { method: "PATCH", json: { person_key: key, status, by: "ผู้บัญชาการ" } });
    d.reload();
  }

  return (
    <>
      <ModeBanner data={d.data}>
        {!closed && (
          <button className="btn btn-sm" style={{ minHeight: 36, background: "rgba(255,255,255,.9)", color: "var(--ink)" }} onClick={close} onBlur={() => setCloseArmed(false)}>
            {closeArmed ? "กดอีกครั้งเพื่อยืนยันปิดเหตุการณ์" : "ปิดเหตุการณ์"}
          </button>
        )}
      </ModeBanner>
      <main className="page stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <SourceBar sources={d.data.sources} />
          {!closed && (
            <div className="row">
              {refreshMsg && <span className="muted small">{refreshMsg}</span>}
              <button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? "กำลังดึงข้อมูล…" : "ดึงข้อมูลซ้ำ"}</button>
            </div>
          )}
        </div>
        {!inc.include_plan && (
          <p className="notice notice-warn">เหตุการณ์นี้ไม่ได้รวมทุกคนในแผนอพยพ รายชื่อมีเฉพาะคนที่เช็กอินผ่านฟอร์ม</p>
        )}

        <section className="panel">
          <IncidentSummary data={d.data} />
          <p className="muted small" style={{ marginTop: 12 }}>กดธงเพื่อเปิดหน้าเช็กชื่อของธงนั้น ส่งลิงก์ให้ผู้นำธงเปิดบนมือถือได้เลย</p>
        </section>

        {urgent.length > 0 && (
          <section className="panel" style={{ borderColor: "var(--fire)" }}>
            <h2 style={{ color: "var(--fire)" }}>ต้องส่งทีมช่วยเหลือ {urgent.length} คน</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>ชื่อ</th><th>สถานะ</th><th className="r">ธง</th><th>พื้นที่ / ไซต์ล่าสุด</th><th>แจ้งโดย</th><th>เวลา</th></tr></thead>
                <tbody>
                  {urgent.map((p) => (
                    <tr key={p.person_key}>
                      <td><b>{p.name}</b> <span className="muted small">{p.emp_id ?? p.plate ?? ""}</span></td>
                      <td><span className={`pill ${STATUS_PILL[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                      <td className="r num">{p.flag_no ?? "—"}</td>
                      <td>{[p.area, p.presence_site].filter(Boolean).join(", ") || "—"}</td>
                      <td>{p.status_by ?? "—"}</td>
                      <td className="num">{fmtTime(p.status_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="page-head" style={{ marginBottom: 12 }}>
            <h2>ยังไม่ถูกนับ {d.data.people.filter((p) => p.status === "pending").length} คน</h2>
            <input type="search" placeholder="ค้นหาชื่อ รหัส ทะเบียน ธง พื้นที่" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} aria-label="ค้นหาคนที่ยังไม่ถูกนับ" />
          </div>
          {pending.length === 0 ? (
            <p className="notice notice-safe">นับครบทุกคนแล้ว</p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
              <table>
                <thead><tr><th className="r">ธง</th><th>ชื่อ</th><th>พื้นที่</th><th>ข้อมูลตำแหน่ง</th><th></th></tr></thead>
                <tbody>
                  {pending.slice(0, 400).map((p) => (
                    <tr key={p.person_key}>
                      <td className="r num"><b>{p.flag_no ?? "?"}</b></td>
                      <td>{p.name} {p.is_leader && <span className="pill pill-slate">ผู้นำธง</span>}{p.plate && <span className="pill pill-slate">{p.plate}</span>}</td>
                      <td className="small">{p.area ?? "—"}</td>
                      <td className="small"><PresenceNote p={p} /></td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        {!closed && (
                          <>
                            <button className="btn" style={{ minHeight: 34, padding: "4px 10px" }} onClick={() => mark(p.person_key, "safe")}>ปลอดภัย</button>{" "}
                            <button className="btn" style={{ minHeight: 34, padding: "4px 10px" }} onClick={() => mark(p.person_key, "absent")}>ไม่อยู่</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!closed && (
          <section className="panel">
            <h2>เพิ่มคนที่ไม่อยู่ในรายชื่อ</h2>
            <p className="muted panel-sub small">คนที่มาจริงแต่ไม่อยู่ในข้อมูลใดเลย เช่น ผู้รับเหมา ผู้มาติดต่อ</p>
            <AddPerson incidentId={id} by="ผู้บัญชาการ" onAdded={d.reload} />
          </section>
        )}
      </main>
    </>
  );
}
