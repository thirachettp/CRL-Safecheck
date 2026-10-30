"use client";
// ตารางชุดธงแบบ Excel: คลิกช่องแล้วพิมพ์ได้เลย · Enter/Tab/ลูกศรเลื่อนช่อง · วาง (Ctrl+V) จาก Excel ได้หลายแถว
// บันทึกทีละช่องทันทีที่ออกจากช่อง · แถวล่างสุดใช้เพิ่มคนใหม่
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, usePoll } from "./lib";

type Person = {
  emp_id: string; prefix: string | null; first_name: string; last_name: string | null; name_en: string | null; gender: string | null;
  flag_no: string | null; role: string | null; cost_center: string | null; area: string | null; tel: string | null;
  removed: boolean; removed_reason: string | null; added_manually: boolean;
};
type Key = "flag_no" | "emp_id" | "prefix" | "first_name" | "last_name" | "name_en" | "gender" | "role" | "cost_center" | "area" | "tel";
const COLS: { k: Key; label: string; w: number; list?: string }[] = [
  { k: "flag_no", label: "ธง", w: 64, list: "ps-flags" },
  { k: "emp_id", label: "รหัสพนักงาน", w: 120 },
  { k: "prefix", label: "คำนำหน้า", w: 90, list: "ps-prefix" },
  { k: "first_name", label: "ชื่อ", w: 150 },
  { k: "last_name", label: "นามสกุล", w: 150 },
  { k: "name_en", label: "ชื่อ-นามสกุล (อังกฤษ)", w: 190 },
  { k: "gender", label: "เพศ", w: 70, list: "ps-gender" },
  { k: "role", label: "บทบาท", w: 150, list: "ps-roles" },
  { k: "cost_center", label: "Cost Center", w: 100 },
  { k: "area", label: "แผนก / พื้นที่", w: 170 },
  { k: "tel", label: "เบอร์โทร", w: 120 },
];
const PREFIX_GENDER: Record<string, string> = { "นาย": "ชาย", "Mr.": "ชาย", "นาง": "หญิง", "นางสาว": "หญิง", "Mrs.": "หญิง", "Ms.": "หญิง", "Miss": "หญิง" };
const REASONS = ["ลาออก", "ย้ายแผนก", "ซ้ำ", "ไม่ได้อยู่ที่นี่แล้ว", "อื่นๆ"];
const NEW = "__new__";
const blankNew = (): Record<Key, string> => ({ flag_no: "", emp_id: "", prefix: "", first_name: "", last_name: "", name_en: "", gender: "", role: "ผู้อพยพ", cost_center: "", area: "", tel: "" });

async function call(json: any) { return api("/api/admin/flags", { method: "POST", json }); }

export default function PlanSheet({ flags, roles, onChanged }: { flags: string[]; roles: string[]; onChanged: () => void }) {
  const d = usePoll<{ people: Person[] }>("/api/admin/flags?all=1", 0);
  const [rows, setRows] = useState<Person[]>([]);
  useEffect(() => { if (d.data) setRows(d.data.people); }, [d.data]);
  const [q, setQ] = useState("");
  const [flagF, setFlagF] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [limit, setLimit] = useState(300);
  const [cur, setCur] = useState<{ r: string; c: number } | null>(null);
  const [edit, setEdit] = useState<{ r: string; c: number; v: string; typing?: boolean } | null>(null);
  const [newRow, setNewRowState] = useState<Record<Key, string>>(blankNew());
  const newRowRef = useRef(newRow);
  const setNewRow = (v: Record<Key, string> | ((n: Record<Key, string>) => Record<Key, string>)) => {
    const n = typeof v === "function" ? v(newRowRef.current) : v;
    newRowRef.current = n; setNewRowState(n);
  };
  const [cellState, setCellState] = useState<Record<string, "saving" | "ok" | "err">>({});
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [del, setDel] = useState<{ emp: string; reason: string } | null>(null);
  const tbl = useRef<HTMLTableElement>(null);

  const view = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((p) => (showRemoved || !p.removed) && (!flagF || p.flag_no === flagF) &&
      (!t || [p.emp_id, p.prefix, p.first_name, p.last_name, p.name_en, p.cost_center, p.area, p.role, p.tel, p.flag_no].some((x) => x && String(x).toLowerCase().includes(t))));
  }, [rows, q, flagF, showRemoved]);
  const shown = view.slice(0, limit);
  const rowIds = [...shown.map((p) => p.emp_id), NEW];
  const val = (r: string, k: Key) => (r === NEW ? newRowRef.current[k] : String(rows.find((p) => p.emp_id === r)?.[k] ?? ""));
  const cid = (r: string, c: number) => `${r}|${c}`;
  const mark = (r: string, c: number, s: "saving" | "ok" | "err" | null) => setCellState((m) => {
    const n = { ...m }; if (s) n[cid(r, c)] = s; else delete n[cid(r, c)]; return n;
  });

  // บันทึกช่องเดียว
  async function commit(r: string, c: number, v: string) {
    const k = COLS[c].k;
    v = v.replace(/\s+/g, " ").trim();
    if (r === NEW) {
      const nr = { ...newRowRef.current, [k]: v };
      if (k === "prefix" && !nr.gender && PREFIX_GENDER[v]) nr.gender = PREFIX_GENDER[v];
      newRowRef.current = nr;
      setNewRow(nr);
      return;
    }
    const p = rows.find((x) => x.emp_id === r);
    if (!p || String(p[k] ?? "") === v) return;
    if (k === "first_name" && !v) { setMsg({ k: "warn", t: "ชื่อห้ามว่าง" }); return; }
    mark(r, c, "saving");
    try {
      const patch: any = k === "emp_id" ? { new_emp_id: v } : { [k]: v };
      if (k === "prefix" && !p.gender && PREFIX_GENDER[v]) patch.gender = PREFIX_GENDER[v];
      await call({ action: "person-edit", emp_id: r, ...patch });
      const nid = k === "emp_id" ? v.toUpperCase() : r;
      setRows((rs) => rs.map((x) => (x.emp_id === r ? { ...x, ...(k === "emp_id" ? { emp_id: nid } : { [k]: v || null }), ...(patch.gender ? { gender: patch.gender } : {}) } : x)));
      if (k === "emp_id") { setCur({ r: nid, c }); mark(nid, c, "ok"); } else mark(r, c, "ok");
      setTimeout(() => mark(nid, c, null), 1200);
      onChanged();
    } catch (e: any) { mark(r, c, "err"); setMsg({ k: "err", t: `${p.first_name}: ${e.message}` }); }
  }

  // แถวใหม่: เพิ่มเมื่อมีชื่อและธง แล้วออกจากแถว
  async function addNew(row = newRowRef.current) {
    if (!row.first_name.trim() || !row.flag_no.trim()) return false;
    try {
      const r: any = await call({ action: "person-add", ...row });
      setMsg({ k: "ok", t: `เพิ่ม ${row.first_name} เข้าธง ${row.flag_no} แล้ว` });
      setNewRow({ ...blankNew(), flag_no: row.flag_no, cost_center: row.cost_center, area: row.area });
      await d.reload(); onChanged();
      return r.emp_id as string;
    } catch (e: any) { setMsg({ k: "err", t: e.message }); return false; }
  }

  // รหัสพนักงานในแถวใหม่: เติมข้อมูลเดิม (ชุดธง / เวอร์ชันเก่า / โปรไฟล์ / DC_FTE)
  useEffect(() => {
    const code = newRow.emp_id.trim();
    if (code.length < 4) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r: any = await api(`/api/admin/flags?lookup=${encodeURIComponent(code)}`);
        const h = r.person; if (!live || !h) return;
        if (h.in_plan) return setMsg({ k: "warn", t: `รหัส ${code} อยู่ธง ${h.in_plan.flag_no ?? "—"} แล้ว` });
        setNewRow((n) => {
          const m = { ...n };
          for (const k of ["prefix", "first_name", "last_name", "name_en", "gender", "cost_center", "area", "tel"] as Key[]) if (!m[k] && h[k]) m[k] = h[k];
          return m;
        });
        setMsg({ k: "ok", t: `เติมข้อมูลจาก${h.from}แล้ว · ตรวจแล้วกด Enter ที่แถวใหม่` });
      } catch {}
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [newRow.emp_id]);

  // ช่องที่เลือกอยู่เป็น input เสมอ (พิมพ์ไทย/IME ได้) · nav = ลูกศรเลื่อนช่อง · typing = กำลังพิมพ์ ลูกศรซ้าย/ขวาเลื่อนเคอร์เซอร์
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = useRef<string | null>(null);
  function focusCell(r: string, c: number) {
    if (r !== NEW && rows.find((p) => p.emp_id === r)?.removed) { setCur({ r, c }); setEdit(null); return; }
    let v = val(r, COLS[c].k);
    if (COLS[c].k === "emp_id" && v.startsWith("ไม่มีรหัส ")) v = "";
    setCur({ r, c });
    editing.current = cid(r, c);
    setEdit({ r, c, v, typing: false } as any);
  }
  // โฟกัสช่องใหม่ทันทีหลังวาด (ก่อนรับปุ่มถัดไป) · เลือกข้อความทั้งช่อง = พิมพ์ทับได้เลย
  const editKey = edit ? cid(edit.r, edit.c) : "";
  useLayoutEffect(() => { if (editKey && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editKey]);
  async function leave(next?: [number, number]) {
    const e = edit as any;
    if (e && editing.current === cid(e.r, e.c)) {
      editing.current = null;
      const orig = val(e.r, COLS[e.c].k);
      const changed = e.v.trim() !== (COLS[e.c].k === "emp_id" && orig.startsWith("ไม่มีรหัส ") ? "" : orig);
      if (changed) commit(e.r, e.c, e.v); // บันทึกเบื้องหลัง ไม่ต้องรอ เลื่อนช่องได้ทันที
      if (e.r === NEW && next && next[0] === 1) {
        if (await addNew()) return focusCell(NEW, 0);
      }
    }
    if (!next || !cur) return;
    let i = rowIds.indexOf(cur.r), c = cur.c + next[1];
    if (c >= COLS.length) { c = 0; i++; } if (c < 0) { c = COLS.length - 1; i--; }
    i = Math.max(0, Math.min(rowIds.length - 1, i + next[0]));
    if (cur.r === NEW && rowIds[i] !== NEW && newRowRef.current.first_name && newRowRef.current.flag_no) await addNew();
    focusCell(rowIds[i], c);
  }
  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const typing = (edit as any)?.typing;
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); leave([e.shiftKey ? -1 : 1, 0]); }
    else if (k === "Tab") { e.preventDefault(); leave([0, e.shiftKey ? -1 : 1]); }
    else if (k === "Escape") { e.preventDefault(); if (cur) { editing.current = null; focusCell(cur.r, cur.c); } }
    else if (k === "ArrowDown") { e.preventDefault(); leave([1, 0]); }
    else if (k === "ArrowUp") { e.preventDefault(); leave([-1, 0]); }
    else if (!typing && k === "ArrowRight") { e.preventDefault(); leave([0, 1]); }
    else if (!typing && k === "ArrowLeft") { e.preventDefault(); leave([0, -1]); }
    else if (k === "F2") { e.preventDefault(); setEdit({ ...(edit as any), typing: true }); const el = inputRef.current; if (el) el.setSelectionRange(el.value.length, el.value.length); }
  }

  // วางจาก Excel: แท็บ = คอลัมน์ · บรรทัด = แถว (เกินแถวที่มี = เพิ่มคนใหม่)
  async function paste(text: string) {
    if (!cur) return;
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    let i = rowIds.indexOf(cur.r), added = 0, edited = 0;
    editing.current = null;
    for (const cells of lines) {
      const r = rowIds[i];
      if (!r || r === NEW) {
        const row = blankNew();
        cells.forEach((v, j) => { const col = COLS[cur.c + j]; if (col) row[col.k] = v.trim(); });
        if (!row.gender && PREFIX_GENDER[row.prefix]) row.gender = PREFIX_GENDER[row.prefix];
        if (row.first_name && row.flag_no) { try { await call({ action: "person-add", ...row }); added++; } catch (e: any) { setMsg({ k: "err", t: `${row.first_name}: ${e.message}` }); } }
      } else {
        const patch: any = {};
        cells.forEach((v, j) => { const col = COLS[cur.c + j]; if (col) patch[col.k === "emp_id" ? "new_emp_id" : col.k] = v.trim(); });
        try { await call({ action: "person-edit", emp_id: r, ...patch }); edited++; } catch (e: any) { setMsg({ k: "err", t: `${r}: ${e.message}` }); }
        i++;
      }
    }
    setMsg({ k: "ok", t: `วางแล้ว · แก้ ${edited} แถว · เพิ่ม ${added} คน` });
    await d.reload(); onChanged();
    focusCell(cur.r, cur.c);
  }

  const people = rows.filter((p) => !p.removed).length;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="row" style={{ padding: "12px 16px", gap: 8, borderBottom: "1px solid var(--line-3)" }}>
        <b className="grow" style={{ fontSize: 16 }}>ตารางชุดธง <span className="muted small" style={{ fontWeight: 500 }}>{people} คน · {flags.length} ธง</span></b>
        <input className="in" style={{ marginTop: 0, width: 240 }} placeholder="ค้นหา ชื่อ / รหัส / CC / แผนก" value={q} onChange={(e) => { setQ(e.target.value); setLimit(300); }} />
        <select className="in" style={{ marginTop: 0, width: 120 }} value={flagF} onChange={(e) => { setFlagF(e.target.value); setLimit(300); }}>
          <option value="">ทุกธง</option>{flags.map((f) => <option key={f} value={f}>ธง {f}</option>)}
        </select>
        <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />แสดงคนที่ลบแล้ว</label>
      </div>
      <div className="muted xs" style={{ padding: "6px 16px", background: "var(--subtle)" }}>
        คลิกช่องแล้วพิมพ์ทับได้เลย · Enter = บันทึกแล้วลงล่าง · Tab / ลูกศร = เลื่อนช่อง · F2 / ดับเบิลคลิก = แก้บางส่วน · Esc = ยกเลิก · วาง (Ctrl+V) จาก Excel ได้หลายแถวหลายคอลัมน์ · แถวล่างสุดสีเขียว = เพิ่มคนใหม่ (ใส่ธง + ชื่อ แล้ว Enter) · บันทึกทันทีทีละช่อง
      </div>
      {msg && <div style={{ padding: "8px 16px 0" }}><p className={`notice ${msg.k}`} onClick={() => setMsg(null)}>{msg.t}</p></div>}
      {del && (
        <div className="row" style={{ padding: "8px 16px", gap: 8, background: "#FFF1F2" }}>
          <span className="small">ลบ <b>{rows.find((p) => p.emp_id === del.emp)?.first_name}</b> ออกจากชุดธง เหตุผล</span>
          <select className="in" style={{ marginTop: 0, width: 180 }} value={del.reason} onChange={(e) => setDel({ ...del, reason: e.target.value })}>{REASONS.map((x) => <option key={x}>{x}</option>)}</select>
          <button className="btn btn-sm" style={{ color: "#9F1239", borderColor: "#FCA5A5" }} onClick={async () => {
            try { await call({ action: "person-remove", emp_id: del.emp, reason: del.reason }); setDel(null); await d.reload(); onChanged(); } catch (e: any) { setMsg({ k: "err", t: e.message }); }
          }}>ยืนยันลบ</button>
          <button className="lk" onClick={() => setDel(null)}>ยกเลิก</button>
        </div>
      )}
      <datalist id="ps-flags">{flags.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="ps-prefix">{["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms.", "Miss"].map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="ps-gender"><option value="ชาย" /><option value="หญิง" /></datalist>
      <datalist id="ps-roles">{roles.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="xl-wrap">
        <table className="xl" ref={tbl}>
          <thead><tr><th className="xl-n">#</th>{COLS.map((c) => <th key={c.k} style={{ minWidth: c.w }}>{c.label}</th>)}<th style={{ width: 70 }} /></tr></thead>
          <tbody>
            {[...shown.map((p) => p.emp_id), NEW].map((r, i) => {
              const p = r === NEW ? null : rows.find((x) => x.emp_id === r)!;
              return (
                <tr key={r} className={r === NEW ? "xl-new" : p?.removed ? "xl-removed" : /^\s*ผู้นำ/.test(p?.role ?? "") ? "xl-lead" : ""}>
                  <td className="xl-n">{r === NEW ? "+" : i + 1}</td>
                  {COLS.map((c, j) => {
                    const isCur = cur?.r === r && cur.c === j, isEdit = edit?.r === r && edit.c === j;
                    const st = cellState[cid(r, j)];
                    const v = val(r, c.k);
                    const shownV = c.k === "emp_id" && v.startsWith("ไม่มีรหัส ") ? "" : v;
                    return (
                      <td key={c.k} className={`xl-c${isCur ? " cur" : ""}${st ? ` ${st}` : ""}${p?.removed ? " ro" : ""}`}
                        onMouseDown={(e) => { if (isEdit) return; e.preventDefault(); leave(); focusCell(r, j); }}>
                        {isEdit ? (
                          <input ref={inputRef} className="xl-in" list={(edit as any).typing ? c.list : undefined} value={edit!.v}
                            onChange={(e) => setEdit({ ...(edit as any), v: e.target.value, typing: true })}
                            onDoubleClick={() => setEdit({ ...(edit as any), typing: true })}
                            onBlur={() => leave()}
                            onKeyDown={onInputKey}
                            onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[\t\n]/.test(t.replace(/\n$/, ""))) { e.preventDefault(); paste(t); } }} />
                        ) : (
                          <span className={!shownV && r === NEW ? "muted" : ""}>{shownV || (r === NEW && j === 3 ? "พิมพ์ชื่อเพื่อเพิ่มคน…" : r === NEW && j === 0 ? "ธง" : c.k === "emp_id" && v.startsWith("ไม่มีรหัส ") ? "— ไม่มีรหัส" : "")}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="xl-act">
                    {r === NEW ? <button className="lk" disabled={!newRow.first_name || !newRow.flag_no} onClick={() => addNew()}>เพิ่ม</button>
                      : p!.removed ? <button className="lk" onClick={async () => { await call({ action: "person-restore", emp_id: r }); await d.reload(); onChanged(); }} title={p!.removed_reason ?? ""}>คืนค่า</button>
                      : <button className="lk del" onClick={() => setDel({ emp: r, reason: REASONS[0] })}>ลบ</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {view.length > limit && <div style={{ padding: 10, textAlign: "center" }}><button className="btn btn-sm" onClick={() => setLimit(limit + 500)}>แสดงเพิ่ม (อีก {view.length - limit} แถว)</button></div>}
      {!d.data && <p className="muted small" style={{ padding: 16 }}>กำลังโหลด…</p>}
    </div>
  );
}
