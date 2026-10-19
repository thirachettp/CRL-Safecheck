"use client";
import { useRef, useState } from "react";
import { api, usePoll, fmtDateTime, ago } from "@/components/lib";
import SourceBar, { type SourceState } from "@/components/SourceBar";

type Data = {
  states: SourceState[];
  sites: { site: string; n: number }[];
  recent: { response_id: string; email: string; full_name: string | null; gender: string | null; site: string | null; submitted_at: string; via: string }[];
  graph: boolean;
};

const VIA: Record<string, string> = { graph: "SharePoint", xlsx: "Excel", test: "ทดสอบ", push: "Power Automate" };

export default function SourcesPage() {
  const d = usePoll<Data>("/api/sources", 10000);
  const div = d.data?.states.find((s) => s.key === "div");
  return (
    <main className="page stack">
      <div className="page-head">
        <div>
          <h1>แหล่งข้อมูล</h1>
          <p className="muted">ใครอยู่ในพื้นที่ตอนนี้ มาจาก 4 แหล่ง Phase 1 เริ่มที่ MS Form</p>
        </div>
      </div>
      {d.error && <p className="notice notice-fire">{d.error}</p>}
      {d.data && <SourceBar sources={d.data.states} />}

      <section className="panel stack">
        <div>
          <h2>DIV+ และอื่นๆ (MS Form)</h2>
          <p className="muted small">
            ฟอร์มเช็กอิน → Power Automate เขียนลง SharePoint List → แอพดึงทุก 15 นาที และดึงซ้ำทันทีเมื่อเปิดเหตุการณ์ ระบบอนุมานเข้า/ออกเอง
            (ซ้ำใน 10 นาทีนับครั้งเดียว, ส่งครั้งที่สอง = ออก, ต่างไซต์ = ย้ายไซต์, ครบ 14 ชม. = ออกอัตโนมัติ)
          </p>
        </div>
        <div className="grid-2">
          <GraphSync configured={!!d.data?.graph} lastError={div?.last_error ?? null} onDone={d.reload} />
          <ExcelUpload onDone={d.reload} />
        </div>
        <TestCheckin sites={d.data?.sites.map((s) => s.site) ?? []} onDone={d.reload} />
      </section>

      <section className="panel">
        <h2>เช็กอินล่าสุด</h2>
        <p className="muted panel-sub small">
          {d.data?.sites.length ? `ไซต์ที่พบ: ${d.data.sites.map((s) => `${s.site} (${s.n})`).join(", ")}` : "ยังไม่มีข้อมูลเช็กอิน"}
        </p>
        {!!d.data?.recent.length && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>เวลาส่ง</th><th>ชื่อ</th><th>อีเมล</th><th>เพศ</th><th>ไซต์</th><th>มาจาก</th></tr></thead>
              <tbody>
                {d.data.recent.map((r) => (
                  <tr key={r.response_id}>
                    <td className="num">{fmtDateTime(r.submitted_at)} <span className="muted small">({ago(r.submitted_at)})</span></td>
                    <td>{r.full_name ?? "—"}</td>
                    <td className="small">{r.email}</td>
                    <td>{r.gender ?? "—"}</td>
                    <td>{r.site ?? "—"}</td>
                    <td><span className="pill pill-slate">{VIA[r.via] ?? r.via}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DriverPanel onDone={d.reload} />

      <section className="panel">
        <h2>แหล่งที่ยังไม่เชื่อมในต้นแบบนี้</h2>
        <p className="muted small">
          Fulltime (Cnext) และ Outsource (Power Apps) จะเสียบเข้าท่อเดียวกันใน Phase ถัดไป ระหว่างนี้เหตุการณ์จะรวมทุกคนในแผนอพยพไว้ก่อน
          เพื่อไม่ให้มีใครตกหล่นจากรายชื่อ
        </p>
      </section>
    </main>
  );
}

function GraphSync({ configured, lastError, onDone }: { configured: boolean; lastError: string | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  async function run() {
    setBusy(true);
    try {
      const r = await api("/api/sources/div/sync", { method: "POST" });
      setMsg({ kind: r.ok ? "safe" : "warn", text: r.message });
      onDone();
    } catch (e: any) {
      setMsg({ kind: "fire", text: e.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3>ดึงจาก SharePoint List</h3>
      <p className="muted small">
        {configured
          ? "เชื่อมแล้ว กดเพื่อดึงแถวใหม่ทันที (ปกติ cron ดึงให้ทุก 15 นาที)"
          : "ยังไม่ได้ตั้งค่า รอ app registration แบบ Sites.Selected จาก IT แล้วใส่ค่า MS_* และ SP_* ใน Vercel"}
      </p>
      <div><button className="btn btn-primary" onClick={run} disabled={busy || !configured}>{busy ? "กำลังดึง…" : "ดึงข้อมูลตอนนี้"}</button></div>
      {msg ? <p className={`notice notice-${msg.kind}`}>{msg.text}</p> : configured && lastError ? <p className="notice notice-warn">{lastError}</p> : null}
    </div>
  );
}

function ExcelUpload({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  async function upload(file: File) {
    try {
      const XLSX = await import("xlsx");
      const { parseFormWorkbook } = await import("@/lib/parsers");
      const { rows, issues } = parseFormWorkbook(XLSX.read(await file.arrayBuffer(), { type: "array" }));
      if (!rows.length) return setMsg({ kind: "warn", text: issues[0] ?? "ไม่พบแถวคำตอบในไฟล์" });
      const batchId = `xlsx-${file.name}-${file.size}-${file.lastModified}`;
      const r = await api("/api/sources/div/upload", { method: "POST", json: { rows, batchId } });
      setMsg({
        kind: r.duplicateBatch ? "warn" : "safe",
        text: r.duplicateBatch ? "ไฟล์นี้เคยนำเข้าแล้ว ไม่มีอะไรเปลี่ยน" : `อ่านได้ ${rows.length} แถว เป็นแถวใหม่ ${r.inserted} แถว${issues.length ? ` (ข้าม ${issues.length} แถวที่อ่านไม่ได้)` : ""}`,
      });
      onDone();
    } catch (e: any) {
      setMsg({ kind: "fire", text: e.message });
    }
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3>นำเข้า Excel ของฟอร์ม</h3>
      <p className="muted small">ทางสำรองระหว่างรอ IT ดาวน์โหลดไฟล์ Check (In-Out) ที่ sync กับฟอร์มแล้วนำเข้า แถวที่มีอยู่แล้วจะถูกข้าม</p>
      <div><button className="btn" onClick={() => input.current?.click()}>เลือกไฟล์ Excel</button></div>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {msg && <p className={`notice notice-${msg.kind}`}>{msg.text}</p>}
    </div>
  );
}

function TestCheckin({ sites, onDone }: { sites: string[]; onDone: () => void }) {
  const [f, setF] = useState({ email: "", name: "", gender: "หญิง", site: "", at: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try {
      // datetime-local ไม่มีโซนเวลา ถือว่าเป็นเวลาไทย
      const at = f.at ? new Date(`${f.at}:00+07:00`).toISOString() : undefined;
      await api("/api/sources/div/test", { method: "POST", json: { ...f, at } });
      setMsg({ kind: "safe", text: `บันทึกการส่งฟอร์มของ ${f.email} แล้ว` });
      onDone();
    } catch (err: any) {
      setMsg({ kind: "fire", text: err.message });
    }
  }
  return (
    <form onSubmit={send} className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
      <div>
        <h3>จำลองคนส่งฟอร์ม</h3>
        <p className="muted small">ใช้ทดสอบกฎเข้า/ออก ส่งอีเมลเดิมสองครั้งเพื่อดูว่าระบบนับว่าออกแล้ว หรือเว้นเวลาให้เกิน 14 ชม.</p>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <label className="field">อีเมล<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@central.co.th" /></label>
        <label className="field">ชื่อ<input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">เพศ
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option>หญิง</option><option>ชาย</option><option>อื่นๆ</option>
          </select>
        </label>
        <label className="field">ไซต์
          <input type="text" list="site-list" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="SCDC" />
          <datalist id="site-list">{sites.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="field">เวลาส่ง (เว้นว่าง = ตอนนี้)<input type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></label>
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit">ส่งฟอร์มทดสอบ</button>
        {msg && <span className={`pill ${msg.kind === "safe" ? "pill-safe" : "pill-fire"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

const FIELD_LABEL: Record<string, string> = {
  plate: "ทะเบียนรถ", province: "จังหวัด", driver_name: "ชื่อคนขับ", phone: "เบอร์โทร",
  company: "บริษัทขนส่ง", checkin_at: "เวลาเข้าลาน", zone: "ช่องจอด/โซน",
};

function DriverPanel({ onDone }: { onDone: () => void }) {
  const d = usePoll<{ configured: boolean; vehicles: any[]; flag: number | null; fields: any }>("/api/sources/driver", 30000);
  const plan = usePoll<{ leaders: { flag_no: number; leader_name: string; area: string | null }[] }>("/api/plan", 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string; held?: boolean } | null>(null);

  async function sync(force = false) {
    setBusy(true);
    try {
      const r = await api("/api/sources/driver", { method: "POST", json: { action: "sync", force } });
      setMsg({ kind: r.ok ? "safe" : "warn", text: r.message, held: r.held });
      d.reload();
      onDone();
    } catch (e: any) {
      setMsg({ kind: "fire", text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function setFlag(flag: string) {
    await api("/api/sources/driver", { method: "POST", json: { action: "flag", flag } });
    d.reload();
  }

  const f = d.data?.fields?.fields as Record<string, string | null> | undefined;
  return (
    <section className="panel stack">
      <div>
        <h2>Driver (KIOS)</h2>
        <p className="muted small">
          เรียก API ของ KIOS ตรง (สูตรเดียวกับที่ใช้ใน Power BI) ดึงรถที่สถานะอยู่ในลาน ใช้ทะเบียนรถเป็นตัวระบุคน หนึ่งคันนับหนึ่งคน
          ดึงทุก 15 นาทีและทันทีที่เปิดเหตุการณ์
        </p>
      </div>
      {d.data && !d.data.configured && (
        <p className="notice notice-warn">ยังไม่ได้ตั้งค่า ใส่ KIOS_BASE_URL และ KIOS_API_KEY ใน Vercel แล้ว deploy ใหม่</p>
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={() => sync(false)} disabled={busy || !d.data?.configured}>{busy ? "กำลังดึง…" : "ดึงข้อมูลตอนนี้"}</button>
        {msg?.held && <button className="btn" onClick={() => sync(true)} disabled={busy}>รับข้อมูลรอบนี้ (รถออกจริง)</button>}
        <label className="field" style={{ marginLeft: "auto", minWidth: 220 }}>
          คนขับไปรวมที่ธง
          <select value={d.data?.flag ?? ""} onChange={(e) => setFlag(e.target.value)}>
            <option value="">ไม่ระบุธง</option>
            {(plan.data?.leaders ?? []).map((l) => (
              <option key={l.flag_no} value={l.flag_no}>ธง {l.flag_no} {l.area ?? l.leader_name}</option>
            ))}
          </select>
        </label>
      </div>
      {msg && <p className={`notice notice-${msg.kind}`}>{msg.text}</p>}

      {f && (
        <div>
          <h3 style={{ marginBottom: 6 }}>คอลัมน์ที่ระบบจับได้</h3>
          <div className="row small">
            {Object.entries(FIELD_LABEL).map(([k, label]) => (
              <span key={k} className={`pill ${f[k] ? "pill-safe" : k === "plate" ? "pill-fire" : "pill-slate"}`}>{label}: {f[k] ?? "ไม่พบ"}</span>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            คอลัมน์ทั้งหมดจาก KIOS: {(d.data?.fields?.sampleKeys ?? []).join(", ")} — ถ้าจับผิด ตั้ง KIOS_FIELD_MAP
          </p>
        </div>
      )}

      {!!d.data?.vehicles.length && (
        <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
          <table>
            <thead><tr><th>ทะเบียน</th><th>คนขับ</th><th>บริษัท</th><th>โซน</th><th>เข้าลาน</th></tr></thead>
            <tbody>
              {d.data.vehicles.map((v) => (
                <tr key={v.plate}>
                  <td><b>{v.plate_display ?? v.plate}</b></td>
                  <td>{v.driver_name ?? "—"} <span className="muted small">{v.phone ?? ""}</span></td>
                  <td>{v.company ?? "—"}</td>
                  <td>{v.zone ?? "—"}</td>
                  <td className="num">{fmtDateTime(v.checkin_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.data?.configured && d.data.vehicles.length === 0 && <p className="muted small">ตอนนี้ไม่มีรถในลาน หรือยังไม่เคยดึงข้อมูล</p>}
    </section>
  );
}
