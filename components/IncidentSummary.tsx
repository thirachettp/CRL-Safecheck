"use client";
import Link from "next/link";
import FlagWall, { summarize } from "./FlagWall";
import { duration, useNow } from "./lib";

export type IncidentData = {
  incident: { id: number; mode: "real" | "drill"; opened_at: string; closed_at: string | null; first_full_at: string | null; include_plan: boolean };
  people: any[];
  leaders: any[];
  sources: any[];
  now: string;
};

export function ModeBanner({ data, children }: { data: IncidentData; children?: React.ReactNode }) {
  useNow(1000);
  const i = data.incident;
  return (
    <div className={i.mode === "real" ? "mode-real" : "mode-drill"} role="status">
      <span>{i.mode === "real" ? "เหตุการณ์จริง" : "ซ้อมอพยพ ไม่ใช่เหตุการณ์จริง"} #{i.id}</span>
      <span className="num">
        {i.closed_at ? `ปิดแล้ว ใช้เวลา ${duration(i.opened_at, i.closed_at)}` : `ผ่านไป ${duration(i.opened_at)}`}
        {i.first_full_at ? `, นับครบเมื่อ ${duration(i.opened_at, i.first_full_at)}` : ""}
      </span>
      <span style={{ marginLeft: "auto" }}>{children}</span>
    </div>
  );
}

export function counts(people: any[]) {
  const c = { total: people.length, pending: 0, safe: 0, injured: 0, trapped: 0, absent: 0 };
  for (const p of people) (c as any)[p.status]++;
  return c;
}

export function GenderTable({ people }: { people: any[] }) {
  const groups = ["ชาย", "หญิง", "อื่นๆ/ไม่ระบุ"];
  const g = (p: any) => (p.gender === "ชาย" || p.gender === "หญิง" ? p.gender : "อื่นๆ/ไม่ระบุ");
  const rows = groups.map((name) => {
    const ps = people.filter((p) => g(p) === name);
    const c = counts(ps);
    return { name, ...c };
  }).filter((r) => r.total > 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>เพศ</th><th className="r">ทั้งหมด</th><th className="r">ปลอดภัย</th><th className="r">บาดเจ็บ</th><th className="r">ติดอยู่ข้างใน</th><th className="r">ไม่อยู่ในพื้นที่</th><th className="r">ยังไม่ถูกนับ</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><b>{r.name}</b></td>
              <td className="r num">{r.total}</td>
              <td className="r num">{r.safe}</td>
              <td className="r num">{r.injured}</td>
              <td className="r num">{r.trapped}</td>
              <td className="r num">{r.absent}</td>
              <td className="r num" style={{ color: r.pending ? "var(--fire)" : undefined, fontWeight: 600 }}>{r.pending}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IncidentSummary({ data, compact }: { data: IncidentData; compact?: boolean }) {
  const c = counts(data.people);
  const pct = c.total ? Math.round(((c.total - c.pending) / c.total) * 100) : 0;
  const id = data.incident.id;
  return (
    <div className="stack">
      <div className="counters">
        <div className={`counter ${c.pending ? "counter-fire" : "counter-safe"}`}>
          <b>{c.pending}</b><span>ยังไม่ถูกนับ</span>
        </div>
        <div className="counter counter-safe"><b>{c.safe}</b><span>ปลอดภัย</span></div>
        <div className="counter" style={{ color: c.injured ? "#a65e00" : undefined }}><b>{c.injured}</b><span>บาดเจ็บ</span></div>
        <div className={`counter ${c.trapped ? "counter-fire" : ""}`}><b>{c.trapped}</b><span>ติดอยู่ข้างใน</span></div>
        <div className="counter"><b>{c.absent}</b><span>ไม่อยู่ในพื้นที่</span></div>
        <div className="counter"><b>{c.total}</b><span>รายชื่อทั้งหมด</span></div>
      </div>
      <div className="bar" aria-label={`นับแล้ว ${pct}%`}>
        <span style={{ width: `${c.total ? (c.safe / c.total) * 100 : 0}%`, background: "var(--safe)" }} />
        <span style={{ width: `${c.total ? (c.absent / c.total) * 100 : 0}%`, background: "var(--slate)" }} />
        <span style={{ width: `${c.total ? ((c.injured + c.trapped) / c.total) * 100 : 0}%`, background: "var(--fire)" }} />
      </div>
      {!compact && <GenderTable people={data.people} />}
      <FlagWall
        items={summarize(data.people, data.leaders)}
        hrefFor={(f) => `/incidents/${id}/flag/${f ?? "none"}`}
      />
      {compact && (
        <div><Link className="btn btn-primary" href={`/incidents/${id}`}>เปิดหน้าผู้บัญชาการเหตุการณ์</Link></div>
      )}
    </div>
  );
}
