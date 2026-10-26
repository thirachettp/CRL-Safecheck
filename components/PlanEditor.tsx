"use client";
// ตั้งค่า › ชุดธง: แก้/เพิ่ม ธง และคนในธง (Admin)
import { Fragment, useMemo, useState } from "react";
import { api, usePoll } from "./lib";
import PlanSearch from "./PlanSearch";

export type FlagRow = {
  flag_no: string | null; assembly_point: string | null; people: number; male: number; female: number; area: string | null;
  flag_no_old: string | null; reviewed_by: string | null; reviewed_at: string | null; edits_after: number;
};
type Leader = { flag_no: string; leader_name: string | null; area: string | null; assembly_point: string | null; flag_no_old: string | null; cost_center: string | null };
type Point = { code: string; name: string };
type Person = {
  emp_id: string; prefix: string | null; first_name: string; last_name: string | null; name_en?: string | null; gender: string | null; flag_no: string;
  tel: string | null; cost_center: string | null; area: string | null; role: string | null; added_manually: boolean;
  removed: boolean; removed_reason: string | null; removed_by: string | null; edited_by: string | null;
};

const ROLES = ["ผู้อพยพ", "ผู้นำธงอพยพ", "ผู้ช่วยผู้นำธง"];
const EMP_OK = /^[A-Z]{0,5}\d{4,12}$/i;
const PREFIX = ["", "นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms.", "Miss"];
const REASONS = ["ลาออกแล้ว", "ย้ายสาขา", "ไม่ได้ทำงานพื้นที่นี้", "ย้ายไปแผนกอื่น", "อื่นๆ"];
const isLeader = (r: string | null) => /^\s*ผู้นำ/.test(r ?? "");

async function call(json: any) {
  return api("/api/admin/flags", { method: "POST", json });
}

export default function PlanEditor({ flags, leaders, points, total, roles = [], onChanged }: {
  flags: FlagRow[]; leaders: Leader[]; points: Point[]; total: number; roles?: string[]; onChanged: () => void;
}) {
  const roleList = [...new Set([...ROLES, ...roles])];
  const [open, setOpen] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [hl, setHl] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [delMode, setDelMode] = useState<"move" | "remove">("move");
  const [moveTo, setMoveTo] = useState<string>("");
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delMsg, setDelMsg] = useState<string | null>(null);
  async function doDelete(f: FlagRow) {
    setDelErr(null);
    try {
      const r: any = await call({ action: "flag-delete", flag_no: f.flag_no,
        ...(f.people > 0 ? (delMode === "move" ? { move_to: moveTo } : { remove_people: true }) : {}) });
      setDelMsg(`ลบธง ${f.flag_no} แล้ว${r.moved ? ` · ย้าย ${r.moved} คนไปธง ${moveTo}` : ""}${r.removed ? ` · เอา ${r.removed} คนออกจากชุดธง (คืนค่าได้ถ้าสร้างธง ${f.flag_no} ใหม่)` : ""}`);
      setDel(null); if (open === f.flag_no) setOpen(null); onChanged();
    } catch (e: any) { setDelErr(e.message); }
  }
  const leader = useMemo(() => new Map(leaders.map((l) => [l.flag_no, l])), [leaders]);
  const pName = (c: string | null) => (c ? points.find((p) => p.code === c)?.name ?? c : "—");
  const list = flags.filter((f) => f.flag_no != null);
  const t = term.trim().toLowerCase();
  const shown = t
    ? list.filter((f) => `${f.flag_no} ${f.area ?? ""} ${leader.get(f.flag_no!)?.leader_name ?? ""} ${f.flag_no_old ?? ""}`.toLowerCase().includes(t))
    : list;
  const rev = list.filter((f) => f.reviewed_at && !f.edits_after).length;
  const after = list.filter((f) => f.reviewed_at && f.edits_after).length;
  const none = list.filter((f) => !f.reviewed_at).length;
  const limit = all || t ? shown : shown.slice(0, 15);
  const nextFlag = String(Math.max(0, ...list.map((f) => parseInt(f.flag_no!, 10)).filter(Number.isFinite)) + 1);

  return (
    <div className="card">
      <div className="card-h" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="grow" style={{ fontSize: 17 }}>ธง ({list.length} ธง · {total} คน)</span>
        <span className="chip ok">ตรวจแล้ว {rev}</span><span className="chip warn">แก้หลังตรวจ {after}</span><span className="chip grey">ยังไม่ตรวจ {none}</span>
      </div>
      <div className="row" style={{ padding: "10px 18px", gap: 8, borderBottom: "1px solid var(--line-3)" }}>
        <input className="in" style={{ marginTop: 0, width: 240 }} placeholder="กรองธง: เบอร์ / พื้นที่ / ผู้นำธง" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="กรองธง" />
        <div className="grow" style={{ maxWidth: 420 }}>
          <PlanSearch endpoint="/api/admin/flags" placeholder="ค้นหาคน: ชื่อ / รหัสพนักงาน / Cost Center" onPick={(h) => {
            if (!h.flag_no) return;
            setTerm(""); setAll(true); setOpen(h.flag_no); setHl(h.emp_id);
            setTimeout(() => document.getElementById(`pe-${h.emp_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 900);
            setTimeout(() => setHl(null), 5000);
          }} />
        </div>
        <span className="grow" />
        <button className="btn btn-sm btn-pri" onClick={() => setAdding(!adding)}>{adding ? "ยกเลิก" : "+ เพิ่มธง"}</button>
      </div>
      {adding && (
        <FlagForm isNew init={{ flag_no: nextFlag, leader_name: "", area: "", assembly_point: points[0]?.code ?? "", flag_no_old: null, cost_center: "" }}
          points={points} onDone={(n) => { setAdding(false); onChanged(); if (n) setOpen(n); }} />
      )}
      <div className="scroll-x">
        <table className="tbl" style={{ minWidth: 760 }}>
          <thead><tr><th style={{ width: 56 }}>ธง</th><th>พื้นที่</th><th>จุดรวมพล</th><th>ผู้นำธง</th><th style={{ width: 70 }}>สมาชิก</th><th style={{ width: 80 }}>ชาย/หญิง</th><th>ตรวจทานล่าสุด</th><th style={{ width: 110 }} /></tr></thead>
          <tbody>
            {limit.length === 0 && <tr><td colSpan={8} className="muted small">{t ? "ไม่พบธงที่ค้นหา" : "ยังไม่มีธง นำเข้าไฟล์ธง หรือกด + เพิ่มธง"}</td></tr>}
            {limit.map((f) => {
              const n = f.flag_no!;
              const isOpen = open === n;
              const l = leader.get(n);
              return (
                <Fragment key={n}>
                  <tr className={isOpen ? "editing" : ""} style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : n)}>
                    <td><b className="mono">{n}</b>{f.flag_no_old != null && <div className="muted xs" style={{ whiteSpace: "nowrap" }}>เดิม {f.flag_no_old}</div>}</td>
                    <td>{f.area ?? "—"}</td>
                    <td>{pName(f.assembly_point)}</td>
                    <td>{l?.leader_name ?? <span className="chip warn">ไม่มีผู้นำธง</span>}</td>
                    <td className="mono">{f.people}</td>
                    <td className="mono small">{f.male}/{f.female}</td>
                    <td>{!f.reviewed_at ? <span className="chip grey">ยังไม่ตรวจ</span>
                      : f.edits_after ? <span className="chip warn">แก้หลังตรวจ {f.edits_after}</span>
                      : <span className="chip ok">ตรวจแล้ว · {f.reviewed_by}</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span className="lk">{isOpen ? "ปิด" : "แก้ไข"}</span>{" "}
                      <button className="lk del" onClick={(e) => { e.stopPropagation(); setDel(del === n ? null : n); setDelErr(null); setDelMode("move"); setMoveTo(list.find((x) => x.flag_no !== n)?.flag_no ?? ""); }}>ลบ</button>
                    </td>
                  </tr>
                  {del === n && (
                    <tr className="editing"><td colSpan={8} style={{ background: "#FFF1F2" }}>
                      <div className="row" style={{ gap: 10 }}>
                        <b>ลบธง {n}{f.area ? ` (${f.area})` : ""}?</b>
                        {f.people > 0 ? (
                          <>
                            <span className="small">ธงนี้มี {f.people} คน</span>
                            <label className="row small" style={{ gap: 4 }}><input type="radio" checked={delMode === "move"} onChange={() => setDelMode("move")} />ย้ายคนไปธง</label>
                            <select className="in" style={{ marginTop: 0, width: 110 }} value={moveTo} disabled={delMode !== "move"} onChange={(e) => setMoveTo(e.target.value)} aria-label="ย้ายไปธง">
                              {list.filter((x) => x.flag_no !== n).map((x) => <option key={x.flag_no!} value={x.flag_no!}>ธง {x.flag_no}</option>)}
                            </select>
                            <label className="row small" style={{ gap: 4 }}><input type="radio" checked={delMode === "remove"} onChange={() => setDelMode("remove")} />เอาคนออกจากชุดธงด้วย</label>
                          </>
                        ) : <span className="muted small">ธงนี้ไม่มีคน</span>}
                        <span className="grow" />
                        <button className="btn btn-sm" style={{ color: "#9F1239", borderColor: "#FCA5A5" }} disabled={f.people > 0 && delMode === "move" && moveTo === ""} onClick={() => doDelete(f)}>ยืนยันลบธง {n}</button>
                        <button className="lk" onClick={() => setDel(null)}>ยกเลิก</button>
                      </div>
                      {delErr && <p className="notice err" style={{ marginTop: 8 }}>{delErr}</p>}
                    </td></tr>
                  )}
                  {isOpen && (
                    <tr><td colSpan={8} style={{ padding: 0, background: "#F8FAFC" }}><div style={{ width: 0, minWidth: "100%" }}>
                      <FlagDetail flag={n} row={f} leader={l} points={points} roles={roleList} hl={hl} flags={list.map((x) => x.flag_no!)} onChanged={onChanged} onDeleted={() => { setOpen(null); onChanged(); }} />
                    </div></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {delMsg && <div style={{ padding: "10px 18px 0" }}><p className="notice ok">{delMsg}</p></div>}
      <div className="muted small" style={{ padding: "10px 18px", borderTop: "1px solid var(--line-3)" }}>
        แสดง {limit.length} จาก {shown.length} ธง{!t && shown.length > 15 && <> · <button className="lk" style={{ minHeight: 0, padding: 0 }} onClick={() => setAll(!all)}>{all ? "ย่อ" : "ดูทั้งหมด"}</button></>}
        {" "}· กดแถวเพื่อแก้ข้อมูลธงและรายชื่อ · แก้เสร็จแล้วบันทึกทับเวอร์ชันที่ใช้อยู่ หรือบันทึกเป็นเวอร์ชันใหม่
      </div>
    </div>
  );
}

type FlagDraft = { flag_no: string; leader_name: string; area: string; assembly_point: string; flag_no_old: string | null; cost_center: string };

function FlagForm({ init, isNew, points, onDone, onDelete, canDelete }: {
  init: FlagDraft; isNew?: boolean; points: Point[]; onDone: (flag?: string) => void; onDelete?: () => void; canDelete?: boolean;
}) {
  const [f, setF] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [arm, setArm] = useState(false);
  const dirty = isNew || JSON.stringify(f) !== JSON.stringify(init);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await call({ action: isNew ? "flag-add" : "flag-save", ...f }); onDone(f.flag_no); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} style={{ padding: "12px 18px", borderBottom: "1px solid var(--line-3)", background: isNew ? "#F0FDFA" : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, alignItems: "end" }}>
        <label className="lb xs">เบอร์ธง
          <input className="in mono" maxLength={20} value={f.flag_no} disabled={!isNew} onChange={(e) => setF({ ...f, flag_no: e.target.value })} placeholder="เช่น 17 หรือ 17A" /></label>
        <label className="lb xs">ธงเดิม
          <input className="in mono" maxLength={20} value={f.flag_no_old ?? ""} onChange={(e) => setF({ ...f, flag_no_old: e.target.value === "" ? null : e.target.value })} /></label>
        <label className="lb xs">พื้นที่ / แผนก
          <input className="in" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="เช่น MZ3 ฝั่ง WH" /></label>
        <label className="lb xs">ผู้นำธง
          <input className="in" value={f.leader_name} onChange={(e) => setF({ ...f, leader_name: e.target.value })} placeholder="ชื่อ-นามสกุล" /></label>
        <label className="lb xs">จุดรวมพล
          <select className="in" value={f.assembly_point} onChange={(e) => setF({ ...f, assembly_point: e.target.value })}>
            <option value="">ไม่ระบุ</option>
            {points.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select></label>
        <label className="lb xs">Cost Center
          <input className="in mono" value={f.cost_center} onChange={(e) => setF({ ...f, cost_center: e.target.value })} /></label>
      </div>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn btn-sm btn-pri" type="submit" disabled={busy || !dirty || !f.flag_no}>{isNew ? "เพิ่มธง" : "บันทึกข้อมูลธง"}</button>
        {!isNew && <span className="muted xs">เปลี่ยนจุดรวมพลแล้ว คนทั้งธงย้ายจุดตาม</span>}
        <span className="grow" />
        {onDelete && (canDelete
          ? <button type="button" className="btn btn-sm" style={{ color: "#9F1239" }} onBlur={() => setArm(false)}
              onClick={() => (arm ? onDelete() : setArm(true))}>{arm ? "กดอีกครั้งเพื่อลบธง" : "ลบธงนี้"}</button>
          : <span className="muted xs">ลบธงได้เมื่อไม่มีคนในธง</span>)}
      </div>
      {err && <p className="notice err" style={{ marginTop: 8 }}>{err}</p>}
    </form>
  );
}

function FlagDetail({ flag, row, leader, points, roles, flags, hl, onChanged, onDeleted }: {
  flag: string; row: FlagRow; leader?: Leader; points: Point[]; roles: string[]; flags: string[]; hl?: string | null; onChanged: () => void; onDeleted: () => void;
}) {
  const d = usePoll<{ people: Person[] }>(`/api/admin/flags?flag=${flag}`, 0);
  const [edit, setEdit] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const people = d.data?.people ?? [];
  const active = people.filter((p) => !p.removed);
  const removed = people.filter((p) => p.removed);

  async function run(json: any) {
    setErr(null);
    try { await call(json); setEdit(null); setDel(null); setAdding(false); d.reload(); onChanged(); return true; }
    catch (x: any) { setErr(x.message); return false; }
  }
  const blank = { emp_id: "", prefix: "", first_name: "", last_name: "", name_en: "", gender: "ชาย", role: "ผู้อพยพ", cost_center: leader?.cost_center ?? "", area: leader?.area ?? row.area ?? "", tel: "", flag_no: flag };
  const start = (p: Person) => {
    setEdit(p.emp_id); setDel(null);
    setDraft({ new_emp_id: p.emp_id, prefix: p.prefix ?? "", first_name: p.first_name, last_name: p.last_name ?? "", name_en: p.name_en ?? "", gender: p.gender ?? "", role: p.role ?? "ผู้อพยพ",
      cost_center: p.cost_center ?? "", area: p.area ?? "", tel: p.tel ?? "", flag_no: p.flag_no });
  };
  const fields = (v: any, set: (x: any) => void, withId: boolean) => (
    <>
      {withId && <td><input className="in mono" style={{ marginTop: 0 }} placeholder="รหัสพนักงาน" value={v.emp_id} onChange={(e) => set({ ...v, emp_id: e.target.value })} aria-label="รหัสพนักงาน" /></td>}
      <td>
        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <select className="in" style={{ marginTop: 0, width: 92 }} value={v.prefix} onChange={(e) => set({ ...v, prefix: e.target.value })} aria-label="คำนำหน้า">
            {PREFIX.map((x) => <option key={x} value={x}>{x || "—"}</option>)}</select>
          <input className="in" style={{ marginTop: 0 }} placeholder="ชื่อ" value={v.first_name} onChange={(e) => set({ ...v, first_name: e.target.value })} aria-label="ชื่อ" />
          <input className="in" style={{ marginTop: 0 }} placeholder="นามสกุล" value={v.last_name} onChange={(e) => set({ ...v, last_name: e.target.value })} aria-label="นามสกุล" />
        </div>
        <input className="in" style={{ marginTop: 4 }} placeholder="ชื่อ-นามสกุล ภาษาอังกฤษ (ไม่บังคับ)" lang="en" value={v.name_en ?? ""} onChange={(e) => set({ ...v, name_en: e.target.value })} aria-label="ชื่อภาษาอังกฤษ" />
      </td>
      <td><select className="in" style={{ marginTop: 0 }} value={v.gender} onChange={(e) => set({ ...v, gender: e.target.value })} aria-label="เพศ">
        <option value="">—</option><option>ชาย</option><option>หญิง</option><option>อื่นๆ</option></select></td>
      <td><input className="in" style={{ marginTop: 0 }} list={`roles-${flag}`} value={v.role} onChange={(e) => set({ ...v, role: e.target.value })} aria-label="บทบาท" placeholder="ผู้อพยพ" /></td>
      <td>
        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <input className="in mono" style={{ marginTop: 0, width: 84 }} placeholder="CC" value={v.cost_center} onChange={(e) => set({ ...v, cost_center: e.target.value })} aria-label="Cost Center" />
          <input className="in" style={{ marginTop: 0 }} placeholder="แผนก/พื้นที่" value={v.area} onChange={(e) => set({ ...v, area: e.target.value })} aria-label="แผนก" />
        </div>
      </td>
      <td><input className="in mono" style={{ marginTop: 0 }} placeholder="เบอร์โทร" value={v.tel} onChange={(e) => set({ ...v, tel: e.target.value })} aria-label="เบอร์โทร" /></td>
      <td><select className="in mono" style={{ marginTop: 0 }} value={v.flag_no} onChange={(e) => set({ ...v, flag_no: e.target.value })} aria-label="ธง">
        {flags.map((x) => <option key={x} value={x}>ธง {x}</option>)}</select></td>
    </>
  );

  return (
    <div>
      <FlagForm key={JSON.stringify(leader ?? {}) + row.assembly_point}
        init={{ flag_no: flag, leader_name: leader?.leader_name ?? "", area: leader?.area ?? row.area ?? "", assembly_point: leader?.assembly_point ?? row.assembly_point ?? "",
          flag_no_old: leader?.flag_no_old ?? row.flag_no_old ?? null, cost_center: leader?.cost_center ?? "" }}
        points={points} onDone={() => onChanged()} />
      <datalist id={`roles-${flag}`}>{roles.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="row" style={{ padding: "10px 18px 6px" }}>
        <b className="grow">รายชื่อในธง {flag} ({active.length} คน)</b>
        <button className="btn btn-sm" onClick={() => { setAdding(!adding); setDraft(blank); setEdit(null); }}>{adding ? "ยกเลิก" : "+ เพิ่มคน"}</button>
      </div>
      {err && <div style={{ padding: "0 18px 8px" }}><p className="notice err">{err}</p></div>}
      <div className="scroll-x" style={{ padding: "0 8px 12px" }}>
        <table className="tbl" style={{ minWidth: 900, background: "#fff" }}>
          <thead><tr><th style={{ width: 110 }}>รหัส</th><th>ชื่อ-นามสกุล</th><th style={{ width: 64 }}>เพศ</th><th style={{ width: 150 }}>บทบาท</th><th>Cost Center · แผนก</th><th style={{ width: 110 }}>เบอร์โทร</th><th style={{ width: 70 }}>ธง</th><th style={{ width: 100 }} /></tr></thead>
          <tbody>
            {adding && (
              <tr className="editing">
                {fields(draft, setDraft, true)}
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm btn-pri" disabled={!draft.first_name?.trim()} onClick={() => run({ action: "person-add", ...draft })}>เพิ่ม</button>
                </td>
              </tr>
            )}
            {!d.data && !d.error && <tr><td colSpan={8} className="muted small">กำลังโหลด…</td></tr>}
            {d.data && active.length === 0 && !adding && <tr><td colSpan={8} className="muted small">ยังไม่มีคนในธงนี้ กด + เพิ่มคน</td></tr>}
            {active.map((p) => edit === p.emp_id ? (
              <tr key={p.emp_id} className="editing">
                <td><input className="in mono" style={{ marginTop: 0 }} value={draft.new_emp_id ?? p.emp_id} onChange={(e) => setDraft({ ...draft, new_emp_id: e.target.value })} aria-label="รหัสพนักงาน" /></td>
                {fields(draft, setDraft, false)}
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm btn-pri" onClick={() => run({ action: "person-edit", emp_id: p.emp_id, ...draft })}>บันทึก</button>{" "}
                  <button className="lk" onClick={() => setEdit(null)}>ยกเลิก</button>
                </td>
              </tr>
            ) : del === p.emp_id ? (
              <tr key={p.emp_id} className="editing">
                <td className="mono">{p.emp_id}</td>
                <td colSpan={5}>
                  <div className="row" style={{ gap: 8 }}>
                    <span>ลบ <b>{p.first_name} {p.last_name}</b> ออกจากชุดธง เหตุผล</span>
                    <select className="in" style={{ marginTop: 0, width: 220 }} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="เหตุผล">
                      {REASONS.map((x) => <option key={x}>{x}</option>)}</select>
                  </div>
                </td>
                <td />
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm" style={{ color: "#9F1239" }} onClick={() => run({ action: "person-remove", emp_id: p.emp_id, reason })}>ยืนยันลบ</button>{" "}
                  <button className="lk" onClick={() => setDel(null)}>ยกเลิก</button>
                </td>
              </tr>
            ) : (
              <tr key={p.emp_id} id={`pe-${p.emp_id}`} className={hl === p.emp_id ? "hl" : ""}>
                <td className="mono">{p.emp_id.startsWith("ไม่มีรหัส ") ? <span className="muted">—</span> : p.emp_id}{!EMP_OK.test(p.emp_id) && !p.emp_id.startsWith("ADD-") && <div><span className="chip sm warn" title="กดแก้ไขเพื่อใส่รหัสพนักงาน">{p.emp_id.startsWith("ไม่มีรหัส ") ? "ไม่มีรหัส" : "รหัสไม่ถูกต้อง"}</span></div>}</td>
                <td><b>{p.prefix ? `${p.prefix} ` : ""}{p.first_name} {p.last_name}</b>
                  {p.name_en && <div className="muted xs" lang="en">{p.name_en}</div>}
                  {p.added_manually && <span className="chip sm grey" style={{ marginLeft: 6 }}>เพิ่มเอง</span>}</td>
                <td>{p.gender ?? "—"}</td>
                <td>
                  <select className={`in role-sel${isLeader(p.role) ? " lead" : ""}`} value={p.role ?? "ผู้อพยพ"} aria-label={`บทบาทของ ${p.first_name}`}
                    onChange={(e) => run({ action: "person-edit", emp_id: p.emp_id, role: e.target.value })}>
                    {[...new Set([...roles, p.role ?? "ผู้อพยพ"])].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td className="small"><span className="mono">{p.cost_center ?? "—"}</span> {p.area ?? ""}</td>
                <td className="mono small">{p.tel || "—"}</td>
                <td className="mono">{p.flag_no}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="lk" onClick={() => start(p)}>แก้ไข</button>{" "}
                  <button className="lk del" onClick={() => { setDel(p.emp_id); setEdit(null); setReason(REASONS[0]); }}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {removed.length > 0 && (
          <div className="muted small" style={{ padding: "10px 10px 0" }}>
            ลบออกแล้ว: {removed.map((p, i) => (
              <span key={p.emp_id}>{i > 0 && " · "}<s>{p.first_name} {p.last_name}</s> ({p.removed_reason ?? "—"}) <button className="lk" style={{ minHeight: 0, padding: 0 }} onClick={() => run({ action: "person-restore", emp_id: p.emp_id })}>คืนค่า</button></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
