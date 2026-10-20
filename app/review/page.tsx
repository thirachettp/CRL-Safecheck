"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import MobileShell from "@/components/MobileShell";
import { useUser } from "@/components/identity";
import { api, usePoll, useWide } from "@/components/lib";
import { IBack, IFlag, IDown, IClose } from "@/components/Icons";

const REASONS = ["ลาออกแล้ว", "ย้ายสาขา", "ไม่ได้ทำงานพื้นที่นี้", "อื่นๆ"];

type Person = {
  emp_id: string; first_name: string; last_name: string | null; gender: string | null; flag_no: string; orig_flag: string | null;
  tel: string | null; cost_center: string | null; area: string | null; role: string | null; here: boolean | null;
  added_manually: boolean; edited_note: string | null; edited_by: string | null; removed: boolean; removed_reason: string | null; removed_by: string | null;
};
type Data = {
  flag: string | null; people: Person[]; cells: { flag_no: string; n: number; reviewed: boolean }[];
  review: { reviewed_by: string; reviewed_at: string } | null; leader: any; points: any[]; viewer?: "anon" | "user" | "staff";
};

export default function ReviewPage() {
  return <Suspense><Review /></Suspense>;
}

function Review() {
  const { user, by } = useUser();
  const [sel, setSel] = useState<string | null>(null);
  const d = usePoll<Data>(`/api/review${sel ? `?flag=${encodeURIComponent(sel)}` : ""}`, 15000);
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: "edit" | "del" } | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonNote, setReasonNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const flag = d.data?.flag ?? null;
  const people = d.data?.people ?? [];
  const active = people.filter((p) => !p.removed);
  const removed = people.filter((p) => p.removed);
  const here = (p: Person) => p.here ?? true;
  const point = d.data?.points.find((x) => x.code === (people[0] as any)?.assembly_point);
  const who = by || "ไม่ระบุชื่อ";
  const anon = d.data?.viewer === "anon";

  async function act(json: any) {
    setErr(null);
    try {
      await api("/api/review", { method: "POST", json: { ...json, by: who } });
      setOpen(null);
      d.reload();
    } catch (e: any) { setErr(e.message); }
  }

  function startEdit(p: Person) {
    setOpen({ id: p.emp_id, mode: "edit" });
    setDraft({ first_name: p.first_name, last_name: p.last_name ?? "", gender: p.gender ?? "ชาย", flag_no: p.flag_no,
      tel: p.tel ?? "", cost_center: p.cost_center ?? "", area: p.area ?? "" });
  }

  const reviewed = !!d.data?.review;
  const wide = useWide();
  const panel = (p: Person) => {
    const isOpen = open?.id === p.emp_id;
    return (
      <>
              {isOpen && open?.mode === "edit" && (
                <div className="stack" style={{ borderTop: "1px solid var(--line-3)", marginTop: 10, paddingTop: 10, gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label className="lb">ชื่อ<input className="in" value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></label>
                    <label className="lb">นามสกุล<input className="in" value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></label>
                    <label className="lb">เพศ<select className="in" value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })}><option>ชาย</option><option>หญิง</option></select></label>
                    <label className="lb">ธง<input className="in mono" value={draft.flag_no} onChange={(e) => setDraft({ ...draft, flag_no: e.target.value })} /></label>
                  </div>
                  {!anon && <label className="lb">เบอร์โทร<input className="in" inputMode="tel" value={draft.tel} onChange={(e) => setDraft({ ...draft, tel: e.target.value })} /></label>}
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }}>
                    <label className="lb">Cost center<input className="in mono" value={draft.cost_center} onChange={(e) => setDraft({ ...draft, cost_center: e.target.value })} /></label>
                    <label className="lb">แผนก/พื้นที่<input className="in" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} /></label>
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>รหัส <span className="mono">{p.emp_id}</span> แก้ไขไม่ได้</div>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <button className="btn grow" onClick={() => setOpen(null)}>ยกเลิก</button>
                    <button className="btn btn-pri grow" onClick={() => act({ action: "edit", emp_id: p.emp_id, ...draft, flag_no: String(draft.flag_no ?? "").trim() || p.flag_no })}>บันทึก</button>
                  </div>
                </div>
              )}

              {isOpen && open?.mode === "del" && (
                <div className="stack" style={{ borderTop: "1px solid var(--line-3)", marginTop: 10, paddingTop: 10, gap: 8 }}>
                  <div className="small" style={{ fontWeight: 600 }}>หมายเหตุการลบ (จำเป็น)</div>
                  <div className="row" style={{ gap: 6 }}>
                    {REASONS.map((r) => <button key={r} className={`rs${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}
                  </div>
                  <input className="in" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" aria-label="รายละเอียดเพิ่มเติม" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} />
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <button className="btn grow" onClick={() => setOpen(null)}>ยกเลิก</button>
                    <button className="btn btn-del grow" onClick={() => act({ action: "remove", emp_id: p.emp_id, reason: reasonNote ? `${reason}: ${reasonNote}` : reason })}>ลบออกจากธง</button>
                  </div>
                </div>
              )}
      </>
    );
  };
  const meta = (p: Person) => {
    const moved = !p.added_manually && p.orig_flag != null && p.orig_flag !== p.flag_no;
    const edited = moved || p.added_manually || !!p.edited_note;
    const note = p.added_manually ? "เพิ่มเอง" : moved ? `ย้ายจาก ธง ${p.orig_flag}` : p.edited_note ?? "ตรงกับ Excel";
    return { edited, note };
  };
  const startDel = (p: Person) => { setOpen({ id: p.emp_id, mode: "del" }); setReason(REASONS[0]); setReasonNote(""); };


  return (
    <MobileShell wide={wide}>
      <div className="m-top">
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <Link href="/" className="back" aria-label="กลับ"><IBack /></Link>
          <div className="grow"><b>ตรวจทานธง</b><div className="muted xs">{user ? `คุณ: ${user.name}` : "ไม่ได้เข้าสู่ระบบ · บันทึกเป็นไม่ระบุชื่อ"}</div></div>
          <button className="lk boxed" onClick={() => setAdding(true)} disabled={flag == null}>+ เพิ่มคน</button>
        </div>
        <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "nowrap" }}>
          <button className="fbtn" onClick={() => setPicker(true)}><IFlag size={16} />ธง {flag ?? "—"}<IDown size={14} /></button>
          <div className="muted xs grow">
            {point?.name ?? (people[0] as any)?.assembly_point ?? ""}{d.data?.leader ? ` · ${d.data.leader.leader_name}` : ""}<br />
            มา {active.filter(here).length}/{active.length} คน
          </div>
        </div>
      </div>

      <div className="m-body">
        {d.error && !d.data && <p className="notice err">{d.error}</p>}
        {d.data && flag == null && <p className="notice warn">ยังไม่มีชุดธง ให้ Admin นำเข้าไฟล์ธงที่หน้าตั้งค่าก่อน</p>}
        {err && <p className="notice err">{err}</p>}

        {wide && active.length > 0 && (
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="scroll-x"><table className="tbl rtbl">
              <thead><tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>เพศ</th><th>Cost Center · แผนก</th><th>เบอร์โทร</th><th>ที่มา</th><th style={{ textAlign: "center" }}>วันนี้</th><th /></tr></thead>
              <tbody>
                {active.map((p) => {
                  const { edited, note } = meta(p);
                  const isOpen = open?.id === p.emp_id;
                  return [
                    <tr key={p.emp_id} className={isOpen ? "editing" : ""}>
                      <td className="mono">{p.emp_id}</td>
                      <td><b>{p.first_name} {p.last_name}</b>{/^\s*ผู้นำ/.test(p.role ?? "") && <span className="g" style={{ marginLeft: 6 }}>ผู้นำธง</span>}</td>
                      <td>{p.gender ?? "—"}</td>
                      <td className="small"><span className="mono">{p.cost_center ?? "—"}</span> {p.area ?? ""}</td>
                      <td className="small">{anon ? <span className="muted">เข้าสู่ระบบเพื่อดู</span> : p.tel ?? "—"}</td>
                      <td><span className={`chip sm ${edited ? "src-edit" : "src-sys"}`}>{edited ? `แก้ไขโดย ${p.edited_by ?? "—"}` : "Excel"}</span>
                        <div className="muted xs">{note}</div></td>
                      <td style={{ textAlign: "center" }}><button className={`att${here(p) ? " on" : ""}`} aria-pressed={here(p)}
                        onClick={() => act({ action: "attend", emp_id: p.emp_id, here: !here(p) })}>{here(p) ? "มา" : "ไม่มา"}</button></td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <button className="lk" onClick={() => (isOpen ? setOpen(null) : startEdit(p))}>{isOpen && open?.mode === "edit" ? "ปิด" : "แก้ไข"}</button>
                        <button className="lk del" onClick={() => (isOpen ? setOpen(null) : startDel(p))}>{isOpen && open?.mode === "del" ? "ปิด" : "ลบ"}</button>
                      </td>
                    </tr>,
                    isOpen && <tr key={`${p.emp_id}-x`} className="editing"><td colSpan={8} style={{ paddingTop: 0 }}><div style={{ maxWidth: 640 }}>{panel(p)}</div></td></tr>,
                  ];
                })}
              </tbody>
            </table></div>
          </div>
        )}

        {!wide && active.map((p) => {
          const { edited, note } = meta(p);
          const isOpen = open?.id === p.emp_id;
          return (
            <div key={p.emp_id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}><b style={{ fontSize: 15 }}>{p.first_name} {p.last_name}</b>{p.gender && <span className="g">{p.gender}</span>}
                    {/^\s*ผู้นำ/.test(p.role ?? "") && <span className="g">ผู้นำธง</span>}</div>
                  <div className="muted xs"><span className="mono">{p.emp_id}</span>{p.cost_center && <> · <span className="mono">{p.cost_center}</span></>} {p.area}</div>
                  <div className="row" style={{ marginTop: 6, gap: 6 }}>
                    <span className={`chip sm ${edited ? "src-edit" : "src-sys"}`}>{edited ? `แก้ไขโดย ${p.edited_by ?? "—"}` : "แผนอพยพ (Excel)"}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{note}</span>
                  </div>
                </div>
                <button className={`att${here(p) ? " on" : ""}`} aria-pressed={here(p)}
                  onClick={() => act({ action: "attend", emp_id: p.emp_id, here: !here(p) })}>{here(p) ? "มา" : "ไม่มา"}</button>
              </div>
              {!isOpen && (
                <div className="row" style={{ justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
                  <button className="lk" onClick={() => startEdit(p)}>แก้ไข</button>
                  <button className="lk del" onClick={() => startDel(p)}>ลบ</button>
                </div>
              )}
              {panel(p)}
            </div>
          );
        })}

        {removed.length > 0 && (
          <>
            <b className="small" style={{ margin: "8px 4px 0" }}>ลบออกแล้ว ({removed.length})</b>
            {removed.map((p) => (
              <div key={p.emp_id} className="row" style={{ background: "var(--subtle)", border: "1px dashed var(--line-2)", borderRadius: 14, padding: "10px 12px", flexWrap: "nowrap" }}>
                <div className="grow"><div style={{ fontWeight: 600, textDecoration: "line-through" }}>{p.first_name} {p.last_name}</div>
                  <div className="muted xs">{p.removed_reason} · ลบโดย {p.removed_by ?? "—"}</div></div>
                <button className="lk" onClick={() => act({ action: "restore", emp_id: p.emp_id })}>คืนค่า</button>
              </div>
            ))}
          </>
        )}
      </div>

      {flag != null && (
        <div className="m-foot">
          <button className="btn btn-pri btn-block" style={{ minHeight: 50 }} onClick={() => act({ action: "reviewed", flag })}>
            {reviewed ? `ธง ${flag} ตรวจแล้ว โดย ${d.data?.review?.reviewed_by ?? "—"} · ยืนยันอีกครั้ง` : `ยืนยันว่าตรวจธง ${flag} แล้ว`}
          </button>
        </div>
      )}

      {picker && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setPicker(false)}>
          <div className="sheet">
            <div className="row"><b className="grow" style={{ fontSize: 17 }}>เลือกธง</b>
              <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={() => setPicker(false)} aria-label="ปิด"><IClose size={16} /></button></div>
            <div className="muted xs row" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#93C5FD" }} />ตรวจทานแล้ว</span>
              <span>ตัวเลขล่าง = จำนวนคน</span>
            </div>
            <div className="cells5">
              {(d.data?.cells ?? []).map((c) => (
                <button key={c.flag_no} className={`cell${c.reviewed ? " rev" : ""}${c.flag_no === flag ? " on" : ""}`}
                  onClick={() => { setSel(c.flag_no); setPicker(false); setOpen(null); }}>
                  <b style={{ fontSize: 16 }}>{c.flag_no}</b><span className="mono" style={{ fontSize: 11 }}>{c.n} คน</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {adding && flag != null && <AddSheet flag={flag} onClose={() => setAdding(false)} onSave={async (f) => { await act({ action: "add", ...f }); setAdding(false); }} />}
    </MobileShell>
  );
}

function AddSheet({ flag, onClose, onSave }: { flag: string; onClose: () => void; onSave: (f: any) => Promise<void> }) {
  const [f, setF] = useState({ first_name: "", last_name: "", gender: "ชาย", flag_no: String(flag), tel: "", cost_center: "", area: "", emp_id: "" });
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <div className="row"><b className="grow" style={{ fontSize: 17 }}>เพิ่มคนเข้าธง</b>
          <button type="button" className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="lb">ชื่อ<input className="in" required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
          <label className="lb">นามสกุล<input className="in" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></label>
          <label className="lb">เพศ<select className="in" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option>ชาย</option><option>หญิง</option></select></label>
          <label className="lb">ธง<input className="in mono" value={f.flag_no} onChange={(e) => setF({ ...f, flag_no: e.target.value })} /></label>
        </div>
        <label className="lb">รหัสพนักงาน (ถ้ามี)<input className="in mono" value={f.emp_id} onChange={(e) => setF({ ...f, emp_id: e.target.value })} /></label>
        <label className="lb">เบอร์โทร<input className="in" inputMode="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }}>
          <label className="lb">Cost center<input className="in mono" value={f.cost_center} onChange={(e) => setF({ ...f, cost_center: e.target.value })} /></label>
          <label className="lb">แผนก/พื้นที่<input className="in" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></label>
        </div>
        <button className="btn btn-pri btn-lg" type="submit">เพิ่มเข้าธง {f.flag_no}</button>
      </form>
    </div>
  );
}
