"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PcHeader from "@/components/PcHeader";
import PinGate from "@/components/PinGate";
import UsersPanel from "@/components/UsersPanel";
import PlanEditor, { type FlagRow } from "@/components/PlanEditor";
import Tabs, { useTab } from "@/components/Tabs";
import { api, usePoll, fmtDateTime, rangeText } from "@/components/lib";
import { IUpload } from "@/components/Icons";
import type { MergedPlan, PlanFileResult, FlagSource } from "@/lib/parsers";

type Overview = {
  total: number; files: number; updated_at: string | null;
  flags: FlagRow[];
  leaders: { flag_no: number; leader_name: string | null; area: string | null; assembly_point: string | null; flag_no_old: number | null; cost_center: string | null }[];
  points: { code: string; name: string; backup: string | null; sort: number; flags: number[] | null }[];
  versions: { id: number; name: string | null; note: string; created_by: string; created_at: string; people: number }[];
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
  const nextV = (o.data?.versions[0]?.id ?? 0) + 1;
  const [tab, setTab] = useTab("admin", ["plan", "points", "users", "codes", "system"] as const, "plan");
  const [naming, setNaming] = useState(false);
  const [vName, setVName] = useState("");

  async function run(fn: () => Promise<any>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ k: "ok", t: ok }); o.reload(); return true; } catch (e: any) { setMsg({ k: "err", t: e.message }); return false; }
  }
  async function startDrill() {
    try {
      await api("/api/incidents", { method: "POST", json: { action: "drill", title: `ซ้อมอพยพ ${new Date().getFullYear()}` } });
      router.push("/dashboard");
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }

  return (
    <>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 0", display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div className="grow">
          <div className="muted small" style={{ fontWeight: 600 }}>เฉพาะ Admin · ใช้บน PC</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>ตั้งค่า</h1>
        </div>
        <button className="btn" onClick={startDrill} disabled={!o.data?.total}>เริ่มซ้อม</button>
        {naming ? (
          <form className="row" style={{ gap: 8, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault();
            run(() => api("/api/admin/versions", { method: "POST", json: { action: "save", note: "บันทึกหลังแก้ไข", name: vName } }),
              `บันทึกเป็นชุดธง v${nextV}${vName.trim() ? ` “${vName.trim()}”` : ""} แล้ว`).then((done) => { if (done) { setNaming(false); setVName(""); } }); }}>
            <input className="in" style={{ marginTop: 0, width: 280 }} autoFocus maxLength={80} placeholder={`ชื่อเวอร์ชัน เช่น ซ้อมใหญ่ ต.ค. ${new Date().getFullYear() + 543}`}
              value={vName} onChange={(e) => setVName(e.target.value)} aria-label="ชื่อเวอร์ชัน" />
            <button className="btn btn-pri" type="submit">บันทึก v{nextV}</button>
            <button className="btn" type="button" onClick={() => setNaming(false)}>ยกเลิก</button>
          </form>
        ) : (
          <button className="btn btn-pri" disabled={!o.data?.total} onClick={() => setNaming(true)}>บันทึกเป็นชุดธงใหม่ (v{nextV})</button>
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
      {tab === "plan" && (
        <div className="wrap layout" style={{ display: "grid" }}>
          <section className="stack" style={{ gap: 20, minWidth: 0 }}>
            <ImportCard onSaved={() => o.reload()} />
            {o.data && <PlanEditor flags={o.data.flags} leaders={o.data.leaders} points={o.data.points} total={o.data.total} onChanged={o.reload} />}
          </section>
          <aside className="stack" style={{ gap: 20, alignSelf: "start" }}>
            {o.data && <AccuracyCard a={o.data.accuracy} />}
            {o.data && <VersionsCard versions={o.data.versions} onDone={o.reload} />}
          </aside>
        </div>
      )}
      {tab === "points" && <div className="wrap">{o.data && <PointsCard points={o.data.points} onSaved={o.reload} />}</div>}
      {tab === "users" && <div className="wrap"><UsersPanel /></div>}
      {tab === "codes" && <div className="wrap"><div style={{ maxWidth: 760 }}><CodesCard /></div></div>}
      {tab === "system" && (
        <div className="wrap g2" style={{ display: "grid", alignItems: "start" }}>
          <SourcesCard />
          <ConfirmersCard />
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
  const [src, setSrc] = useState<FlagSource>("sheet");
  const [name, setName] = useState("");
  const m: (MergedPlan & { files: number }) | null = useMemo(() => {
    if (!raw) return null;
    return { ...mergePlanFn.current!(raw, src), files: raw.length };
  }, [raw, src]);
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
      setSrc("sheet");
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.leaders.map((l) => ({
      "จุดรวมพล": l.assembly_point ?? "", "เบอร์ธงอพยพ": l.flag_no, "เบอร์ธงเดิม": l.flag_no_old ?? "", "ผู้นำธงอพยพ": l.leader_name,
      "Cost Center": l.cost_center ?? "", "แผนก/พื้นที่": l.area ?? "", "หมายเหตุ": l.note ?? "" }))), "รายชื่อผู้นำธง");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(m.issues.map((i) => ({
      "ระดับ": i.level === "error" ? "ต้องแก้" : "เตือน", "ไฟล์": i.file, "ปัญหา": i.message }))), "ปัญหาที่พบ");
    XLSX.writeFile(wb, `Summary_EmergencyFlags_รวม_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async function save() {
    if (!m) return;
    setBusy(true);
    try {
      const people = m.people.map(({ sheet, ...p }) => p);
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
        <span className="muted xs" style={{ fontWeight: 500 }}>ไฟล์รายแผนก หัวตารางแถว 4 (จุดรวมพล … รหัสพนักงาน) + ชีตรายชื่อผู้นำธง · เลือกหลายไฟล์หรือทั้งโฟลเดอร์ได้</span></div>
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
            <span className="chip ok">นำเข้าได้ {m.people.length}</span><span className="chip warn">เตือน {warns.length}</span><span className="chip err">ต้องแก้ {errors.length}</span>
          </div>
          {(m.flagMismatch > 0 || src === "leaders") && (
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--line-3)", background: "#FFFBEB" }}>
              <b className="small">เบอร์ธงใหม่ในชีตรายชื่อไม่ตรงกับชีตผู้นำธง{src === "sheet" ? ` (${m.flagMismatch} คน)` : ""}</b>
              <div className="muted xs" style={{ margin: "2px 0 8px" }}>เลือกว่าจะใช้เบอร์ธงใหม่จากที่ไหน แล้วตรวจผลด้านล่างอีกครั้ง</div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className={`pill${src === "sheet" ? " on" : ""}`} onClick={() => setSrc("sheet")}>ตามชีตรายชื่อ (คอลัมน์ธงใหม่)</button>
                <button type="button" className={`pill${src === "leaders" ? " on" : ""}`} onClick={() => setSrc("leaders")}>แปลงจากธงเดิม ตามชีตผู้นำธง</button>
              </div>
            </div>
          )}
          {m.duplicates.length > 0 && <div className="tr" style={{ gridTemplateColumns: "1fr" }}><span className="small">
            พบ {m.duplicates.length} คนอยู่มากกว่าหนึ่งไฟล์ ระบบใช้ค่าจากไฟล์แรก เช่น {m.duplicates.slice(0, 3).map((d) => `${d.emp_id} (${d.files.join(", ")})`).join("; ")}</span></div>}
          {(errors.length > 0 || warns.length > 0) && (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <div className="tr th" style={{ gridTemplateColumns: "minmax(0,180px) minmax(0,1fr) 200px" }}><div>ไฟล์</div><div>ปัญหา</div><div>ผลเมื่อบันทึก</div></div>
              {[...errors, ...warns].slice(0, 300).map((i, k) => (
                <div key={k} className="tr" style={{ gridTemplateColumns: "minmax(0,180px) minmax(0,1fr) 200px" }}>
                  <div className="mono xs">{i.file}</div>
                  <div><span className={`chip ${i.level === "error" ? "err" : "warn"}`} style={{ whiteSpace: "normal" }}>{i.message}</span></div>
                  <div className="muted small">{i.level === "error" ? "ตรวจไฟล์ต้นทางแล้วนำเข้าใหม่" : "นำเข้า · แก้ภายหลังที่หน้าตรวจทานได้"}</div>
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
function PointsCard({ points, onSaved }: { points: Overview["points"]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, { name: string; backup: string }>>({});
  const [add, setAdd] = useState({ code: "", name: "" });
  const [err, setErr] = useState<string | null>(null);
  async function save(code: string, name: string, backup: string | null, sort = 0) {
    setErr(null);
    try { await api("/api/admin/points", { method: "POST", json: { code, name, backup, sort } }); onSaved(); }
    catch (e: any) { setErr(e.message); }
  }
  const cols = { gridTemplateColumns: "56px minmax(0,1fr) 160px 170px 90px" };
  return (
    <div className="card">
      <div className="card-h"><span className="grow" style={{ fontSize: 17 }}>จุดรวมพล</span></div>
      <div className="tr th" style={cols}><div>จุด</div><div>ชื่อ / ตำแหน่ง</div><div>ธงที่ใช้จุดนี้</div><div>จุดสำรอง</div><div /></div>
      {points.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มีจุดรวมพล ระบบสร้างให้จากคอลัมน์ “จุดรวมพล” เมื่อนำเข้าไฟล์ธง</div>}
      {points.map((p) => {
        const dr = draft[p.code] ?? { name: p.name, backup: p.backup ?? "" };
        const dirty = dr.name !== p.name || dr.backup !== (p.backup ?? "");
        return (
          <div key={p.code} className="tr" style={cols}>
            <b className="mono">{p.code}</b>
            <input className="in" style={{ marginTop: 0 }} value={dr.name} onChange={(e) => setDraft({ ...draft, [p.code]: { ...dr, name: e.target.value } })} aria-label={`ชื่อจุด ${p.code}`} />
            <div className="mono small">{p.flags?.length ? rangeText(p.flags) : "—"}</div>
            <select className="in" style={{ marginTop: 0 }} value={dr.backup} onChange={(e) => setDraft({ ...draft, [p.code]: { ...dr, backup: e.target.value } })} aria-label={`จุดสำรองของ ${p.code}`}>
              <option value="">ไม่มี</option>
              {points.filter((x) => x.code !== p.code).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            <button className="btn btn-sm" disabled={!dirty} onClick={() => save(p.code, dr.name, dr.backup || null, p.sort)}>บันทึก</button>
          </div>
        );
      })}
      <div className="tr" style={{ ...cols, background: "#F0FDFA" }}><b>–</b><div>กองอำนวยการกลาง</div><div className="muted small">ใครก็ได้ที่ไปประจำวันนั้น</div><div className="muted small">นับเป็นอพยพแล้ว</div><div /></div>
      <form className="tr" style={cols} onSubmit={(e) => { e.preventDefault(); save(add.code.trim(), add.name.trim(), null); setAdd({ code: "", name: "" }); }}>
        <input className="in mono" style={{ marginTop: 0 }} placeholder="รหัส" value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} aria-label="รหัสจุดใหม่" />
        <input className="in" style={{ marginTop: 0 }} placeholder="ชื่อ / ตำแหน่งจุดรวมพลใหม่" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} aria-label="ชื่อจุดใหม่" />
        <div /><div />
        <button className="btn btn-sm" type="submit" disabled={!add.code.trim() || !add.name.trim()}>+ เพิ่มจุด</button>
      </form>
      {err && <div style={{ padding: "0 18px 12px" }}><p className="notice err">{err}</p></div>}
      <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>ตอนยืนยัน Incident ผู้ยืนยันปิดจุดที่ใช้ไม่ได้ → ธงของจุดนั้นย้ายไปจุดสำรองอัตโนมัติ</div>
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

function VersionsCard({ versions, onDone }: { versions: Overview["versions"]; onDone: () => void }) {
  const [arm, setArm] = useState<number | null>(null);
  const [ren, setRen] = useState<number | null>(null);
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function back(id: number) {
    if (arm !== id) return setArm(id);
    await api("/api/admin/versions", { method: "POST", json: { action: "rollback", id } });
    setArm(null); onDone();
  }
  async function rename(id: number) {
    setErr(null);
    try { await api("/api/admin/versions", { method: "POST", json: { action: "rename", id, name: val } }); setRen(null); onDone(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="card">
      <div className="card-h">เวอร์ชันชุดธง</div>
      {versions.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มี นำเข้าไฟล์ธงเพื่อสร้าง v1</div>}
      {versions.map((v, i) => (
        <div key={v.id} className="tr" style={{ gridTemplateColumns: "40px minmax(0,1fr) auto" }}>
          <b className="mono">v{v.id}</b>
          {ren === v.id ? (
            <form className="row" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); rename(v.id); }}>
              <input className="in" style={{ marginTop: 0 }} autoFocus maxLength={80} value={val} onChange={(e) => setVal(e.target.value)} aria-label={`ชื่อ v${v.id}`} />
              <button className="btn btn-sm btn-pri" type="submit">บันทึก</button>
              <button className="lk" type="button" onClick={() => setRen(null)}>ยกเลิก</button>
            </form>
          ) : (
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <b className="ellip" style={{ fontWeight: v.name ? 600 : 400, color: v.name ? undefined : "var(--muted)" }}>{v.name ?? "ไม่มีชื่อ"}</b>
                <button className="lk" style={{ minHeight: 0, padding: 0, fontSize: 12 }} onClick={() => { setRen(v.id); setVal(v.name ?? ""); }}>{v.name ? "แก้ชื่อ" : "ตั้งชื่อ"}</button>
              </div>
              <div className="muted xs">{fmtDateTime(v.created_at)} · {v.people} คน · {v.created_by ?? "—"} · {v.note}</div>
            </div>
          )}
          {ren === v.id ? <span /> : i === 0 ? <span className="chip ok">ปัจจุบัน</span>
            : <button className="btn btn-sm" onClick={() => back(v.id)} onBlur={() => setArm(null)}>{arm === v.id ? "กดอีกครั้งเพื่อยืนยัน" : "ย้อนกลับ"}</button>}
        </div>
      ))}
      {err && <div style={{ padding: "0 18px 12px" }}><p className="notice err">{err}</p></div>}
    </div>
  );
}

function CodesCard() {
  const c = usePoll<{ codes: any[] }>("/api/admin/codes", 0);
  const [f, setF] = useState({ label: "", meaning: "", tone: "warn" });
  const [open, setOpen] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/admin/codes", { method: "POST", json: f });
    setF({ label: "", meaning: "", tone: "warn" }); setOpen(false); c.reload();
  }
  return (
    <div className="card">
      <div className="card-h"><span className="grow">รายการ Code ประกาศ</span><button className="btn btn-sm" onClick={() => setOpen(!open)}>+ เพิ่ม</button></div>
      {(c.data?.codes ?? []).map((x) => (
        <div key={x.id} className="tr" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
          <span className={`chip ${x.tone}`}>{x.label}</span>
          <div className="muted small">{x.meaning ?? "[ความหมาย]"}{x.closes ? " · ใช้ปิดเหตุการณ์" : ""}</div>
          <button className="lk del" onClick={async () => { await api("/api/admin/codes", { method: "POST", json: { action: "delete", id: x.id } }); c.reload(); }}>ลบ</button>
        </div>
      ))}
      {open && (
        <form className="tr" style={{ gridTemplateColumns: "1fr" }} onSubmit={add}>
          <input className="in" placeholder="ชื่อ Code เช่น Code 500" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required />
          <input className="in" placeholder="ความหมาย" value={f.meaning} onChange={(e) => setF({ ...f, meaning: e.target.value })} />
          <div className="row">{[["warn", "เหลือง"], ["err", "แดง"], ["grey", "เทา"]].map(([t, l]) => (
            <button type="button" key={t} className={`pill${f.tone === t ? " on" : ""}`} onClick={() => setF({ ...f, tone: t })}>{l}</button>))}
            <button className="btn btn-sm btn-pri" type="submit">บันทึก</button></div>
        </form>
      )}
      <div className="muted xs" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>Safety / Admin กดบันทึกประกาศได้จาก Dashboard</div>
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
