"use client";
import { useState } from "react";
import LoginSheet from "./LoginSheet";
import { useUser } from "./identity";
import { api, KINDS } from "./lib";
import { IAlert, IClose, ILock } from "./Icons";

/** แจ้งเหตุจริงระหว่างซ้อม: ต้องเข้าสู่ระบบก่อน ยืนยันโดย Admin / Safety แล้วระบบจบการซ้อมให้อัตโนมัติ */
export default function ReportSheet({ onClose, pending }: { onClose: () => void; pending?: any }) {
  const { user } = useUser();
  const [login, setLogin] = useState(false);
  const [kind, setKind] = useState(KINDS[0].id);
  const [other, setOther] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<any>(pending ?? null);

  async function send() {
    setBusy(true); setErr(null);
    try {
      const k = kind === "อื่นๆ" ? other.trim() : kind;
      if (!k) throw new Error("พิมพ์ประเภทเหตุ");
      await api("/api/incidents", { method: "POST", json: { action: "report", kind: k, area: area.trim() } });
      setSent({ kind: k, area: area.trim() });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (login) return <LoginSheet onClose={() => setLogin(false)} onDone={() => setLogin(false)} />;
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="แจ้งเหตุจริง">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <b className="grow" style={{ fontSize: 17, color: "#B91C1C" }}>แจ้งเหตุจริง</b>
          <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button>
        </div>
        {sent ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="card stack" style={{ padding: 14, border: "2px solid #B91C1C", gap: 4 }}>
              <b style={{ color: "#B91C1C" }}>แจ้งเหตุแล้ว · รอยืนยัน</b>
              <div>{sent.kind} · {sent.area || "ไม่ระบุพื้นที่"}</div>
              <div className="muted small">แจ้ง Admin / Safety Officer แล้ว เมื่อยืนยัน ระบบจะจบการซ้อมและเริ่มนับเหตุจริงให้ทันที</div>
            </div>
            <a className="btn btn-block" href="/?stay=1">ไปหน้าแรก (Admin / Safety ยืนยันที่นี่)</a>
          </div>
        ) : !user ? (
          <div className="stack" style={{ gap: 10 }}>
            <div className="card row" style={{ padding: 14, gap: 10, background: "#FFF1F2", borderColor: "#FCA5A5", flexWrap: "nowrap" }}>
              <ILock size={20} color="#B91C1C" />
              <div className="grow"><b>ต้องเข้าสู่ระบบก่อนแจ้งเหตุจริง</b>
                <div className="muted small">เพื่อให้ Admin / Safety รู้ว่าใครแจ้ง และติดต่อกลับได้</div></div>
            </div>
            <button className="btn btn-pri btn-block" style={{ minHeight: 52 }} onClick={() => setLogin(true)}>เข้าสู่ระบบ / ลงทะเบียน</button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted small">ใช้เมื่อเกิดเหตุจริงระหว่างซ้อม · Admin / Safety ยืนยันแล้ว ระบบจะจบการซ้อมให้อัตโนมัติ</p>
            <div className="row" style={{ gap: 8 }}>
              {KINDS.map((k) => (
                <button key={k.id} className={`pill${kind === k.id ? " on" : ""}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}>{k.label}</button>
              ))}
            </div>
            {kind === "อื่นๆ" && (
              <label className="lb" style={{ fontSize: 13 }}>ระบุเหตุ
                <input className="in" value={other} onChange={(e) => setOther(e.target.value)} maxLength={60} placeholder="เช่น น้ำท่วม, ไฟฟ้าดับ" autoFocus />
              </label>
            )}
            <label className="lb" style={{ fontSize: 13 }}>พื้นที่เกิดเหตุ
              <input className="in" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="เช่น Sort ชั้น 2" />
            </label>
            {err && <p className="notice err">{err}</p>}
            <button className="btn btn-red btn-block" style={{ minHeight: 56, fontSize: 17 }} onClick={send} disabled={busy || (kind === "อื่นๆ" && !other.trim())}>
              <IAlert />แจ้งเหตุจริง
            </button>
            <div className="muted xs" style={{ textAlign: "center" }}>แจ้งในนาม {user.name}</div>
          </div>
        )}
      </div>
    </div>
  );
}
