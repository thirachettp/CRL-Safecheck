"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PcHeader from "@/components/PcHeader";
import PinGate from "@/components/PinGate";
import UsersPanel from "@/components/UsersPanel";
import Tabs, { useTab } from "@/components/Tabs";
import { api, usePoll, fmtDateTime, rangeText } from "@/components/lib";
import { IUpload } from "@/components/Icons";
import type { MergedPlan } from "@/lib/parsers";

type Overview = {
  total: number; files: number; updated_at: string | null;
  flags: { flag_no: number | null; assembly_point: string | null; people: number; male: number; female: number; area: string | null;
    reviewed_by: string | null; reviewed_at: string | null; edits_after: number }[];
  leaders: { flag_no: number; leader_name: string }[];
  points: { code: string; name: string; backup: string | null; sort: number; flags: number[] | null }[];
  versions: { id: number; note: string; created_by: string; created_at: string; people: number }[];
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

  async function run(fn: () => Promise<any>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ k: "ok", t: ok }); o.reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); }
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
        <button className="btn btn-pri" disabled={!o.data?.total}
          onClick={() => run(() => api("/api/admin/versions", { method: "POST", json: { action: "save", note: "บันทึกหลังตรวจทาน" } }), `บันทึกเป็นชุดธง v${nextV} แล้ว`)}>
          บันทึกเป็นชุดธง v{nextV}
        </button>
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
            {o.data && <FlagsCard data={o.data} />}
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
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<(MergedPlan & { files: number }) | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);

  async function read(files: FileList | File[]) {
    const list = [...files].filter((f) => /\.xlsx?$/i.test(f.name));
    if (!list.length) return setMsg({ k: "warn", t: "เลือกไฟล์ .xlsx ของแผนอพยพ" });
    setBusy(true); setMsg(null);
    try {
      const XLSX = await import("xlsx");
      const { parsePlanWorkbook, mergePlan } = await import("@/lib/parsers");
      const res = [];
      for (const f of list) res.push(parsePlanWorkbook(XLSX.read(await f.arrayBuffer(), { type: "array" }), f.name));
      setM({ ...mergePlan(res), files: list.length });
    } catch (e: any) { setMsg({ k: "err", t: `อ่านไฟล์ไม่สำเร็จ: ${e.message}` }); } finally { setBusy(false); }
  }
  async function save() {
    if (!m) return;
    setBusy(true);
    try {
      const r = await api("/api/plan", { method: "POST", json: { people: m.people, leaders: m.leaders, files: m.files } });
      setMsg({ k: "ok", t: `บันทึกเป็นชุดธง v${r.version} แล้ว ${r.saved} คน ผู้นำธง ${r.leaders} ธง` });
      setM(null); onSaved();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  }
  const errors = m?.issues.filter((i) => i.level === "error") ?? [];
  const warns = m?.issues.filter((i) => i.level === "warn") ?? [];
  return (
    <div className="card">
      <div className="card-h"><span className="grow" style={{ fontSize: 17 }}>นำเข้าไฟล์ธง (Excel)</span>
        <span className="muted xs" style={{ fontWeight: 500 }}>ไฟล์รายแผนก หัวตารางมี “รหัสพนักงาน” + ชีตผู้นำธง</span></div>
      <div className="dropzone" data-over={over} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}>
        <IUpload size={32} color="#1F3A5F" />
        <div className="grow"><b>{busy ? "กำลังอ่านไฟล์…" : "ลากไฟล์ .xlsx มาวาง หรือเลือกไฟล์"}</b>
          <div className="muted small">ระบบจะตรวจก่อน · ยังไม่มีผลกับชุดธงจนกว่าจะกดบันทึก</div></div>
        <span className="btn btn-sm">เลือกไฟล์</span>
        <input ref={input} type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => e.target.files && read(e.target.files)} />
      </div>
      {msg && <div style={{ padding: "0 18px 14px" }}><p className={`notice ${msg.k}`}>{msg.t}</p></div>}
      {m && (
        <>
          <div className="row" style={{ padding: "12px 18px", borderTop: "1px solid var(--line-3)", background: "var(--subtle)" }}>
            <b className="grow">ผลตรวจ: {m.files} ไฟล์ · {m.people.length} คน · {new Set(m.people.map((p) => p.flag_no)).size} ธง</b>
            <span className="chip ok">นำเข้าได้ {m.people.length}</span><span className="chip warn">เตือน {warns.length}</span><span className="chip err">ต้องแก้ {errors.length}</span>
          </div>
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
            <button className="btn btn-pri" onClick={save} disabled={busy || !m.people.length}>บันทึกเป็นชุดธงใหม่ ({m.people.length} คน)</button>
            <button className="btn" onClick={() => setM(null)} disabled={busy}>ยกเลิก</button>
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

// ---------- ธง ----------
function FlagsCard({ data }: { data: Overview }) {
  const [all, setAll] = useState(false);
  const leader = new Map(data.leaders.map((l) => [l.flag_no, l.leader_name]));
  const pName = (c: string | null) => (c ? data.points.find((p) => p.code === c)?.name ?? c : "—");
  const flags = data.flags.filter((f) => f.flag_no != null);
  const rev = flags.filter((f) => f.reviewed_at && !f.edits_after).length;
  const after = flags.filter((f) => f.reviewed_at && f.edits_after).length;
  const none = flags.filter((f) => !f.reviewed_at).length;
  const cols = { gridTemplateColumns: "56px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) 64px 72px 200px" };
  return (
    <div className="card">
      <div className="card-h"><span className="grow" style={{ fontSize: 17 }}>ธง ({flags.length} ธง · {data.total} คน)</span>
        <span className="chip ok">ตรวจแล้ว {rev}</span><span className="chip warn">แก้หลังตรวจ {after}</span><span className="chip grey">ยังไม่ตรวจ {none}</span></div>
      <div className="scroll-x"><div style={{ minWidth: 820 }}>
        <div className="tr th" style={cols}><div>ธง</div><div>พื้นที่</div><div>จุดรวมพล</div><div>หัวหน้าธง</div><div>สมาชิก</div><div>ชาย/หญิง</div><div>ตรวจทานล่าสุด</div></div>
        {(all ? flags : flags.slice(0, 10)).map((f) => (
          <div key={f.flag_no!} className="tr" style={cols}>
            <b className="mono">{f.flag_no}</b><div>{f.area ?? "—"}</div><div>{pName(f.assembly_point)}</div>
            <div>{leader.get(f.flag_no!) ?? <span className="chip warn">ไม่มีผู้นำธง</span>}</div>
            <div className="mono">{f.people}</div><div className="mono small">{f.male}/{f.female}</div>
            <div>{!f.reviewed_at ? <span className="chip grey">ยังไม่ตรวจ</span>
              : f.edits_after ? <span className="chip warn">แก้หลังตรวจ {f.edits_after} รายการ</span>
              : <span className="chip ok">ตรวจแล้ว · {f.reviewed_by}</span>}</div>
          </div>
        ))}
      </div></div>
      <div className="muted small" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>
        แสดง {all ? flags.length : Math.min(10, flags.length)} จาก {flags.length} ธง{flags.length > 10 && <> · <button className="lk" style={{ minHeight: 0, padding: 0 }} onClick={() => setAll(!all)}>{all ? "ย่อ" : "ดูทั้งหมด"}</button></>}
      </div>
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
  async function back(id: number) {
    if (arm !== id) return setArm(id);
    await api("/api/admin/versions", { method: "POST", json: { action: "rollback", id } });
    setArm(null); onDone();
  }
  return (
    <div className="card">
      <div className="card-h">เวอร์ชันชุดธง</div>
      {versions.length === 0 && <div className="tr muted small" style={{ gridTemplateColumns: "1fr" }}>ยังไม่มี นำเข้าไฟล์ธงเพื่อสร้าง v1</div>}
      {versions.map((v, i) => (
        <div key={v.id} className="tr" style={{ gridTemplateColumns: "48px minmax(0,1fr) auto" }}>
          <b className="mono">v{v.id}</b>
          <div><div className={i ? "muted small" : ""}>{i === 0 ? "ใช้งานอยู่" : v.note}</div>
            <div className="muted xs">{fmtDateTime(v.created_at)} · {v.people} คน · {v.created_by ?? "—"}{i === 0 ? ` · ${v.note}` : ""}</div></div>
          {i === 0 ? <span className="chip ok">ปัจจุบัน</span>
            : <button className="btn btn-sm" onClick={() => back(v.id)} onBlur={() => setArm(null)}>{arm === v.id ? "กดอีกครั้งเพื่อยืนยัน" : "ย้อนกลับ"}</button>}
        </div>
      ))}
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
