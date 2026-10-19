"use client";
import Link from "next/link";
import { usePoll, fmtDateTime, duration } from "@/components/lib";
import IncidentSummary, { ModeBanner, type IncidentData } from "@/components/IncidentSummary";
import SourceBar, { type SourceState } from "@/components/SourceBar";

export default function Dashboard() {
  const list = usePoll<{ incidents: any[] }>("/api/incidents", 5000);
  const plan = usePoll<any>("/api/plan", 0);
  const src = usePoll<{ states: SourceState[] }>("/api/sources", 15000);
  const open = (list.data?.incidents ?? []).filter((i) => !i.closed_at);
  const drills = (list.data?.incidents ?? []).filter((i) => i.mode === "drill" && i.closed_at).slice(0, 6);

  return (
    <>
      {open.map((i) => <ActiveIncident key={i.id} id={i.id} />)}
      <main className="page stack">
        {list.error && <p className="notice notice-fire">{list.error}</p>}
        {open.length === 0 && (
          <div className="page-head">
            <div>
              <h1>พร้อมรับเหตุ</h1>
              <p className="muted">ไม่มีเหตุการณ์เปิดอยู่ เมื่อเกิดเหตุ เปิดเหตุการณ์ได้จากเมนูเหตุการณ์</p>
            </div>
            <Link href="/incidents" className="btn btn-fire btn-lg">เปิดเหตุการณ์</Link>
          </div>
        )}

        {src.data && (
          <section className="stack" style={{ gap: 8 }}>
            <h2>ความสดของข้อมูล</h2>
            <SourceBar sources={src.data.states} />
          </section>
        )}

        <div className="grid-2">
          <section className="panel">
            <h2>แผนอพยพ</h2>
            {!plan.data ? <p className="muted">กำลังโหลด…</p> : plan.data.total === 0 ? (
              <p className="notice notice-warn">ยังไม่มีแผนอพยพ <Link href="/setup">นำเข้าไฟล์ธง</Link></p>
            ) : (
              <div className="stack">
                <div className="counters">
                  <div className="counter"><b>{plan.data.total}</b><span>คนในแผน</span></div>
                  <div className="counter"><b>{plan.data.flags.filter((f: any) => f.flag_no != null).length}</b><span>ธง</span></div>
                  <div className="counter"><b>{plan.data.flags.reduce((a: number, f: any) => a + f.male, 0)}</b><span>ชาย</span></div>
                  <div className="counter"><b>{plan.data.flags.reduce((a: number, f: any) => a + f.female, 0)}</b><span>หญิง</span></div>
                </div>
                <p className="muted small">อัปเดตล่าสุด {fmtDateTime(plan.data.updated_at)} จาก {plan.data.files} ไฟล์</p>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>ผลการซ้อมล่าสุด</h2>
            {drills.length === 0 ? (
              <p className="muted">ยังไม่มีการซ้อมที่ปิดแล้ว <Link href="/setup">เริ่มซ้อม</Link></p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>วันที่</th><th className="r">คน</th><th className="r">นับครบใน</th><th className="r">ค้าง</th></tr></thead>
                  <tbody>
                    {drills.map((d) => (
                      <tr key={d.id}>
                        <td><Link href={`/incidents/${d.id}`}>{fmtDateTime(d.opened_at)}</Link></td>
                        <td className="r num">{d.total}</td>
                        <td className="r num" style={{ color: d.first_full_at && new Date(d.first_full_at).getTime() - new Date(d.opened_at).getTime() <= 15 * 60000 ? "var(--safe)" : "var(--fire)" }}>
                          {d.first_full_at ? duration(d.opened_at, d.first_full_at) : "ไม่ครบ"}
                        </td>
                        <td className="r num">{d.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted small" style={{ marginTop: 8 }}>เป้าหมาย: นับครบภายใน 15 นาที</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function ActiveIncident({ id }: { id: number }) {
  const d = usePoll<IncidentData>(`/api/incidents/${id}`, 3000);
  if (!d.data) return null;
  return (
    <>
      <ModeBanner data={d.data}><Link href={`/incidents/${id}`}>หน้าผู้บัญชาการ</Link></ModeBanner>
      <div className="page" style={{ paddingBottom: 0 }}>
        <section className="panel">
          <IncidentSummary data={d.data} compact />
        </section>
      </div>
    </>
  );
}
