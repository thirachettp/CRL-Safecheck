"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./lib";
import { ICheck, ILock } from "./Icons";

export type ProfileForm = {
  code: string; prefix: string; first_name: string; last_name: string; cost_center: string;
  email: string; tel: string; gender: string; emer_name: string; emer_tel: string; consent: boolean; blood: string; plate: string; name_en: string;
};
export const EMPTY_PROFILE: ProfileForm = {
  code: "", prefix: "", first_name: "", last_name: "", cost_center: "", email: "", tel: "",
  gender: "", emer_name: "", emer_tel: "", consent: false, blood: "", plate: "", name_en: "",
};
export function toForm(p: Partial<Record<keyof ProfileForm, unknown>> | null | undefined): ProfileForm {
  const f = { ...EMPTY_PROFILE };
  for (const k of Object.keys(f) as (keyof ProfileForm)[]) {
    const v = p?.[k];
    if (v !== undefined && v !== null) (f as any)[k] = k === "consent" ? !!v : String(v);
  }
  if (!["ชาย", "หญิง", "ไม่ระบุ"].includes(f.gender)) f.gender = { M: "ชาย", F: "หญิง", Male: "ชาย", Female: "หญิง" }[f.gender] ?? "";
  return f;
}

const PREFIXES = ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms.", "Miss"];
const PREFIX_GENDER: Record<string, string> = { "นาย": "ชาย", "Mr.": "ชาย", "นาง": "หญิง", "นางสาว": "หญิง", "Mrs.": "หญิง", "Ms.": "หญิง", "Miss": "หญิง" };
export const EMAIL_RE = /^[a-z0-9._%+-]+@central\.co\.th$/i;
const telOk = (t: string) => /^\+?\d{9,12}$/.test(t.replace(/[^\d+]/g, ""));

/** ช่องที่ยังขาด / ผิด (ตรวจฝั่งเครื่องก่อนส่ง เซิร์ฟเวอร์ตรวจซ้ำ) */
export function problems(f: ProfileForm) {
  const out: string[] = [];
  if (!f.prefix.trim()) out.push("คำนำหน้า");
  if (!f.first_name.trim()) out.push("ชื่อ");
  if (!f.last_name.trim()) out.push("นามสกุล");
  if (!/^[A-Za-z0-9-]{3,30}$/.test(f.code.trim())) out.push("รหัสพนักงาน");
  if (!f.cost_center) out.push("Cost Center");
  if (!f.gender) out.push("เพศ");
  // ไม่บังคับ แต่ถ้ากรอกต้องถูกรูปแบบ
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) out.push("อีเมล (ต้องเป็น @central.co.th)");
  if (f.tel.trim() && !telOk(f.tel)) out.push("เบอร์โทร (9–10 หลัก)");
  return out;
}

const L = { fontSize: 13 } as const;
const req = <span style={{ color: "#9F1239" }}> *</span>;

/** ฟอร์มข้อมูลตามหน้า 2b โปรไฟล์ ใช้ทั้งตอนลงทะเบียนและหน้าแก้โปรไฟล์ */
export default function ProfileFields({ f, set, codeLocked, onDeleteMedical }: {
  f: ProfileForm; set: (f: ProfileForm) => void; codeLocked?: boolean; onDeleteMedical?: () => void;
}) {
  const up = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...f, [k]: e.target.value });
  const other = !!f.prefix && !PREFIXES.includes(f.prefix);
  const [otherOn, setOtherOn] = useState(other);
  const emailBad = !!f.email && !EMAIL_RE.test(f.email.trim());
  return (
    <>
      <div className="card stack" style={{ padding: 16 }}>
        <b>ข้อมูลพนักงาน</b>
        <div className="lb" style={L}>คำนำหน้า{req}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginTop: 6 }}>
            {PREFIXES.map((p) => (
              <button type="button" key={p} style={{ order: PREFIXES.indexOf(p) < 3 ? 0 : 4 }} className={`seg${f.prefix === p && !otherOn ? " on" : ""}`}
                onClick={() => { setOtherOn(false); set({ ...f, prefix: p, gender: f.gender || PREFIX_GENDER[p] || "" }); }}>{p}</button>
            ))}
            <button type="button" className={`seg${otherOn || other ? " on" : ""}`}
              onClick={() => { setOtherOn(true); if (PREFIXES.includes(f.prefix)) set({ ...f, prefix: "" }); }}>อื่นๆ</button>
          </div>
          {(otherOn || other) && <input className="in" style={{ marginTop: 6 }} placeholder="เช่น ดร., Dr." value={f.prefix} onChange={up("prefix")} />}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <label className="lb grow" style={L}>ชื่อ{req}<input className="in" value={f.first_name} onChange={up("first_name")} autoComplete="given-name" /></label>
          <label className="lb grow" style={L}>นามสกุล{req}<input className="in" value={f.last_name} onChange={up("last_name")} autoComplete="family-name" /></label>
        </div>
        <label className="lb" style={L}>ชื่อ-นามสกุล (อังกฤษ) <span className="muted xs" style={{ fontWeight: 400 }}>ไม่บังคับ · ช่วยให้ค้นหาเจอทั้ง 2 ภาษา</span>
          <input className="in" placeholder="เช่น Somchai Jaidee" value={f.name_en} onChange={up("name_en")} maxLength={120} autoComplete="off" lang="en" />
        </label>
        <label className="lb" style={L}>รหัสพนักงาน{req}
          <input className="in mono" value={f.code} onChange={up("code")} disabled={codeLocked} inputMode="numeric"
            style={codeLocked ? { background: "var(--bg)", color: "var(--muted)" } : undefined} />
        </label>
        {codeLocked && <div className="muted xs" style={{ marginTop: -6 }}>ผูกกับรหัสที่ใช้เข้าสู่ระบบ · แก้ไม่ได้</div>}
        <div className="lb" style={L}>Cost Center{req}
          <CostCenterPicker value={f.cost_center} by={f.code} onChange={(cc) => set({ ...f, cost_center: cc })} />
        </div>
        <label className="lb" style={L}>อีเมลบริษัท <span className="muted xs" style={{ fontWeight: 400 }}>ไม่บังคับ</span>
          <input className="in" type="email" inputMode="email" autoComplete="email" placeholder="ชื่อ@central.co.th" value={f.email} onChange={up("email")}
            style={emailBad ? { borderColor: "#FCA5A5" } : undefined} />
        </label>
        {emailBad && <div className="xs" style={{ marginTop: -6, color: "#9F1239" }}>ต้องลงท้ายด้วย @central.co.th</div>}
        <label className="lb" style={L}>เบอร์โทร <span className="muted xs" style={{ fontWeight: 400 }}>ไม่บังคับ</span><input className="in" inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" value={f.tel} onChange={up("tel")} /></label>
        <label className="lb" style={L}>ทะเบียนรถ <span className="muted xs" style={{ fontWeight: 400 }}>ไม่บังคับ · ใช้จับคู่กับระบบลานจอด KIOS</span>
          <input className="in" placeholder="เช่น 1กข1234 หรือ ญฐ 1748" value={f.plate} onChange={up("plate")} maxLength={20} autoComplete="off" />
        </label>
        <div className="lb" style={L}>เพศ{req}
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "nowrap" }}>
            {["ชาย", "หญิง", "ไม่ระบุ"].map((g) => <button type="button" key={g} className={`seg${f.gender === g ? " on" : ""}`} onClick={() => set({ ...f, gender: g })}>{g}</button>)}
          </div>
        </div>
      </div>
      <div className="card stack" style={{ padding: 16 }}>
        <b>ผู้ติดต่อฉุกเฉิน <span className="muted xs" style={{ fontWeight: 400 }}>ไม่บังคับ</span></b>
        <label className="lb" style={L}>ชื่อ / ความสัมพันธ์<input className="in" placeholder="เช่น สมศรี · คุณแม่" value={f.emer_name} onChange={up("emer_name")} /></label>
        <label className="lb" style={L}>เบอร์โทร<input className="in" inputMode="tel" placeholder="08x-xxx-xxxx" value={f.emer_tel} onChange={up("emer_tel")} /></label>
      </div>
      <div className="card stack" style={{ padding: 16, borderColor: "#FCA5A5" }}>
        <div className="row"><ILock size={18} color="#9F1239" /><b className="grow">ข้อมูลทางการแพทย์</b><span className="chip sm err">ข้อมูลอ่อนไหว</span></div>
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <button type="button" className={`ck${f.consent ? " on" : ""}`} style={{ width: 28, height: 28, borderRadius: 7, flex: "none", background: f.consent ? "#1F3A5F" : undefined, borderColor: f.consent ? "#1F3A5F" : undefined }}
            aria-pressed={f.consent} aria-label="ยินยอมให้เก็บข้อมูลทางการแพทย์" onClick={() => set({ ...f, consent: !f.consent })}><ICheck size={16} /></button>
          <div className="small">ไม่บังคับ · ยินยอมให้เก็บกรุ๊ปเลือด เพื่อใช้เฉพาะตอนเกิดเหตุฉุกเฉิน · เห็นได้เฉพาะ Admin / Safety Officer ในหน้าผู้บาดเจ็บระหว่างเหตุการณ์ · ลบได้ทุกเมื่อ</div>
        </div>
        {f.consent && (
          <>
            <div className="lb" style={L}>กรุ๊ปเลือด</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
              {["A", "B", "AB", "O"].map((b) => <button type="button" key={b} className={`rs${f.blood === b ? " on" : ""}`} style={{ height: 44, borderRadius: 10 }} onClick={() => set({ ...f, blood: b })}>{b}</button>)}
            </div>
            {onDeleteMedical && <button type="button" className="lk del" style={{ alignSelf: "flex-start", padding: 0 }} onClick={onDeleteMedical}>ลบข้อมูลทางการแพทย์ทั้งหมด</button>}
          </>
        )}
      </div>
    </>
  );
}

type CC = { code: string; name: string; source: string };

/** เลือก Cost Center จาก master: พิมพ์ค้นหารหัส/ชื่อ ถ้าไม่พบเพิ่มใหม่ได้ */
export function CostCenterPicker({ value, onChange, by }: { value: string; onChange: (code: string) => void; by?: string }) {
  const [sel, setSel] = useState<CC | null>(null);
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<CC[]>([]);
  const [open, setOpen] = useState(!value);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ code: "", name: "" });
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  // ชื่อของค่าที่เลือกไว้แล้ว (เช่น ค่าตั้งต้นจากแผนอพยพ)
  useEffect(() => {
    if (!value) { setSel(null); setOpen(true); return; }
    if (sel?.code === value) return;
    api<{ items: CC[] }>(`/api/cost-centers?code=${encodeURIComponent(value)}`)
      .then((r) => { if (r.items[0]) { setSel(r.items[0]); setOpen(false); } else { onChange(""); setTerm(value); setOpen(true); } })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      api<{ items: CC[] }>(`/api/cost-centers?q=${encodeURIComponent(term.trim())}`)
        .then((r) => { if (n === seq.current) setItems(r.items); }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [term, open]);

  function pick(c: CC) { setSel(c); onChange(c.code); setOpen(false); setAdding(false); setTerm(""); setErr(null); }

  async function add() {
    setErr(null);
    try {
      const r = await api<{ item: CC }>("/api/cost-centers", { method: "POST", json: { ...nc, by } });
      pick(r.item);
      setNc({ code: "", name: "" });
    } catch (e: any) { setErr(e.message); }
  }

  if (!open && sel)
    return (
      <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "nowrap", border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontWeight: 400 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="mono">{sel.code}</b> <span className="small">{sel.name}</span>
          {sel.source === "user" && <span className="chip sm grey" style={{ marginLeft: 6 }}>เพิ่มโดยผู้ใช้</span>}
        </div>
        <button type="button" className="lk boxed" onClick={() => { setOpen(true); setTerm(""); }}>เปลี่ยน</button>
      </div>
    );

  return (
    <div className="stack" style={{ marginTop: 6, gap: 6, fontWeight: 400 }}>
      <input className="in" placeholder="ค้นหารหัสหรือชื่อแผนก" value={term} onChange={(e) => setTerm(e.target.value)} />
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, maxHeight: 200, overflowY: "auto" }}>
        {items.map((c) => (
          <button type="button" key={c.code} onClick={() => pick(c)} className="row"
            style={{ width: "100%", gap: 8, padding: "9px 10px", border: 0, borderBottom: "1px solid var(--line)", background: c.code === value ? "#EEF2F7" : "#fff", font: "inherit", textAlign: "left", cursor: "pointer", flexWrap: "nowrap" }}>
            <b className="mono" style={{ fontSize: 13 }}>{c.code}</b><span className="small grow">{c.name}</span>
            {c.source === "user" && <span className="chip sm grey">ผู้ใช้เพิ่ม</span>}
          </button>
        ))}
        {!items.length && <div className="muted small" style={{ padding: 10 }}>ไม่พบ Cost Center ที่ตรงกัน</div>}
      </div>
      {sel && <button type="button" className="lk" style={{ alignSelf: "flex-start", padding: 0 }} onClick={() => setOpen(false)}>ยกเลิก ใช้ {sel.code} เหมือนเดิม</button>}
      {!adding ? (
        <button type="button" className="lk boxed" style={{ alignSelf: "flex-start" }}
          onClick={() => { setAdding(true); setNc({ code: term.trim().toUpperCase(), name: "" }); }}>+ เพิ่ม Cost Center ใหม่</button>
      ) : (
        <div className="stack" style={{ gap: 6, padding: 10, borderRadius: 10, background: "var(--bg)" }}>
          <b className="small">เพิ่ม Cost Center ใหม่</b>
          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input className="in mono" style={{ width: "40%" }} placeholder="รหัส" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value })} />
            <input className="in grow" placeholder="ชื่อแผนก" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
          </div>
          {err && <div className="xs" style={{ color: "#9F1239" }}>{err}</div>}
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-pri" disabled={!nc.code.trim() || !nc.name.trim()} onClick={add}>เพิ่มและเลือก</button>
            <button type="button" className="lk" onClick={() => { setAdding(false); setErr(null); }}>ยกเลิก</button>
          </div>
          <div className="muted xs">Admin ตรวจรายการที่ผู้ใช้เพิ่มได้ในภายหลัง</div>
        </div>
      )}
    </div>
  );
}
