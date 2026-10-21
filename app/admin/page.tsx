"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PcHeader from "@/components/PcHeader";
import PinGate from "@/components/PinGate";
import UsersPanel from "@/components/UsersPanel";
import PlanEditor, { type FlagRow } from "@/components/PlanEditor";
import { PushAdminCard } from "@/components/Notify";
import Tabs, { useTab } from "@/components/Tabs";
import { api, usePoll, fmtDateTime, rangeText } from "@/components/lib";
import { IUpload } from "@/components/Icons";
import type { MergedPlan, PlanFileResult } from "@/lib/parsers";

type Overview = {
  total: number; files: number; updated_at: string | null;
  flags: FlagRow[];
  leaders: { flag_no: string; leader_name: string | null; area: string | null; assembly_point: string | null; flag_no_old: string | null; cost_center: string | null }[];
  points: { code: string; name: string; backup: string | null; sort: number; flags: string[] | null }[];
  versions: { id: number; name: string | null; note: string; created_by: string; created_at: string; updated_at: string; people: number; used: number }[];
  version: { active: number | null; dirty: boolean; changed_at: string | null };
  roles: string[];
  accuracy: { imported: number; moved: number; added: number; removed: number; edited: number; unchanged: number; pct: number | null };
};

export default function AdminPage() {
  return (
    <>
      <PcHeader />
      <PinGate roles={["admin"]} title="ตั้งค่า · เฉพาะ Admin">{() => <Admin />}</PinGate>
    </>
  );
}

function Admin() {
  const router = useRouter();
  const o = usePoll<Overview>("/api/plan", 0);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [tab, setTab] = useTab("admin", ["plan", "points", "users", "codes", "system"] as const, "plan");
  const [naming, setNaming] = useState(false);
  const [vName, setVName] = useState("");

  async function run(fn: () => Promise<any>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ k: "ok", t: ok }); o.reload(); return true; } catch (e: any) { setMsg({ k: "err", t: e.message }); return false; }
  }
  const [starting, setStarting] = useState(false);
  async function startDrill() {
    setStarting(true);
    try {
      await api("/api/incidents", { method: "POST", json: { action: "drill", title: `ซ้อมอพยพ ${new Date().getFullYear()}` } });
      router.push("/dashboard");
    } catch (e: any) { setMsg({ k: "err", t: e.message }); setStarting(false); }
  }

  return (
    <>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 0", display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div className="grow">
          <div className="muted small" style={{ fontWeight: 600 }}>เฉพาะ Admin · ใช้บน PC</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>ตั้งค่า</h1>
        </div>
        <button className="btn" onClick={startDrill} disabled={!o.data?.total || starting} title="ดึงข้อมูลเข้า-ออกล่าสุด แล้วเทียบกับผลตรวจทานธง">{starting ? "กำลังดึงข้อมูลและเทียบ…" : "เริ่มซ้อม"}</button>
        {naming ? (
          <form className="row" style={{ gap: 8, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault();
            run(() => api("/api/admin/versions", { method: "POST", json: { action: "save", note: "บันทึกหลังแก้ไข", name: vName } }),
              `บันทึกเป็นเวอร์ชันใหม่${vName.trim() ? ` “${vName.trim()}”` : ""} และตั้งเป็นเวอร์ชันที่ใช้อยู่แล้ว`).then((done) => { if (done) { setNaming(false); setVName(""); } }); }}>
            <input className="in" style={{ marginTop: 0, width: 280 }} autoFocus maxLength={80} placeholder={`ชื่อเวอร์ชัน เช่น ซ้อมใหญ่ ต.ค. ${new Date().getFullYear() + 543}`}
              value={vName} onChange={(e) => setVName(e.target.value)} aria-label="ชื่อเวอร์ชัน" />
            <button className="btn btn-pri" type="submit">บันทึกเวอร์ชันใหม่</button>
            <button className="btn" type="button" onClick={() => setNaming(false)}>ยกเลิก</button>
          </form>
        ) : (
          <button className="btn btn-pri" disabled={!o.data?.total} onClick={() => setNaming(true)}>+ บันทึกเป็นเวอร์ชันใหม่</button>
        )}
      </div>
      {msg && <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}><p className={`notice ${msg.k}`}>{msg.t}</p></div>}
      <div style={{ maxWidth: 1440, margin: "16px auto 0", padding: "0 32px" }}>
        <Tabs tabs={[
          { id: "plan", label: "ชุดธง", badge: o.data ? o.data.total : null },
          { id: "points", label: "จุดรวมพล", badge: o.data ? o.data.points.length : null },
          { id: "users", label: "ผู้ใช้และสิทธิ์" },
          { id: "codes", label: "Code ประกาศ" },
          { id: "system", label: "แหล่งข้อมูล & PIN สำรอง" },
        ]} value={tab} onChange={setTab} />
      </div>
      {tab === "plan" && o.data?.version.dirty && (
        <div style={{ maxWidth: 1440, margin: "12px auto 0", padding: "0 32px" }}>
          <div className="notice warn row" style={{ gap: 10 }}>
            <span className="grow">มีการแก้ชุดธงที่ยังไม่บันทึกลงเวอร์ชัน (แก้ล่าสุด {fmtDateTime(o.data.version.changed_at)}) · ตอนเริ่มซ้อม/เกิดเหตุ ระบบใช้ชุดธงปัจจุบันที่แก้แล้ว</span>
            {o.data.version.active && <button className="btn btn-sm" onClick={() => run(() => api("/api/admin/versions", { method: "POST", json: { action: "overwrite", id: o.data!.version.active } }), `บันทึกทับ v${o.data!.version.active} แล้ว`)}>บันทึกทับ v{o.data.version.active}</button>}
            <button className="btn btn-sm btn-pri" onClick={() => setNaming(true)}>บันทึกเป็นเวอร์ชันใหม่</button>
          </div>
        </div>
      )}
      {tab === "plan" && (
        <div className="wrap layout" style={{ display: "grid" }}>
          <section className="stack" style={{ gap: 20, minWidth: 0 }}>
            <ImportCard onSaved={() => o.reload()} />
            {o.data && <PlanEditor flags={o.data.flags} leaders={o.data.leaders} points={o.data.points} total={o.data.total} roles={o.data.roles} onChanged={o.reload} />}
          </section>
          <aside className="stack" style={{ gap: 20, alignSelf: "start" }}>
            {o.data && <AccuracyCard a={o.data.accuracy} />}
            {o.data && <VersionsCard versions={o.data.versions} state={o.data.version} onDone={o.reload} />}
          </aside>
        </div>
      )}
      {tab === "points" && <div className="wrap">{o.data && <PointsCard points={o.data.points} flags={o.data.flags} onSaved={o.reload} />}</div>}
      {tab === "users" && <div className="wrap"><UsersPanel /></div>}
      {tab === "codes" && <div className="wrap"><div style={{ maxWidth: 760 }}><CodesCard /></div></div>}
      {tab === "system" && (
        <div className="wrap g2" style={{ display: "grid", alignItems: "start" }}>
          <SourcesCard />
          <ConfirmersCard />
          <PushAdminCard />
        </div>
      )}
    </>
  );
}

// ---------- นำเข้าไฟล์ธง ----------
function ImportCard({ onSaved }: { onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const mergePlanFn = useRef<typeof import("@/lib/parsers").mergePlan | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<PlanFileResult[] | null>(null);
  const [name, setName] = useState("");
  const m: (MergedPlan & { files: number }) | null = useMemo(() => {
    if (!raw) return null;
    return { ...mergePlanFn.current!(raw), files: raw.length };
  }, [raw]);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);

  async function read(files: FileList | File[]) {
    const { isTempExcel } = await import("@/lib/parsers");
    const all = [...files];
    const list = all.filter((f) => /\.xlsx?$/i.test(f.name) && !isTempExcel(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    if (!list.length) return setMsg({ k: "warn", t: "เลือกไฟล์ .xlsx ของแผนอพยพ" });
    const skipped = all.length - list.length;
    setBusy(true); setMsg(null);
    try {
      const XLSX = await import("xlsx");
      const { parsePlanWorkbook, mergePlan } = await import("@/lib/parsers");
      const res = [];
      for (const f of list) res.push(parsePlanWorkbook(XLSX.read(await f.arrayBuffer(), { type: "array" }), f.name));
      mergePlanFn.current = mergePlan;
      setName(list.length === 1 ? list[0].name.replace(/\.xlsx?$/i, "") : "");
      setRaw(res);
      if (skipped) setMsg({ k: "warn", t: `ข้าม ${skipped} ไฟล์ที่ไม่ใช่ .xlsx หรือเป็นไฟล์ชั่วคราว (~$)` });
    } catch (e: any) { setMsg({ k: "err", t: `อ่านไฟล์ไม่สำเร็จ: ${e.message}` }); } finally { setBusy(false); }
  }
  async function download() {
    if (!m) return;
    const XLSX = await import("xlsx");
    const { combinedRows } = await import("@/lib/parsers");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(combinedRows(m)), "รวม");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.issues.map((i) => ({
      "ระดับ": i.level === "error" ? "เอาเข้าไม่ได้" : "เตือน (นำเข้าแล้ว)", "ไฟล์": i.file, "ปัญหา": i.message }))), "ปัญหาที่พบ");
    XLSX.writeFile(wb, `Summary_EmergencyFlags_รวม_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async function save() {
    if (!m) return;
    setBusy(true);
    try {
      const people = m.people.map(({ sheet, bad_id, ...p }) => p);
      const r = await api("/api/plan", { method: "POST", json: { people, leaders: m.leaders, files: m.files, name } });
      setMsg({ k: "ok", t: `บันทึกเป็นชุดธง v${r.version}${name.trim() ? ` “${name.trim()}”` : ""} แล้ว ${r.saved} คน ผู้นำธง ${r.leaders} ธง` });
      setRaw(null); onSaved();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  const errors = m?.issues.filter((i) => i.level === "error") ?? [];
  const warns = m?.issues.filter((i) => i.level === "warn") ?? [];
  return (
    <div className="card">
      <div className="card-h"><span className="grow" style={{ fontSize: 17 }}>นำเข้าไฟล์ธง (Excel)</span>
        <span className="muted xs" style={{ fontWeight: 500 }}>ไฟล์รายแผนก หัวตารางแถว 4 (จุดรวมพล … รหัสพนักงาน) · ไม่ใช้ชีตรายชื่อผู้นำธง · เลือกหลายไฟล์หรือทั้งโฟลเดอร์ได้</span></div>
      <div className="dropzone" data-over={over} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}>
        <IUpload size={32} color="#1F3A5F" />
        <div className="grow"><b>{busy ? "กำลังอ่านไฟล์…" : "ลากไฟล์ .xlsx มาวาง หรือเลือกไฟล์"}</b>
          <div className="muted small">ระบบจะตรวจก่อน · ยังไม่มีผลกับชุดธงจนกว่าจะกดบันทึก</div></div>
        <span className="btn btn-sm">เลือกไฟล์</span>
        <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); folder.current?.click(); }}>เลือกทั้งโฟลเดอร์</button>
        <input ref={input} type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => e.target.files && read(e.target.files)} />
        <input ref={folder} type="file" multiple hidden {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => e.target.files && read(e.target.files)} />
      </div>
      {msg && <div style={{ padding: "0 18px 14px" }}><p className={`notice ${msg.k}`}>{msg.t}</p></div>}
      {m && (
        <>
          <div className="row" style={{ padding: "12px 18px", borderTop: "1px solid var(--line-3)", background: "var(--subtle)" }}>
            <b className="grow">ผลตรวจ: {m.files} ไฟล์ · {m.people.length} คน · {new Set(m.people.map((p) => p.flag_no)).size} ธง</b>
            <span className="chip ok">นำเข้าได้ {m.people.length} คน</span>
            <span className="chip warn" title="นำเข้าแล้ว แจ้งเตือนไว้ให้ตรวจ">เตือน {warns.length}</span>
            <span className="chip err" title="ส่วนนี้นำเข้าไม่ได้">เอาเข้าไม่ได้ {errors.length}</span>
          </div>
          {m.duplicates.length > 0 && <div className="tr" style={{ gridTemplateColumns: "1fr" }}><span className="small">
            พบ {m.duplicates.length} คนอยู่มากกว่าหนึ่งไฟล์ ระบบใช้ค่าจากไฟล์แรก เช่น {m.duplicates.slice(0, 3).map((d) => `${d.emp_id} (${d.files.join(", ")})`).join("; ")}</span></div>}
          {(errors.length > 0 || warns.length > 0) && (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <div className="tr th" style={{ gridTemplateColumns: "minmax(0,180px) minmax(0,1fr) 200px" }}><div>ไฟล์</div><div>รายละเอียด · <span style={{ color: "#92400E" }}>เหลือง = นำเข้าแล้ว แจ้งเตือนไว้</span> · <span style={{ color: "#9F1239" }}>แดง = เอาเข้าไม่ได้</span></div><div>ผลเมื่อบันทึก</div></div>
              {[...errors, ...warns].slice(0, 300).map((i, k) => (
                <div key={k} className="tr" style={{ gridTemplateColumns: "minmax(0,180px) minmax(0,1fr) 200px" }}>
                  <div className="mono xs">{i.file}</div>
                  <div><span className={`chip ${i.level === "error" ? "err" : "warn"}`} style={{ whiteSpace: "normal" }}>{i.message}</span></div>
                  <div className="small" style={{ color: i.level === "error" ? "#9F1239" : "var(--muted)", fontWeight: i.level === "error" ? 700 : 400 }}>{i.level === "error" ? "ไม่ได้นำเข้า · แก้ไฟล์แล้วนำเข้าใหม่" : "นำเข้าแล้ว · แจ้งเตือนไว้"}</div>
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ padding: "12px 18px", borderTop: "1px solid var(--line-3)" }}>
            <input className="in" style={{ marginTop: 0, width: 260 }} maxLength={80} placeholder="ชื่อเวอร์ชัน (ไม่บังคับ)" value={name} onChange={(e) => setName(e.target.value)} aria-label="ชื่อเวอร์ชัน" />
            <button className="btn btn-pri" onClick={save} disabled={busy || !m.people.length}>บันทึกเป็นชุดธงใหม่ ({m.people.length} คน)</button>
            <button className="btn" onClick={() => setRaw(null)} disabled={busy}>ยกเลิก</button>
            <button className="btn" onClick={download} disabled={busy}>ดาวน์โหลดไฟล์รวม (.xlsx)</button>
            <span className="muted xs">แทนที่ชุดธงปัจจุบันทั้งหมด เหตุการณ์ที่เปิดอยู่ไม่กระทบ</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- จุดรวมพล ----------
function PointsCard({ points, flags, onSaved }: { points: Overview["points"]; flags: Overview["flags"]; onSaved: () => void }) {
  const [pick, setPick] = useState<{ code: string; sel: string[] } | null>(null);
  const allFlags = flags.filter((f) => f.flag_no != null);
  const pointOf = (n: string) => allFlags.find((f) => f.flag_no === n)?.assembly_point ?? null;
  const pName = (c: string | null) => (c ? points.find((x) => x.code === c)?.name ?? c : "ไม่ระบุจุด");
  const noPoint = allFlags.filter((f) => !f.assembly_point || !points.some((x) => x.code === f.assembly_point)).map((f) => f.flag_no!);
  const [draft, setDraft] = useState<Record<string, { name: string; backup: string; sort: number }>>({});
  const [add, setAdd] = useState({ code: "", name: "" });
  const [del, setDel] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  async function call(json: any, okText: string) {
    setMsg(null);
    try { await api("/api/admin/points", { method: "POST", json }); setMsg({ k: "ok", t: okText }); onSaved(); return true; }
    catch (e: any) { setMsg({ k: "err", t: e.message }); return false; }
  }
  const cols = { gridTemplateColumns: "64px minmax(0,1fr) 140px 170px 70px 150px" };
  return (
    <div className="card">
      <div className="card-h"><span className="grow" style={{ fontSize: 17 }}>จุดรวมพล</span><span className="muted xs" style={{ fontWeight: 500 }}>{points.length} จุด</span></div>
      <div className="tr th" style={cols}><div>รหัส</div><div>ชื่อ / ตำแหน่ง</div><div>ธงที่ใช้จุดนี้</div><div>จุดสำรอง</div><div>ลำดับ</div><div /></div>
      {points.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มีจุดรวมพล เพิ่มด้านล่าง หรือระบบสร้างให้จากคอลัมน์ “จุดรวมพล” เมื่อนำเข้าไฟล์ธง</div>}
      {points.map((p) => {
        const dr = draft[p.code] ?? { name: p.name, backup: p.backup ?? "", sort: p.sort };
        const dirty = dr.name !== p.name || dr.backup !== (p.backup ?? "") || dr.sort !== p.sort;
        const set = (x: Partial<typeof dr>) => setDraft({ ...draft, [p.code]: { ...dr, ...x } });
        const others = points.filter((x) => x.code !== p.code);
        return (
          <div key={p.code}>
            <div className="tr" style={{ ...cols, background: del === p.code ? "#FFF1F2" : undefined }}>
              <b className="mono">{p.code}</b>
              <input className="in" style={{ marginTop: 0 }} value={dr.name} onChange={(e) => set({ name: e.target.value })} aria-label={`ชื่อจุด ${p.code}`} />
              <button className="lk mono small" style={{ textAlign: "left", minHeight: 0, padding: 0 }} title="แก้ธงที่ใช้จุดนี้"
                onClick={() => setPick(pick?.code === p.code ? null : { code: p.code, sel: allFlags.filter((f) => f.assembly_point === p.code).map((f) => f.flag_no!) })}>
                {p.flags?.length ? rangeText(p.flags) : "—"} <span style={{ fontFamily: "inherit" }}>· แก้</span></button>
              <select className="in" style={{ marginTop: 0 }} value={dr.backup} onChange={(e) => set({ backup: e.target.value })} aria-label={`จุดสำรองของ ${p.code}`}>
                <option value="">ไม่มี</option>
                {others.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
              <input className="in mono" style={{ marginTop: 0 }} type="number" value={dr.sort} onChange={(e) => set({ sort: Number(e.target.value) })} aria-label={`ลำดับ ${p.code}`} />
              <div className="row" style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                <button className="btn btn-sm" disabled={!dirty || !dr.name.trim()}
                  onClick={async () => { if (await call({ code: p.code, name: dr.name.trim(), backup: dr.backup || null, sort: dr.sort }, `บันทึกจุด ${p.code} แล้ว`)) { const d = { ...draft }; delete d[p.code]; setDraft(d); } }}>บันทึก</button>
                <button className="lk del" onClick={() => { setDel(del === p.code ? null : p.code); setMoveTo(others[0]?.code ?? ""); }}>ลบ</button>
              </div>
            </div>
            {pick?.code === p.code && (
              <div className="tr" style={{ gridTemplateColumns: "1fr", background: "#F8FAFC" }}>
                <div className="small" style={{ marginBottom: 6 }}><b>ธงที่ใช้ {p.name}</b> · กดเลือก/เอาออก ธงที่เลือกจากจุดอื่นจะย้ายมาจุดนี้ · ธงที่เอาออกจะเป็น “ไม่ระบุจุด”</div>
                <div className="row" style={{ gap: 6 }}>
                  {allFlags.length === 0 && <span className="muted small">ยังไม่มีธง</span>}
                  {allFlags.map((f) => {
                    const n = f.flag_no!;
                    const on = pick.sel.includes(n);
                    const from = pointOf(n);
                    return (
                      <button key={n} type="button" className={`pill${on ? " on" : ""}`}
                        title={from && from !== p.code ? `ตอนนี้อยู่ ${pName(from)}` : undefined}
                        onClick={() => setPick({ ...pick, sel: on ? pick.sel.filter((x) => x !== n) : [...pick.sel, n] })}>
                        ธง {n}{!on && from && from !== p.code ? <span className="muted xs"> (อยู่จุด {from})</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm btn-pri" onClick={async () => { if (await call({ action: "set-flags", code: p.code, flags: pick.sel }, `บันทึกธงที่ใช้ ${p.name} แล้ว`)) setPick(null); }}>บันทึก</button>
                  <button className="lk" onClick={() => setPick(null)}>ยกเลิก</button>
                  <span className="muted xs">{pick.sel.length} ธง</span>
                </div>
              </div>
            )}
            {del === p.code && (
              <div className="tr" style={{ gridTemplateColumns: "1fr", background: "#FFF1F2" }}>
                <div className="row" style={{ gap: 10 }}>
                  <b>ลบ {p.name}?</b>
                  {p.flags?.length ? (
                    <>
                      <span className="small">ธง {rangeText(p.flags)} ใช้จุดนี้อยู่ · ย้ายไป</span>
                      <select className="in" style={{ marginTop: 0, width: 220 }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="ย้ายไปจุด">
                        {others.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                      </select>
                    </>
                  ) : <span className="muted small">ไม่มีธงใช้จุดนี้</span>}
                  <span className="grow" />
                  <button className="btn btn-sm" style={{ color: "#9F1239", borderColor: "#FCA5A5" }} disabled={!!p.flags?.length && !moveTo}
                    onClick={async () => { if (await call({ action: "delete", code: p.code, move_to: p.flags?.length ? moveTo : null }, `ลบ ${p.name} แล้ว`)) setDel(null); }}>ยืนยันลบ</button>
                  <button className="lk" onClick={() => setDel(null)}>ยกเลิก</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {noPoint.length > 0 && <div className="tr" style={{ ...cols, background: "#FFFBEB" }}><b>?</b><div>ยังไม่ระบุจุดรวมพล</div><div className="mono small">{rangeText(noPoint)}</div><div className="muted small" style={{ gridColumn: "span 3" }}>กด “แก้” ที่จุดรวมพลด้านบนเพื่อกำหนดธงเหล่านี้</div></div>}
      <div className="tr" style={{ ...cols, background: "#F0FDFA" }}><b>–</b><div>กองอำนวยการกลาง</div><div className="muted small">ใครก็ได้ที่ไปประจำวันนั้น</div><div className="muted small">นับเป็นอพยพแล้ว</div><div /><div /></div>
      <form className="tr" style={cols} onSubmit={async (e) => { e.preventDefault(); if (await call({ code: add.code.trim(), name: add.name.trim(), backup: null, sort: points.length + 1 }, `เพิ่มจุด ${add.code.trim()} แล้ว`)) setAdd({ code: "", name: "" }); }}>
        <input className="in mono" style={{ marginTop: 0 }} placeholder="รหัส" value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} aria-label="รหัสจุดใหม่" />
        <input className="in" style={{ marginTop: 0 }} placeholder="ชื่อ / ตำแหน่งจุดรวมพลใหม่" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} aria-label="ชื่อจุดใหม่" />
        <div /><div /><div />
        <button className="btn btn-sm btn-pri" type="submit" disabled={!add.code.trim() || !add.name.trim() || points.some((x) => x.code === add.code.trim())}>+ เพิ่มจุด</button>
      </form>
      {msg && <div style={{ padding: "0 18px 12px" }}><p className={`notice ${msg.k}`}>{msg.t}</p></div>}
      <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>ตอนยืนยัน Incident ผู้ยืนยันปิดจุดที่ใช้ไม่ได้ → ธงของจุดนั้นย้ายไปจุดสำรองอัตโนมัติ · ลบจุดที่มีธงใช้อยู่ ต้องเลือกจุดที่จะย้ายธงไป</div>
    </div>
  );
}

function AccuracyCard({ a }: { a: Overview["accuracy"] }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="muted small" style={{ fontWeight: 600 }}>Accuracy ข้อมูลตั้งต้น (Excel)</div>
      <div className="row" style={{ alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <div className="mono" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>{a.pct ?? "—"}{a.pct != null && "%"}</div>
        <div className="muted small">ไม่ต้องแก้ {a.unchanged} / {a.imported} คน</div>
      </div>
      <div className="bar" style={{ height: 8, marginTop: 14 }}><div style={{ width: `${a.pct ?? 0}%`, background: "#1F3A5F" }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, marginTop: 14 }}>
        {[["ย้ายธง", a.moved], ["เพิ่มเอง", a.added], ["ลบออก", a.removed], ["แก้ข้อมูล", a.edited]].map(([l, v]) => (
          <div key={l as string} style={{ background: "var(--bg)", borderRadius: 10, padding: 8 }}>
            <div className="mono" style={{ fontWeight: 600, fontSize: 18 }}>{v}</div><div className="muted" style={{ fontSize: 11 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesCard() {
  const s = usePoll<{ states: any[] }>("/api/sources", 30000);
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    await Promise.allSettled([
      api("/api/sources/div/sync", { method: "POST" }),
      api("/api/sources/driver", { method: "POST", json: { action: "sync" } }),
    ]);
    s.reload(); setBusy(false);
  }
  const color = (x: any) => !x.ready ? "#9CA3AF" : !x.last_ok_at ? "#C2410C"
    : x.last_error && new Date(x.last_try_at) > new Date(x.last_ok_at) ? "#C2410C" : "#166534";
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ marginBottom: 10 }}><b className="grow">แหล่งข้อมูลระบบ</b><a className="small" href="/sources">ตรวจสอบ</a></div>
      <div className="stack" style={{ gap: 10, fontSize: 14 }}>
        {(s.data?.states ?? []).map((x) => (
          <div key={x.key} className="row" style={{ flexWrap: "nowrap" }}>
            <span className="dot" style={{ background: color(x) }} />
            <span className="grow">{x.label}</span>
            <span className="mono">{x.ready ? x.record_count ?? "—" : "ยังไม่เชื่อม"}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-sm btn-block" style={{ marginTop: 14 }} onClick={retry} disabled={busy}>{busy ? "กำลังดึง…" : "ทดสอบดึงข้อมูลอีกครั้ง"}</button>
    </div>
  );
}

function VersionsCard({ versions, state, onDone }: { versions: Overview["versions"]; state: Overview["version"]; onDone: () => void }) {
  const [arm, setArm] = useState<string | null>(null);
  const [ren, setRen] = useState<number | null>(null);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  async function call(json: any, ok: string) {
    setMsg(null);
    try { await api("/api/admin/versions", { method: "POST", json }); setArm(null); setRen(null); setMsg({ k: "ok", t: ok }); onDone(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  const twice = (key: string, fn: () => void) => (arm === key ? fn() : setArm(key));
  const label = (v: Overview["versions"][number]) => `v${v.id}${v.name ? ` “${v.name}”` : ""}`;
  return (
    <div className="card">
      <div className="card-h"><span className="grow">เวอร์ชันชุดธง</span><span className="muted xs" style={{ fontWeight: 500 }}>{versions.length} เวอร์ชัน</span></div>
      {versions.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มี นำเข้าไฟล์ธงหรือกด “บันทึกเป็นชุดธงใหม่” เพื่อสร้าง v1</div>}
      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        {versions.map((v) => {
          const active = v.id === state.active;
          return (
            <div key={v.id} className="vrow" style={{ background: active ? "#F0FDF4" : undefined }}>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <b className="mono">v{v.id}</b>
                {ren === v.id ? (
                  <form className="row grow" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); call({ action: "rename", id: v.id, name: val }, "แก้ชื่อแล้ว"); }}>
                    <input className="in" style={{ marginTop: 0 }} autoFocus maxLength={80} value={val} onChange={(e) => setVal(e.target.value)} aria-label={`ชื่อ v${v.id}`} placeholder="ชื่อเวอร์ชัน" />
                    <button className="btn btn-sm btn-pri" type="submit">บันทึก</button>
                    <button className="lk" type="button" onClick={() => setRen(null)}>ยกเลิก</button>
                  </form>
                ) : (
                  <b className="grow ellip" style={{ fontWeight: v.name ? 600 : 400, color: v.name ? undefined : "var(--muted)" }}>{v.name ?? "ไม่มีชื่อ"}</b>
                )}
                {active && ren !== v.id && <span className="chip ok sm">{state.dirty ? "ใช้อยู่ · มีแก้ไข" : "ใช้อยู่"}</span>}
              </div>
              <div className="muted xs" style={{ margin: "2px 0 6px 0" }}>
                {fmtDateTime(v.created_at)} · {v.people} คน · {v.created_by ?? "—"} · {v.note}
                {v.used > 0 && ` · ใช้ในเหตุการณ์ ${v.used} ครั้ง`}
              </div>
              {ren !== v.id && (
                <div className="row" style={{ gap: 6 }}>
                  {!active && <button className="btn btn-sm" onBlur={() => setArm(null)}
                    onClick={() => twice(`use${v.id}`, () => call({ action: "activate", id: v.id }, `ใช้ ${label(v)} แล้ว`))}>
                    {arm === `use${v.id}` ? (state.dirty ? "ที่แก้ไว้ยังไม่บันทึกจะหาย · กดยืนยัน" : "กดอีกครั้งเพื่อใช้") : "ใช้เวอร์ชันนี้"}</button>}
                  {active && state.dirty && <button className="btn btn-sm" onBlur={() => setArm(null)}
                    onClick={() => twice(`ow${v.id}`, () => call({ action: "overwrite", id: v.id }, `บันทึกทับ ${label(v)} แล้ว`))}>
                    {arm === `ow${v.id}` ? "กดอีกครั้งเพื่อบันทึกทับ" : "บันทึกทับด้วยที่แก้ไว้"}</button>}
                  <button className="btn btn-sm" onClick={() => { setRen(v.id); setVal(v.name ?? ""); setArm(null); }}>{v.name ? "แก้ชื่อ" : "ตั้งชื่อ"}</button>
                  {!active && <button className="btn btn-sm" style={{ color: "#9F1239" }} onBlur={() => setArm(null)}
                    onClick={() => twice(`del${v.id}`, () => call({ action: "delete", id: v.id }, `ลบ ${label(v)} แล้ว`))}>
                    {arm === `del${v.id}` ? "กดอีกครั้งเพื่อลบ" : "ลบ"}</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <div style={{ padding: "8px 18px 12px" }}><p className={`notice ${msg.k}`}>{msg.t}</p></div>}
      <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>
        ใช้เวอร์ชันนี้ = โหลดรายชื่อ ธง และผู้นำธงของเวอร์ชันนั้นมาใช้ (ผลตรวจทานธงจะเริ่มใหม่) · เหตุการณ์ที่เปิดอยู่ไม่กระทบ · ลบเวอร์ชันที่ใช้อยู่ไม่ได้
      </div>
    </div>
  );
}

function CodesCard() {
  const c = usePoll<{ codes: any[] }>("/api/admin/codes", 0);
  const blank = { label: "", meaning: "", tone: "warn", closes: false };
  const [f, setF] = useState<any>(blank);
  const [edit, setEdit] = useState<number | "new" | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function call(json: any) {
    setErr(null);
    try { await api("/api/admin/codes", { method: "POST", json }); setEdit(null); setDel(null); c.reload(); }
    catch (e: any) { setErr(e.message); }
  }
  const TONES: [string, string][] = [["warn", "เหลือง"], ["err", "แดง"], ["grey", "เทา"]];
  const form = (id?: number) => (
    <form className="tr" style={{ gridTemplateColumns: "1fr", background: "#F8FAFC" }} onSubmit={(e) => { e.preventDefault(); call({ ...f, id }); }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)", gap: 8 }}>
        <input className="in" style={{ marginTop: 0 }} placeholder="ชื่อ Code เช่น Code 500" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required autoFocus aria-label="ชื่อ Code" />
        <input className="in" style={{ marginTop: 0 }} placeholder="ความหมาย" value={f.meaning ?? ""} onChange={(e) => setF({ ...f, meaning: e.target.value })} aria-label="ความหมาย" />
      </div>
      <div className="row" style={{ gap: 8 }}>
        {TONES.map(([t, l]) => <button type="button" key={t} className={`pill${f.tone === t ? " on" : ""}`} onClick={() => setF({ ...f, tone: t })}>{l}</button>)}
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!f.closes} onChange={(e) => setF({ ...f, closes: e.target.checked })} />ใช้ปิดเหตุการณ์</label>
        <span className="grow" />
        <button className="btn btn-sm btn-pri" type="submit" disabled={!f.label.trim()}>{id ? "บันทึก" : "เพิ่ม"}</button>
        <button className="lk" type="button" onClick={() => setEdit(null)}>ยกเลิก</button>
      </div>
    </form>
  );
  return (
    <div className="card">
      <div className="card-h"><span className="grow">รายการ Code ประกาศ</span>
        <button className="btn btn-sm" onClick={() => { setF(blank); setEdit(edit === "new" ? null : "new"); }}>{edit === "new" ? "ยกเลิก" : "+ เพิ่ม"}</button></div>
      {edit === "new" && form()}
      {(c.data?.codes ?? []).length === 0 && edit !== "new" && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มี Code กด + เพิ่ม</div>}
      {(c.data?.codes ?? []).map((x) => edit === x.id ? <div key={x.id}>{form(x.id)}</div> : (
        <div key={x.id} className="tr" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto", background: del === x.id ? "#FFF1F2" : undefined }}>
          <span className={`chip ${x.tone}`}>{x.label}</span>
          <div className="muted small">{x.meaning || "—"}{x.closes && !/ปิดเหตุการณ์/.test(x.meaning ?? "") ? " · ใช้ปิดเหตุการณ์" : ""}</div>
          {del === x.id ? (
            <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <button className="btn btn-sm" style={{ color: "#9F1239", borderColor: "#FCA5A5" }} onClick={() => call({ action: "delete", id: x.id })}>ยืนยันลบ</button>
              <button className="lk" onClick={() => setDel(null)}>ยกเลิก</button>
            </div>
          ) : (
            <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
              <button className="lk" onClick={() => { setF({ label: x.label, meaning: x.meaning ?? "", tone: x.tone, closes: !!x.closes }); setEdit(x.id); setDel(null); }}>แก้ไข</button>
              <button className="lk del" onClick={() => { setDel(x.id); setEdit(null); }}>ลบ</button>
            </div>
          )}
        </div>
      ))}
      {err && <div style={{ padding: "0 18px 12px" }}><p className="notice err">{err}</p></div>}
      <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>Safety / Admin กดบันทึกประกาศได้จาก Dashboard · ลบ Code แล้วประกาศที่บันทึกไว้ในเหตุการณ์เก่ายังอยู่</div>
    </div>
  );
}

function ConfirmersCard() {
  const c = usePoll<{ confirmers: any[] }>("/api/admin/confirmers", 0);
  const [f, setF] = useState({ name: "", role: "safety", pin: "" });
  const [pinFor, setPinFor] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function call(json: any) {
    setErr(null);
    try { await api("/api/admin/confirmers", { method: "POST", json }); c.reload(); return true; } catch (e: any) { setErr(e.message); return false; }
  }
  return (
    <div className="card">
      <div className="card-h">PIN ผู้ยืนยัน Incident (สำรอง)</div>
      {(c.data?.confirmers ?? []).map((x) => (
        <div key={x.id} className="tr" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
          <div>{x.name}{!x.has_pin && <span className="chip err sm" style={{ marginLeft: 6 }}>ยังไม่มีรหัส</span>}</div>
          <span className={`chip ${x.role === "admin" ? "grey" : "warn"}`}>{x.role === "admin" ? "Admin" : "Safety Officer"}</span>
          {pinFor === x.id ? (
            <form className="row" style={{ flexWrap: "nowrap" }} onSubmit={async (e) => { e.preventDefault(); if (await call({ id: x.id, pin })) { setPinFor(null); setPin(""); } }}>
              <input className="in mono" style={{ marginTop: 0, width: 110 }} type="password" inputMode="numeric" placeholder="4–8 หลัก" value={pin} onChange={(e) => setPin(e.target.value)} aria-label={`รหัสใหม่ของ ${x.name}`} autoFocus />
              <button className="btn btn-sm btn-pri" type="submit">บันทึก</button>
            </form>
          ) : <button className="btn btn-sm" onClick={() => { setPinFor(x.id); setPin(""); }}>ตั้งรหัส</button>}
        </div>
      ))}
      <form className="tr" style={{ gridTemplateColumns: "1fr" }} onSubmit={async (e) => { e.preventDefault(); if (await call(f)) setF({ name: "", role: "safety", pin: "" }); }}>
        <input className="in" placeholder="ชื่อผู้ยืนยัน" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required aria-label="ชื่อผู้ยืนยัน" />
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select className="in" style={{ marginTop: 0 }} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} aria-label="บทบาท">
            <option value="safety">Safety Officer</option><option value="admin">Admin</option></select>
          <input className="in mono" style={{ marginTop: 0 }} type="password" inputMode="numeric" placeholder="รหัส 4–8 หลัก" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} aria-label="รหัส" />
          <button className="btn btn-sm" type="submit">+ เพิ่ม</button>
        </div>
      </form>
      {err && <div style={{ padding: "0 18px 12px" }}><p className="notice err">{err}</p></div>}
    </div>
  );
}
