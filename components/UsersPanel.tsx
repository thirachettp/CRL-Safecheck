"use client";
import { useEffect, useState } from "react";
import { api, fmtDateTime } from "./lib";
import { useUser } from "./identity";

type U = {
  code: string; name: string | null; cost_center: string | null; cc_name: string | null; email: string; role: "user" | "safety" | "admin";
  has_password: boolean; must_change_pw: boolean; locked: boolean | null; last_login_at: string | null; fixed_admin: boolean;
};
const ROLES: [U["role"], string][] = [["user", "ผู้ใช้ทั่วไป"], ["safety", "Safety Officer"], ["admin", "Admin"]];

/** Admin: ปรับบทบาท และรีเซ็ตรหัสผ่าน เท่านั้น (ข้อมูลอื่นของผู้ใช้แก้ไม่ได้ และไม่มีใครเห็นรหัสผ่านจริง) */
export default function UsersPanel() {
  const { user } = useUser();
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<U[]>([]);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [temp, setTemp] = useState<{ code: string; name: string; temp: string } | null>(null);
  const [ask, setAsk] = useState<string | null>(null);

  async function load(t = term) {
    try { setRows((await api<{ users: U[] }>(`/api/admin/users?q=${encodeURIComponent(t)}`)).users); } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  useEffect(() => { const h = setTimeout(() => load(term), 250); return () => clearTimeout(h); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  async function role(u: U, r: U["role"]) {
    setMsg(null);
    try { await api("/api/admin/users", { method: "POST", json: { action: "role", code: u.code, role: r } }); setMsg({ k: "ok", t: `${u.name ?? u.code} เป็น ${ROLES.find((x) => x[0] === r)![1]} แล้ว` }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function reset(u: U) {
    setMsg(null); setTemp(null);
    try {
      const r = await api<{ temp: string }>("/api/admin/users", { method: "POST", json: { action: "reset", code: u.code } });
      setTemp({ code: u.code, name: u.name ?? u.code, temp: r.temp }); load();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }

  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <div className="card-h"><span className="grow">ผู้ใช้และสิทธิ์</span>
        <input className="in" style={{ maxWidth: 260, height: 38 }} placeholder="ค้นรหัส / ชื่อ / อีเมล" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      <p className="muted xs" style={{ padding: "0 18px" }}>
        Admin ทำได้ 2 อย่างเท่านั้น: ปรับบทบาท และรีเซ็ตรหัสผ่าน · Safety Officer = ยืนยัน/ปิดเหตุ ดูผู้บาดเจ็บ · Admin = ทุกอย่างรวมตั้งค่าและจัดการผู้ใช้
      </p>
      {temp && (
        <div className="notice warn" style={{ margin: "0 18px 10px" }}>
          รหัสผ่านชั่วคราวของ {temp.name} ({temp.code}): <b className="mono" style={{ fontSize: 16 }}>{temp.temp}</b>
          <div className="xs" style={{ fontWeight: 500 }}>แสดงครั้งเดียว ส่งให้เจ้าของบัญชีโดยตรง ผู้ใช้ต้องตั้งรหัสใหม่ตอนเข้าครั้งถัดไป · เครื่องที่เคยเข้าไว้จะหลุดทั้งหมด</div>
          <button className="lk" style={{ padding: 0 }} onClick={() => setTemp(null)}>ซ่อน</button>
        </div>
      )}
      {msg && <p className={`notice ${msg.k}`} style={{ margin: "0 18px 10px" }}>{msg.t}</p>}
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>รหัส</th><th>ชื่อ</th><th>Cost Center</th><th>อีเมล</th><th>บทบาท</th><th>สถานะ</th><th>เข้าล่าสุด</th><th /></tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={8} className="muted">ไม่พบผู้ใช้</td></tr>}
          {rows.map((u) => (
            <tr key={u.code}>
              <td className="mono">{u.code}</td>
              <td><b>{u.name ?? "—"}</b>{u.code === user?.code && <span className="muted xs"> (คุณ)</span>}</td>
              <td className="small">{u.cost_center ?? "—"} {u.cc_name ?? ""}</td>
              <td className="small">{u.email}</td>
              <td>
                {u.fixed_admin ? <span className="chip sm err" title="กำหนดใน ADMIN_CODES ของ Vercel">Admin (ตั้งใน Vercel)</span> : (
                  <select className="in" style={{ height: 34, width: "auto", fontSize: 13 }} value={u.role} disabled={u.code === user?.code}
                    onChange={(e) => role(u, e.target.value as U["role"])}>
                    {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
              </td>
              <td className="small">
                {!u.has_password ? <span className="chip sm grey">ยังไม่ตั้งรหัสผ่าน</span>
                  : u.locked ? <span className="chip sm err">ล็อก (ใส่ผิดหลายครั้ง)</span>
                  : u.must_change_pw ? <span className="chip sm warn">รอเปลี่ยนรหัสชั่วคราว</span>
                  : <span className="chip sm ok">ปกติ</span>}
              </td>
              <td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {ask === u.code ? (
                  <>
                    <button className="lk boxed del" onClick={() => { setAsk(null); reset(u); }}>ยืนยันรีเซ็ต</button>
                    <button className="lk" onClick={() => setAsk(null)}>ยกเลิก</button>
                  </>
                ) : <button className="lk boxed" onClick={() => setAsk(u.code)}>รีเซ็ตรหัสผ่าน</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
