"use client";
import { useRef, useState } from "react";
import PcHeader from "@/components/PcHeader";
import { api, usePoll, fmtDateTime, ago, useNow } from "@/components/lib";

type State = { key: string; label: string; ready: boolean; last_ok_at: string | null; last_try_at: string | null; last_error: string | null; record_count: number | null };
type Data = {
  states: State[];
  sites: { site: string; n: number }[];
  recent: { response_id: string; email: string; full_name: string | null; gender: string | null; site: string | null; submitted_at: string; via: string }[];
  graph: boolean;
};
const VIA: Record<string, string> = { graph: "SharePoint", xlsx: "Excel", test: "ทดสอบ", push: "Power Automate" };

/** หน้าตรวจสอบแหล่งข้อมูล: ใครอยู่ในพื้นที่ตอนนี้ มาจากไหน สดแค่ไหน */
export default function SourcesPage() {
  const d = usePoll<Data>("/api/sources", 10000);
  const now = useNow(5000);
  const div = d.data?.states.find((s) => s.key === "div");
  return (
    <>
      <PcHeader />
      <div className="wrap">
        <div>
          <div className="muted small" style={{ fontWeight: 600 }}>ใช้ตรวจสอบข้อมูล</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>แหล่งข้อมูล</h1>
        </div>
        {d.error && <p className="notice err">{d.error}</p>}

        <div className="card">
          <div className="card-h">สถานะรายแหล่ง</div>
          {(d.data?.states ?? []).map((s) => {
            const failed = s.last_error && (!s.last_ok_at || (s.last_try_at && new Date(s.last_try_at) > new Date(s.last_ok_at)));
            const stale = s.last_ok_at && now - new Date(s.last_ok_at).getTime() > 3600e3;
            const [chip, text] = !s.ready ? ["grey", "ยังไม่เชื่อมในต้นแบบนี้"]
              : !s.last_ok_at ? ["warn", s.last_error ?? "ยังไม่มีข้อมูล"]
              : failed ? ["warn", `ดึงล่าสุดไม่สำเร็จ ใช้ข้อมูลเมื่อ ${ago(s.last_ok_at, now)}`]
              : stale ? ["warn", `อัปเดต ${ago(s.last_ok_at, now)}`] : ["ok", `อัปเดต ${ago(s.last_ok_at, now)}`];
            return (
              <div key={s.key} className="tr" style={{ gridTemplateColumns: "minmax(0,220px) auto minmax(0,1fr) 90px" }}>
                <b>{s.label}</b><span className={`chip ${chip}`}>{chip === "ok" ? "ปกติ" : chip === "warn" ? "ตรวจสอบ" : "ยังไม่เชื่อม"}</span>
                <span className="muted small">{text}{failed && s.last_error ? ` · ${s.last_error}` : ""}</span>
                <span className="mono" style={{ textAlign: "right" }}>{s.record_count ?? "—"}</span>
              </div>
            );
          })}
        </div>

        <div className="g2">
          <section className="card stack" style={{ padding: 18 }}>
            <div>
              <b style={{ fontSize: 16 }}>DIV+ และอื่นๆ (MS Form)</b>
              <p className="muted small" style={{ marginTop: 4 }}>
                ฟอร์มเช็กอิน → Power Automate เขียนลง SharePoint List → แอพดึงตามรอบ และดึงซ้ำทันทีเมื่อเปิดเหตุการณ์ ระบบอนุมานเข้า/ออกเอง
                (ซ้ำใน 10 นาทีนับครั้งเดียว, ส่งครั้งที่สอง = ออก, ต่างไซต์ = ย้ายไซต์, ครบ 14 ชม. = ออกอัตโนมัติ)
              </p>
            </div>
            <GraphSync configured={!!d.data?.graph} lastError={div?.last_error ?? null} onDone={d.reload} />
            <ExcelUpload onDone={d.reload} />
            <TestCheckin sites={d.data?.sites.map((s) => s.site) ?? []} onDone={d.reload} />
          </section>
          <DriverPanel onDone={d.reload} />
        </div>

        <section className="card">
          <div className="card-h"><span className="grow">เช็กอินฟอร์มล่าสุด</span>
            <span className="muted xs" style={{ fontWeight: 500 }}>{d.data?.sites.length ? `ไซต์: ${d.data.sites.map((s) => `${s.site} (${s.n})`).join(", ")}` : ""}</span></div>
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>เวลาส่ง</th><th>ชื่อ</th><th>อีเมล</th><th>เพศ</th><th>ไซต์</th><th>มาจาก</th></tr></thead>
            <tbody>
              {!d.data?.recent.length && <tr><td colSpan={6} className="muted">ยังไม่มีข้อมูลเช็กอิน</td></tr>}
              {d.data?.recent.map((r) => (
                <tr key={r.response_id}>
                  <td className="mono">{fmtDateTime(r.submitted_at)} <span className="muted xs">({ago(r.submitted_at)})</span></td>
                  <td>{r.full_name ?? "—"}</td><td className="small">{r.email}</td><td>{r.gender ?? "—"}</td><td>{r.site ?? "—"}</td>
                  <td><span className="chip grey sm">{VIA[r.via] ?? r.via}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>

        <LinkPanel />
      </div>
    </>
  );
}

function GraphSync({ configured, lastError, onDone }: { configured: boolean; lastError: string | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  async function run() {
    setBusy(true);
    try { const r = await api("/api/sources/div/sync", { method: "POST" }); setMsg({ k: r.ok ? "ok" : "warn", t: r.message }); onDone(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line-3)", paddingTop: 12 }}>
      <b className="small">ดึงจาก SharePoint List</b>
      <p className="muted xs">{configured ? "เชื่อมแล้ว กดเพื่อดึงแถวใหม่ทันที" : "ยังไม่ได้ตั้งค่า รอ app registration แบบ Sites.Selected จาก IT แล้วใส่ค่า MS_* และ SP_* ใน Vercel"}</p>
      <div><button className="btn btn-pri btn-sm" onClick={run} disabled={busy || !configured}>{busy ? "กำลังดึง…" : "ดึงข้อมูลตอนนี้"}</button></div>
      {msg ? <p className={`notice ${msg.k}`}>{msg.t}</p> : configured && lastError ? <p className="notice warn">{lastError}</p> : null}
    </div>
  );
}

function ExcelUpload({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  async function upload(file: File) {
    try {
      const XLSX = await import("xlsx");
      const { parseFormWorkbook } = await import("@/lib/parsers");
      const { rows, issues } = parseFormWorkbook(XLSX.read(await file.arrayBuffer(), { type: "array" }));
      if (!rows.length) return setMsg({ k: "warn", t: issues[0] ?? "ไม่พบแถวคำตอบในไฟล์" });
      const r = await api("/api/sources/div/upload", { method: "POST", json: { rows, batchId: `xlsx-${file.name}-${file.size}-${file.lastModified}` } });
      setMsg({ k: r.duplicateBatch ? "warn" : "ok", t: r.duplicateBatch ? "ไฟล์นี้เคยนำเข้าแล้ว ไม่มีอะไรเปลี่ยน" : `อ่านได้ ${rows.length} แถว เป็นแถวใหม่ ${r.inserted} แถว` });
      onDone();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line-3)", paddingTop: 12 }}>
      <b className="small">นำเข้า Excel ของฟอร์ม</b>
      <p className="muted xs">ทางสำรองระหว่างรอ IT ดาวน์โหลดไฟล์ Check (In-Out) ที่ sync กับฟอร์มแล้วนำเข้า แถวที่มีอยู่แล้วจะถูกข้าม</p>
      <div><button className="btn btn-sm" onClick={() => input.current?.click()}>เลือกไฟล์ Excel</button></div>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {msg && <p className={`notice ${msg.k}`}>{msg.t}</p>}
    </div>
  );
}

function TestCheckin({ sites, onDone }: { sites: string[]; onDone: () => void }) {
  const [f, setF] = useState({ email: "", name: "", gender: "หญิง", site: "", at: "" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try {
      const at = f.at ? new Date(`${f.at}:00+07:00`).toISOString() : undefined;
      await api("/api/sources/div/test", { method: "POST", json: { ...f, at } });
      setMsg({ k: "ok", t: `บันทึกการส่งฟอร์มของ ${f.email} แล้ว` }); onDone();
    } catch (x: any) { setMsg({ k: "err", t: x.message }); }
  }
  return (
    <form onSubmit={send} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line-3)", paddingTop: 12 }}>
      <b className="small">จำลองคนส่งฟอร์ม</b>
      <p className="muted xs">ทดสอบกฎเข้า/ออก ส่งอีเมลเดิมสองครั้งเพื่อดูว่าระบบนับว่าออกแล้ว</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <label className="lb">อีเมล<input className="in" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@central.co.th" /></label>
        <label className="lb">ชื่อ<input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="lb">เพศ<select className="in" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option>หญิง</option><option>ชาย</option><option>อื่นๆ</option></select></label>
        <label className="lb">ไซต์<input className="in" list="site-list" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="SCDC" />
          <datalist id="site-list">{sites.map((s) => <option key={s} value={s} />)}</datalist></label>
        <label className="lb">เวลาส่ง (ว่าง = ตอนนี้)<input className="in" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></label>
      </div>
      <div className="row"><button className="btn btn-sm btn-pri" type="submit">ส่งฟอร์มทดสอบ</button>{msg && <span className={`chip ${msg.k}`}>{msg.t}</span>}</div>
    </form>
  );
}

const FIELD_LABEL: Record<string, string> = {
  plate: "ทะเบียนรถ", province: "จังหวัด", driver_name: "ชื่อคนขับ", phone: "เบอร์โทร",
  company: "บริษัทขนส่ง", checkin_at: "เวลาเข้าลาน", zone: "ช่องจอด/โซน",
};

function DriverPanel({ onDone }: { onDone: () => void }) {
  const d = usePoll<{ configured: boolean; vehicles: any[]; flag: number | null; fields: any }>("/api/sources/driver", 30000);
  const plan = usePoll<{ leaders: { flag_no: number; leader_name: string }[]; flags: { flag_no: number | null; area: string | null }[] }>("/api/plan", 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: string; t: string; held?: boolean } | null>(null);
  async function sync(force = false) {
    setBusy(true);
    try { const r = await api("/api/sources/driver", { method: "POST", json: { action: "sync", force } }); setMsg({ k: r.ok ? "ok" : "warn", t: r.message, held: r.held }); d.reload(); onDone(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  async function setFlag(flag: string) { await api("/api/sources/driver", { method: "POST", json: { action: "flag", flag } }); d.reload(); }
  const f = d.data?.fields?.fields as Record<string, string | null> | undefined;
  const flags = (plan.data?.flags ?? []).filter((x) => x.flag_no != null);
  return (
    <section className="card stack" style={{ padding: 18, alignSelf: "start" }}>
      <div>
        <b style={{ fontSize: 16 }}>Driver (KIOS)</b>
        <p className="muted small" style={{ marginTop: 4 }}>เรียก API ของ KIOS ตรง (สูตรเดียวกับใน Power BI) ดึงรถที่อยู่ในลาน ใช้ทะเบียนรถเป็นตัวระบุคน หนึ่งคันนับหนึ่งคน</p>
      </div>
      {d.data && !d.data.configured && <p className="notice warn">ยังไม่ได้ตั้งค่า ใส่ KIOS_BASE_URL และ KIOS_API_KEY ใน Vercel แล้ว Redeploy</p>}
      <div className="row">
        <button className="btn btn-pri btn-sm" onClick={() => sync(false)} disabled={busy || !d.data?.configured}>{busy ? "กำลังดึง…" : "ดึงข้อมูลตอนนี้"}</button>
        {msg?.held && <button className="btn btn-sm" onClick={() => sync(true)} disabled={busy}>รับข้อมูลรอบนี้ (รถออกจริง)</button>}
        <label className="lb" style={{ marginLeft: "auto", minWidth: 200 }}>คนขับไปรวมที่ธง
          <select className="in" value={d.data?.flag ?? ""} onChange={(e) => setFlag(e.target.value)}>
            <option value="">ไม่ระบุธง</option>
            {flags.map((x) => <option key={x.flag_no!} value={x.flag_no!}>ธง {x.flag_no} {x.area ?? ""}</option>)}
          </select>
        </label>
      </div>
      {msg && <p className={`notice ${msg.k}`}>{msg.t}</p>}
      {f && (
        <div>
          <b className="small">คอลัมน์ที่ระบบจับได้</b>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            {Object.entries(FIELD_LABEL).map(([k, l]) => <span key={k} className={`chip sm ${f[k] ? "ok" : k === "plate" ? "err" : "grey"}`}>{l}: {f[k] ?? "ไม่พบ"}</span>)}
          </div>
          <p className="muted xs" style={{ marginTop: 6 }}>คอลัมน์ทั้งหมดจาก KIOS: {(d.data?.fields?.sampleKeys ?? []).join(", ")} · ถ้าจับผิด ตั้ง KIOS_FIELD_MAP</p>
        </div>
      )}
      {!!d.data?.vehicles.length && (
        <div className="scroll-x" style={{ maxHeight: 360, overflowY: "auto" }}>
          <table className="tbl">
            <thead><tr><th>ทะเบียน</th><th>คนขับ</th><th>บริษัท</th><th>โซน</th><th>เข้าลาน</th></tr></thead>
            <tbody>
              {d.data.vehicles.map((v) => (
                <tr key={v.plate}><td><b>{v.plate_display ?? v.plate}</b></td><td>{v.driver_name ?? "—"} <span className="muted xs">{v.phone ?? ""}</span></td>
                  <td>{v.company ?? "—"}</td><td>{v.zone ?? "—"}</td><td className="mono">{fmtDateTime(v.checkin_at)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.data?.configured && d.data.vehicles.length === 0 && <p className="muted xs">ตอนนี้ไม่มีรถในลาน หรือยังไม่เคยดึงข้อมูล</p>}
    </section>
  );
}

function LinkPanel() {
  const links = usePoll<{ links: number; unmatched: { email: string; name: string; checkins: number }[] }>("/api/links", 0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function send(rows: { email: string; emp_id: string }[]) {
    try { const r = await api("/api/links", { method: "POST", json: { rows } }); setMsg({ k: "ok", t: `จับคู่แล้ว ${r.saved} รายการ` }); setDraft({}); links.reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function upload(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const pick = (r: Record<string, unknown>, keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.some((y) => x.replace(/\s/g, "").toLowerCase().includes(y)));
      return k ? String(r[k]).trim() : "";
    };
    send(rows.map((r) => ({ email: pick(r, ["email", "อีเมล"]), emp_id: pick(r, ["รหัสพนักงาน", "empid", "employeeid"]) })));
  }
  const un = links.data?.unmatched ?? [];
  return (
    <section className="card">
      <div className="card-h"><span className="grow">จับคู่อีเมลกับรหัสพนักงาน</span>
        <span className="muted xs" style={{ fontWeight: 500 }}>{links.data?.links ?? 0} คู่ในระบบ</span>
        <button className="btn btn-sm" onClick={() => input.current?.click()}>อัปโหลดไฟล์คู่อีเมล–รหัส</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></div>
      <p className="muted small" style={{ padding: "0 18px 12px" }}>ฟอร์มรู้แค่อีเมล ชุดธงรู้แค่รหัสพนักงาน คนที่ยังไม่จับคู่จะขึ้นเป็น “ไม่ระบุธง” ตอนเกิดเหตุ</p>
      {msg && <div style={{ padding: "0 18px 12px" }}><p className={`notice ${msg.k}`}>{msg.t}</p></div>}
      {un.length > 0 ? (
        <>
          <table className="tbl">
            <thead><tr><th>อีเมลที่ยังไม่จับคู่</th><th>ชื่อในฟอร์ม</th><th>ส่งฟอร์ม</th><th>รหัสพนักงาน</th></tr></thead>
            <tbody>{un.map((u) => (
              <tr key={u.email}><td className="small">{u.email}</td><td>{u.name}</td><td className="mono">{u.checkins}</td>
                <td style={{ minWidth: 150 }}><input className="in mono" style={{ marginTop: 0 }} inputMode="numeric" placeholder="เช่น 20076487" value={draft[u.email] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [u.email]: e.target.value })} aria-label={`รหัสพนักงานของ ${u.email}`} /></td></tr>
            ))}</tbody>
          </table>
          <div style={{ padding: "12px 18px" }}><button className="btn btn-pri btn-sm" disabled={!Object.values(draft).some(Boolean)}
            onClick={() => send(Object.entries(draft).filter(([, v]) => v).map(([email, emp_id]) => ({ email, emp_id })))}>บันทึกการจับคู่</button></div>
        </>
      ) : <p className="muted small" style={{ padding: "0 18px 16px" }}>ทุกอีเมลที่ส่งฟอร์มเข้ามาจับคู่ครบแล้ว</p>}
    </section>
  );
}
