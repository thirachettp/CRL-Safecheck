"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, usePoll, fmtDateTime, duration } from "@/components/lib";

export default function IncidentsPage() {
  const router = useRouter();
  const list = usePoll<{ incidents: any[] }>("/api/incidents", 10000);
  const src = usePoll<{ sites: { site: string; n: number }[] }>("/api/sources", 0);
  const [mode, setMode] = useState<"real" | "drill">("real");
  const [sites, setSites] = useState<string[]>([]);
  const [includePlan, setIncludePlan] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      // snapshot จาก cache ทันที แล้วค่อยดึงสดแบบขนาน ไม่ให้หน้าจอรอ network
      const { id } = await api("/api/incidents", { method: "POST", json: { mode, divSites: sites, includePlan } });
      api(`/api/incidents/${id}/refresh`, { method: "POST" }).catch(() => {});
      router.push(`/incidents/${id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const openOnes = (list.data?.incidents ?? []).filter((i) => !i.closed_at);
  const toggleSite = (s: string) => setSites((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  return (
    <main className="page stack">
      <div className="page-head">
        <div>
          <h1>เหตุการณ์</h1>
          <p className="muted">เปิดเหตุการณ์แล้วระบบ snapshot รายชื่อทันที ผู้นำธงเริ่มนับได้เลย ข้อมูลสดทยอยตามมา</p>
        </div>
      </div>

      {openOnes.length > 0 && (
        <div className="notice notice-fire">
          มีเหตุการณ์เปิดอยู่ {openOnes.length} รายการ:{" "}
          {openOnes.map((i) => (
            <a key={i.id} href={`/incidents/${i.id}`} style={{ color: "inherit", marginRight: 12 }}>
              #{i.id} {i.mode === "drill" ? "ซ้อม" : "จริง"} เปิดเมื่อ {fmtDateTime(i.opened_at)}
            </a>
          ))}
        </div>
      )}

      <section className="panel stack">
        <h2>เปิดเหตุการณ์ใหม่</h2>
        <div className="seg" role="group" aria-label="ประเภทเหตุการณ์">
          <button aria-pressed={mode === "real"} onClick={() => setMode("real")}>เหตุการณ์จริง</button>
          <button aria-pressed={mode === "drill"} onClick={() => setMode("drill")}>ซ้อมอพยพ</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={includePlan} onChange={(e) => setIncludePlan(e.target.checked)} />
          <span>
            รวมทุกคนในแผนอพยพ
            <span className="muted small" style={{ display: "block" }}>
              แนะนำให้เปิดไว้ระหว่างที่ยังไม่มีข้อมูล Cnext / Outsource / Driver ไม่งั้นจะเห็นเฉพาะคนที่เช็กอินผ่านฟอร์ม
            </span>
          </span>
        </label>
        {!!src.data?.sites.length && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small"><b>นับคนที่เช็กอินฟอร์มเฉพาะไซต์</b> <span className="muted">ไม่เลือก = ทุกไซต์</span></span>
            <div className="row">
              {src.data.sites.map((s) => (
                <label key={s.site} className="check" style={{ alignItems: "center" }}>
                  <input type="checkbox" checked={sites.includes(s.site)} onChange={() => toggleSite(s.site)} />
                  {s.site}
                </label>
              ))}
            </div>
          </div>
        )}
        {err && <p className="notice notice-fire">{err}</p>}
        <div>
          <button className={`btn btn-lg ${mode === "real" ? "btn-fire" : ""}`} style={mode === "drill" ? { background: "var(--warn-stripe)", borderColor: "var(--warn-stripe)" } : undefined}
            onClick={open} disabled={busy}>
            {busy ? "กำลังเปิด…" : mode === "real" ? "เปิดเหตุการณ์จริง" : "เริ่มซ้อมอพยพ"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>ประวัติ</h2>
        {!list.data ? <p className="muted">กำลังโหลด…</p> : list.data.incidents.length === 0 ? (
          <p className="muted">ยังไม่เคยเปิดเหตุการณ์</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>ประเภท</th><th>เปิด</th><th>ปิด</th><th className="r">คน</th><th className="r">ยังไม่ถูกนับ</th><th className="r">นับครบใน</th></tr></thead>
              <tbody>
                {list.data.incidents.map((i) => (
                  <tr key={i.id}>
                    <td><a href={`/incidents/${i.id}`}>#{i.id}</a></td>
                    <td><span className={`pill ${i.mode === "real" ? "pill-fire" : "pill-warn"}`}>{i.mode === "real" ? "จริง" : "ซ้อม"}</span></td>
                    <td>{fmtDateTime(i.opened_at)}</td>
                    <td>{i.closed_at ? fmtDateTime(i.closed_at) : <b>เปิดอยู่</b>}</td>
                    <td className="r num">{i.total}</td>
                    <td className="r num">{i.pending}</td>
                    <td className="r num">{i.first_full_at ? duration(i.opened_at, i.first_full_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
