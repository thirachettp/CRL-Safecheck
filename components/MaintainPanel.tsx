"use client";
import { useMemo, useState } from "react";
import { api, fmtDateTime } from "./lib";
import { useAdmin } from "./identity";

type Step = { key: string; label: string; mode: "pull" | "push" | "off"; ok: boolean; ms: number | null; received: number | null; message: string };
type Person = {
  source: "div" | "outsource" | "driver"; key: string; name: string; verdict: "in" | "out" | "unknown"; site: string | null; since: string | null;
  reason: string; flags: string[]; events: number; in_at: string | null; out_at: string | null;
  emp_id?: string | null; email?: string | null; plate?: string | null; gender?: string | null; phone?: string | null; company?: string | null;
  cost_center?: string | null; cc_name?: string | null; area?: string | null; flag_no?: string | null; assembly_point?: string | null;
  in_plan?: boolean; status_text?: string | null;
};
type Count = { in: number; out: number; unknown: number; flagged: number };
type Report = {
  at: string; window_h: number; ms: number; rows: Record<string, number>;
  summary: { total: Count; div: Count; outsource: Count; driver: Count; sites: { site: string; n: number }[] };
  people: Person[];
};
type Res = { steps: Step[] | null; pull_ms?: number; total_ms?: number; report: Report };

const SRC: Record<string, string> = { div: "DIV+ (MS Form)", outsource: "Outsource", driver: "Driver (KIOS)" };
const V: Record<string, [string, string]> = { in: ["ok", "อยู่"], out: ["grey", "ไม่อยู่"], unknown: ["warn", "ไม่แน่ใจ"] };
const d = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** คอลัมน์มาตรฐาน ใช้ทั้งตารางและไฟล์ CSV */
const COLS: [string, (p: Person) => string][] = [
  ["ผล", (p) => V[p.verdict][1]],
  ["แหล่ง", (p) => SRC[p.source]],
  ["รหัสพนักงาน", (p) => d(p.emp_id)],
  ["ชื่อ", (p) => p.name],
  ["เพศ", (p) => d(p.gender)],
  ["Cost Center", (p) => d(p.cost_center)],
  ["ชื่อ Cost Center", (p) => d(p.cc_name)],
  ["แผนก/พื้นที่", (p) => d(p.area)],
  ["ธง", (p) => d(p.flag_no)],
  ["จุดรวมพล", (p) => d(p.assembly_point)],
  ["ในชุดธง", (p) => (p.source === "driver" ? "—" : p.in_plan ? "ใช่" : "ไม่")],
  ["ไซต์/โซน", (p) => d(p.site)],
  ["เข้า", (p) => (p.in_at ? fmtDateTime(p.in_at) : "—")],
  ["ออก", (p) => (p.out_at ? fmtDateTime(p.out_at) : "—")],
  ["สถานะในระบบต้นทาง", (p) => d(p.status_text)],
  ["อีเมล", (p) => d(p.email)],
  ["เบอร์โทร", (p) => d(p.phone)],
  ["บริษัท", (p) => d(p.company)],
  ["ทะเบียนรถ", (p) => d(p.plate)],
  ["จำนวนรายการ", (p) => String(p.events)],
  ["เหตุผล", (p) => p.reason],
  ["ควรตรวจ", (p) => p.flags.join(" · ")],
];

function downloadCsv(list: Person[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [COLS.map((c) => c[0]), ...list.map((p) => COLS.map((c) => c[1](p)))];
  const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `safecheck-maintain-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const sec = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} วิ`);

/** ปุ่ม Maintain: ดึงทุกแหล่งย้อนหลัง 48 ชม. จับเวลา และตรวจคร่าวๆ ว่าใครอยู่/ไม่อยู่ */
export default function MaintainPanel() {
  const { admin, unlock } = useAdmin();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"" | "pull" | "check">("");
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState("all");
  const [ver, setVer] = useState("all");
  const [onlyFlag, setOnlyFlag] = useState(false);
  const [term, setTerm] = useState("");

  async function run(mode: "pull" | "check") {
    setBusy(mode); setErr(null);
    const t = Date.now();
    try {
      const r = await api<Res>("/api/maintain", { method: mode === "pull" ? "POST" : "GET" });
      setRes({ ...r, total_ms: r.total_ms ?? Date.now() - t });
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }

  const list = useMemo(() => {
    const s = term.trim().toLowerCase();
    return (res?.report.people ?? []).filter((p) =>
      (src === "all" || p.source === src) && (ver === "all" || p.verdict === ver) && (!onlyFlag || p.flags.length) &&
      (!s || `${p.name} ${p.key} ${p.site ?? ""}`.toLowerCase().includes(s)));
  }, [res, src, ver, onlyFlag, term]);

  if (!admin)
    return (
      <section className="card stack" style={{ padding: 18 }}>
        <b style={{ fontSize: 16 }}>Maintain</b>
        <p className="muted small">ดึงทุกแหล่งย้อนหลัง 48 ชม. เพื่อทดสอบเวลาที่ใช้ และตรวจว่าใครอยู่/ไม่อยู่ · เฉพาะ Admin</p>
        <form className="row" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); try { await unlock(pin); } catch (x: any) { setErr(x.message); } setPin(""); }}>
          <input className="in mono" type="password" inputMode="numeric" placeholder="รหัส Admin" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 200 }} />
          <button className="btn btn-pri" disabled={pin.length < 4}>เข้าใช้งาน</button>
        </form>
        {err && <p className="notice err">{err}</p>}
      </section>
    );

  const S = res?.report.summary;
  return (
    <section className="card stack" style={{ padding: 18, gap: 14 }}>
      <div className="row" style={{ gap: 8 }}>
        <b className="grow" style={{ fontSize: 16 }}>Maintain</b>
        <button className="btn" onClick={() => run("check")} disabled={!!busy}>{busy === "check" ? "กำลังตรวจ…" : "ตรวจอย่างเดียว"}</button>
        <button className="btn btn-pri" onClick={() => run("pull")} disabled={!!busy}>{busy === "pull" ? "กำลังดึง 48 ชม.…" : "Maintain · ดึงย้อนหลัง 48 ชม."}</button>
      </div>
      <p className="muted xs" style={{ marginTop: -8 }}>
        Maintain = เรียกทุกแหล่งพร้อมกัน จับเวลารายแหล่ง แล้วตรวจอยู่/ไม่อยู่จากข้อมูล 48 ชม. · ตรวจอย่างเดียว = ไม่ดึงใหม่ ใช้ข้อมูลที่มี
      </p>
      {err && <p className="notice err">{err}</p>}

      {res?.steps && (
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>แหล่ง</th><th>วิธี</th><th>เวลาที่ใช้</th><th>ได้</th><th>ผล</th></tr></thead>
          <tbody>
            {res.steps.map((s) => (
              <tr key={s.key} className={s.mode !== "off" && !s.ok ? "bad" : ""}>
                <td><b>{s.label}</b></td>
                <td><span className={`chip sm ${s.mode === "pull" ? "ok" : "grey"}`}>{s.mode === "pull" ? "ดึง" : s.mode === "push" ? "รับเข้ามาเอง" : "ปิด"}</span></td>
                <td className="mono">{sec(s.ms)}</td>
                <td className="mono">{s.received ?? "—"}</td>
                <td className="small">{s.message}</td>
              </tr>
            ))}
            <tr><td><b>รวม</b></td><td /><td className="mono"><b>{sec(res.pull_ms)}</b></td><td /><td className="small muted">
              ตรวจอยู่/ไม่อยู่ใช้ {sec(res.report.ms)} · ทั้งหมด {sec(res.total_ms)}</td></tr>
          </tbody>
        </table></div>
      )}

      {S && (
        <>
          <div className="muted xs">ตรวจเมื่อ {fmtDateTime(res!.report.at)} · ข้อมูลย้อนหลัง {res!.report.window_h} ชม. ·
            แถวที่ใช้ MS Form {res!.report.rows.div} · Outsource {res!.report.rows.outsource} · KIOS {res!.report.rows.driver}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {(["total", "div", "outsource", "driver"] as const).map((k) => (
              <div key={k} className="card" style={{ padding: 12 }}>
                <div className="muted xs" style={{ fontWeight: 600 }}>{k === "total" ? "รวมทุกแหล่ง" : SRC[k]}</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{S[k].in}<span className="muted small" style={{ fontWeight: 500 }}> อยู่</span></div>
                <div className="muted xs">ไม่อยู่ {S[k].out} · ไม่แน่ใจ {S[k].unknown} · ผิดปกติ {S[k].flagged}</div>
              </div>
            ))}
          </div>
          {S.sites.length > 0 && <div className="small">อยู่ในพื้นที่ตามไซต์: {S.sites.map((s) => `${s.site} ${s.n}`).join(" · ")}</div>}

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="in" style={{ width: "auto" }} value={src} onChange={(e) => setSrc(e.target.value)}>
              <option value="all">ทุกแหล่ง</option><option value="div">DIV+ (MS Form)</option><option value="outsource">Outsource</option><option value="driver">Driver (KIOS)</option>
            </select>
            <select className="in" style={{ width: "auto" }} value={ver} onChange={(e) => setVer(e.target.value)}>
              <option value="all">ทุกผล</option><option value="in">อยู่</option><option value="out">ไม่อยู่</option><option value="unknown">ไม่แน่ใจ</option>
            </select>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={onlyFlag} onChange={(e) => setOnlyFlag(e.target.checked)} /> เฉพาะที่ผิดปกติ</label>
            <input className="in grow" style={{ minWidth: 160 }} placeholder="ค้นชื่อ / รหัส / อีเมล / ทะเบียน" value={term} onChange={(e) => setTerm(e.target.value)} />
            <span className="muted xs">{list.length} คน</span>
            <button className="btn btn-sm" onClick={() => downloadCsv(list)} disabled={!list.length}>ดาวน์โหลด CSV</button>
          </div>
          <div className="scroll-x" style={{ maxHeight: 520, overflowY: "auto" }}><table className="tbl">
            <thead><tr>{COLS.map(([h]) => <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {!list.length && <tr><td colSpan={COLS.length} className="muted">ไม่มีรายการ</td></tr>}
              {list.slice(0, 500).map((p) => (
                <tr key={`${p.source}:${p.key}`}>
                  {COLS.map(([h, f]) => (
                    <td key={h} className={h === "เหตุผล" || h === "ควรตรวจ" ? "small" : h === "ชื่อ" ? "" : "small"}
                      style={{ whiteSpace: h === "เหตุผล" || h === "ควรตรวจ" ? "normal" : "nowrap", minWidth: h === "เหตุผล" ? 260 : h === "ควรตรวจ" ? 200 : undefined,
                        color: h === "ควรตรวจ" ? "#9a3412" : undefined }}>
                      {h === "ผล" ? <span className={`chip sm ${V[p.verdict][0]}`}>{f(p)}</span> : h === "ชื่อ" ? <b>{f(p)}</b> : f(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table></div>
          {list.length > 500 && <p className="muted xs">แสดง 500 แรก กรองเพิ่มเพื่อดูส่วนที่เหลือ</p>}
        </>
      )}
    </section>
  );
}
