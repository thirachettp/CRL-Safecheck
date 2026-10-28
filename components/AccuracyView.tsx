"use client";
import Link from "next/link";
import { usePoll, fmtClock, fmtDateTime, LBL } from "./lib";

type T = { n: number; correct: number; wrong: number; open: number; accuracy: number | null; verified: number | null };
const P = (v: number | null) => (v == null ? "—" : `${v}%`);
const tone = (v: number | null) => (v == null ? "var(--muted)" : v >= 95 ? "#166534" : v >= 80 ? "#B45309" : "#B91C1C");

/** หน้าตรวจความแม่นยำ: สิ่งที่ระบบคาด (มา / ไม่มา) เทียบกับที่ผู้ใช้ยืนยันจริง */
export default function AccuracyView({ id, real }: { id: number; real: boolean }) {
  const d = usePoll<any>(`/api/incidents/${id}/accuracy`, 5000);
  if (d.error) return <div className="wrap"><p className="notice warn">{d.error}</p></div>;
  if (!d.data) return <div className="wrap"><p className="muted">กำลังโหลด…</p></div>;
  const a = d.data;
  const o: T = a.overall, ab: T = a.absent, pr: T = a.present;
  const Kpi = ({ label, big, sub, color, dashed }: { label: string; big: string; sub: React.ReactNode; color?: string; dashed?: boolean }) => (
    <div className="kpi" style={dashed ? { borderStyle: "dashed" } : undefined}>
      <div className="kpi-l">{label}</div>
      <div className="kpi-n" style={{ color }}>{big}</div>
      <div className="kpi-s">{sub}</div>
    </div>
  );
  const bar = (t: T) => (
    <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "#ECEAE4", minWidth: 120 }} title={`ถูก ${t.correct} · ผิด ${t.wrong} · ยังไม่ยืนยัน ${t.open}`}>
      <span style={{ width: `${(t.correct / (t.n || 1)) * 100}%`, background: "#16A34A" }} />
      <span style={{ width: `${(t.wrong / (t.n || 1)) * 100}%`, background: "#DC2626" }} />
    </div>
  );
  const list = (rows: any[], empty: string) => rows.length === 0 ? <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>{empty}</div> : (
    <div className="scroll-x"><table className="tbl">
      <thead><tr><th>ชื่อ</th><th>{real ? "Cost Center" : "ธง"}</th><th>ระบบคาดจาก</th><th>ผลจริง</th><th>ยืนยันโดย</th></tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p.person_key}>
          <td><b>{p.name}</b><div className="muted xs mono">{p.emp_id ?? ""}</div></td>
          <td className="mono">{real ? p.cost_center ?? "—" : p.flag_no ?? "—"}</td>
          <td className="small">{p.note ?? (p.here ? "ไม่มีข้อมูล (ถือว่าอยู่)" : "—")}</td>
          <td><span className={`chip sm s-${p.status}`}>{LBL[p.status] ?? p.status}</span></td>
          <td className="small">{p.status_by ?? "—"}{p.status_at && <div className="muted xs">{fmtClock(p.status_at).slice(0, 5)}</div>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
  return (
    <div className="wrap">
      <div className="kpis">
        <Kpi label="ระบบคาดถูก" big={P(o.accuracy)} color={tone(o.accuracy)} sub={<>ถูก {o.correct} · ผิด {o.wrong} จากที่ยืนยันแล้ว {o.correct + o.wrong} คน</>} />
        <Kpi label="ยืนยันแล้ว" big={P(o.verified)} sub={<>{o.correct + o.wrong} / {o.n} คน · ยังไม่ยืนยัน {o.open}</>} />
        <Kpi label="คาดว่าไม่อยู่ (ปลอดภัยตามระบบ)" big={P(ab.accuracy)} color={tone(ab.accuracy)}
          sub={<>ยืนยันไม่อยู่จริง {ab.correct} · <b style={{ color: ab.wrong ? "#B91C1C" : undefined }}>จริงๆ อยู่ {ab.wrong}</b> · รอ {ab.open}</>} />
        <Kpi label="คาดว่าอยู่ (ต้องนับ)" big={P(pr.accuracy)} color={tone(pr.accuracy)}
          sub={<>เจอตัว/ยืนยัน {pr.correct} · จริงๆ ไม่อยู่ {pr.wrong} · ยังไม่ทราบ {pr.open}</>} />
        <Kpi label="ระบบไม่มีในรายชื่อ" big={`${a.missed.n}`} dashed sub={<>คนที่ต้องเพิ่มเองระหว่าง{real ? "เหตุ" : "ซ้อม"}{a.missed.pct != null ? ` · ${a.missed.pct}% ของทั้งหมด` : ""}</>} />
      </div>

      <section className="card" style={{ padding: "12px 18px" }}>
        <b>เกณฑ์ที่ใช้วัด</b>
        <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>คาดว่าไม่อยู่ → ถูก</b> เมื่อมีคนกด “ไม่อยู่จริง” · <b style={{ color: "#B91C1C" }}>ผิด</b> เมื่อคนนั้นถูกพบ (ปลอดภัย / บาดเจ็บ / ในคลัง / กองอำนวยการ) — สำคัญที่สุด เพราะถ้าไม่มีใครตรวจ คนนั้นจะถูกมองข้าม</li>
          <li><b>คาดว่าอยู่ → ถูก</b> เมื่อเจอตัวหรือมีคนยืนยันสถานะ · <b>ผิด</b> เมื่อกด “ไม่อยู่จริง” (เสียเวลาตามหา)</li>
          <li><b>ยังไม่ยืนยัน</b> ไม่นับใน % ถูก แต่ดูที่ “ยืนยันแล้ว” · <b>ระบบไม่มีในรายชื่อ</b> = คนที่ต้องเพิ่มเอง</li>
          <li>แยกตาม “ระบบคาดจาก” เพื่อดูว่าแหล่งไหนเชื่อได้ (ตรวจทานธง / DIV+ / Outsource / KIOS / ไม่มีข้อมูล)</li>
        </ul>
      </section>

      <section className="card">
        <div className="card-h">แยกตามที่ระบบใช้ตัดสิน</div>
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>ระบบคาดจาก</th><th>คน</th><th>ถูก</th><th>ผิด</th><th>ยังไม่ยืนยัน</th><th>ความแม่นยำ</th><th /></tr></thead>
          <tbody>{a.byBasis.map((b: any) => (
            <tr key={b.key}>
              <td>{b.label}</td><td className="mono">{b.n}</td><td className="mono" style={{ color: "#166534" }}>{b.correct}</td>
              <td className="mono" style={{ color: b.wrong ? "#B91C1C" : undefined, fontWeight: b.wrong ? 700 : 400 }}>{b.wrong}</td>
              <td className="mono muted">{b.open}</td><td className="mono" style={{ color: tone(b.accuracy), fontWeight: 700 }}>{P(b.accuracy)}</td><td>{bar(b)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      {a.staff ? (
        <div className="g2">
          <section className="card" style={{ alignSelf: "start", borderColor: a.danger.length ? "#FCA5A5" : undefined }}>
            <div className="card-h" style={{ color: a.danger.length ? "#B91C1C" : undefined }}>ระบบบอกไม่อยู่ แต่จริงๆ อยู่ ({a.danger.length})</div>
            {list(a.danger, "ไม่มี · ระบบไม่ได้มองข้ามใคร")}
          </section>
          <section className="card" style={{ alignSelf: "start" }}>
            <div className="card-h">ระบบบอกอยู่ แต่จริงๆ ไม่อยู่ ({a.wasted.length})</div>
            {list(a.wasted, "ไม่มี")}
          </section>
          <section className="card" style={{ alignSelf: "start" }}>
            <div className="card-h">ระบบไม่มีในรายชื่อ ต้องเพิ่มเอง ({a.missed.n})</div>
            {list(a.missed.people, "ไม่มี")}
          </section>
          <section className="card" style={{ alignSelf: "start" }}>
            <div className="card-h">{real ? "Cost Center" : "ธง"}ที่ระบบคาดผิดมากที่สุด</div>
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>{real ? "Cost Center" : "ธง"}</th><th>คน</th><th>ผิด</th><th>ยังไม่ยืนยัน</th><th>ความแม่นยำ</th></tr></thead>
              <tbody>{a.byGroup.filter((g: any) => g.wrong > 0 || g.open > 0).slice(0, 10).map((g: any) => (
                <tr key={g.key}><td className="mono">{g.key}</td><td className="mono">{g.n}</td><td className="mono" style={{ color: g.wrong ? "#B91C1C" : undefined }}>{g.wrong}</td>
                  <td className="mono muted">{g.open}</td><td className="mono" style={{ color: tone(g.accuracy) }}>{P(g.accuracy)}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        </div>
      ) : <p className="muted small">รายชื่อคนที่ระบบคาดผิด เห็นเฉพาะ Admin / Safety</p>}

      <section className="card">
        <div className="card-h">ย้อนหลัง (ซ้อมและเหตุจริง)</div>
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>เหตุการณ์</th><th>เมื่อ</th><th>คน</th><th>ถูก</th><th>ผิด</th><th>บอกไม่อยู่แต่อยู่</th><th>เพิ่มเอง</th><th>ความแม่นยำ</th></tr></thead>
          <tbody>{a.history.map((h: any) => (
            <tr key={h.id} style={h.id === id ? { background: "#F0F9FF" } : undefined}>
              <td><Link href={`/dashboard?id=${h.id}`}><span className="chip sm" style={h.mode === "real" ? { background: "#FEE2E2", color: "#991B1B" } : { background: "#FEF3C7", color: "#78350F" }}>{h.mode === "real" ? "จริง" : "ซ้อม"}</span> {h.kind ?? h.title ?? `#${h.id}`}</Link></td>
              <td className="small">{fmtDateTime(h.opened_at)}</td><td className="mono">{h.n}</td><td className="mono">{h.correct}</td><td className="mono">{h.wrong}</td>
              <td className="mono" style={{ color: h.danger ? "#B91C1C" : undefined, fontWeight: h.danger ? 700 : 400 }}>{h.danger}</td><td className="mono">{h.missed}</td>
              <td className="mono" style={{ color: tone(h.accuracy), fontWeight: 700 }}>{P(h.accuracy)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
