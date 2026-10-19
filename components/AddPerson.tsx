"use client";
import { useState } from "react";
import { api } from "./lib";

export default function AddPerson({ incidentId, by, flag, onAdded }: { incidentId: string; by: string; flag?: number | null; onAdded: () => void }) {
  const [f, setF] = useState({ name: "", gender: "", flag_no: flag != null ? String(flag) : "", note: "" });
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/incidents/${incidentId}/people`, { method: "POST", json: { ...f, by } });
      setMsg(`เพิ่ม ${f.name} แล้ว`);
      setF({ ...f, name: "", note: "" });
      onAdded();
    } catch (err: any) {
      setMsg(err.message);
    }
  }
  return (
    <form onSubmit={submit} className="stack" style={{ gap: 10 }}>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <label className="field">ชื่อ-สกุล<input type="text" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">เพศ
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="">ไม่ระบุ</option><option>ชาย</option><option>หญิง</option><option>อื่นๆ</option>
          </select>
        </label>
        {flag === undefined && (
          <label className="field">ธง<input type="number" inputMode="numeric" value={f.flag_no} onChange={(e) => setF({ ...f, flag_no: e.target.value })} /></label>
        )}
        <label className="field">บริษัท / หมายเหตุ<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit">เพิ่มเข้ารายชื่อ</button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </form>
  );
}
