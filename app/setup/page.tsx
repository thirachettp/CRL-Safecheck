"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, usePoll, fmtDateTime, duration } from "@/components/lib";
import type { MergedPlan } from "@/lib/parsers";

type PlanSummary = {
  flags: { flag_no: number | null; assembly_point: string | null; people: number; male: number; female: number; areas: string | null }[];
  leaders: { flag_no: number; leader_name: string; assembly_point: string | null; area: string | null }[];
  total: number;
  files: number;
  updated_at: string | null;
};

export default function SetupPage() {
  const plan = usePoll<PlanSummary>("/api/plan", 0);
  return (
    <main className="page stack">
      <div className="page-head">
        <div>
          <h1>ข้อมูลธงและการซ้อม</h1>
          <p className="muted">ตั้งต้นว่าใครต้องไปธงไหน แล้วซ้อมให้ทุกธงนับครบ</p>
        </div>
      </div>
      <ImportPlan onSaved={plan.reload} />
      <DrillPanel ready={(plan.data?.total ?? 0) > 0} />
      <CurrentPlan data={plan.data} error={plan.error} />
      <LinkPanel />
    </main>
  );
}

// ---------------- นำเข้าไฟล์แผนอพยพ ----------------
function ImportPlan({ onSaved }: { onSaved: () => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [merged, setMerged] = useState<(MergedPlan & { fileCount: number }) | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function readFiles(files: FileList | File[]) {
    const list = [...files].filter((f) => /\.xlsx?$/i.test(f.name));
    if (!list.length) return setMsg({ kind: "warn", text: "เลือกไฟล์ .xlsx ของแผนอพยพ" });
    setBusy(true);
    setMsg(null);
    try {
      // อ่านไฟล์ในเบราว์เซอร์ ไม่อัปโหลดไฟล์ดิบขึ้นเซิร์ฟเวอร์
      const XLSX = await import("xlsx");
      const { parsePlanWorkbook, mergePlan } = await import("@/lib/parsers");
      const results = [];
      for (const f of list) {
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        results.push(parsePlanWorkbook(wb, f.name));
      }
      setMerged({ ...mergePlan(results), fileCount: list.length });
    } catch (e: any) {
      setMsg({ kind: "fire", text: `อ่านไฟล์ไม่สำเร็จ: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!merged) return;
    setBusy(true);
    try {
      const r = await api("/api/plan", { method: "POST", json: { people: merged.people, leaders: merged.leaders } });
      setMsg({ kind: "safe", text: `บันทึกแผนอพยพแล้ว ${r.saved} คน ผู้นำธง ${r.leaders} ธง` });
      setMerged(null);
      onSaved();
    } catch (e: any) {
      setMsg({ kind: "fire", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const errors = merged?.issues.filter((i) => i.level === "error") ?? [];
  const warns = merged?.issues.filter((i) => i.level === "warn") ?? [];
  const flags = merged ? new Set(merged.people.map((p) => p.flag_no)).size : 0;

  return (
    <section className="panel">
      <h2>นำเข้าแผนอพยพรายแผนก</h2>
      <p className="muted panel-sub small">
        ลากไฟล์ Excel ทุกแผนกมาพร้อมกัน ระบบหาแถวหัวตารางที่มี “รหัสพนักงาน” เอง และอ่านชีตผู้นำธงด้วย บันทึกแล้วจะแทนที่แผนชุดเดิมทั้งหมด
      </p>
      <div
        className="dropzone"
        data-over={over}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); readFiles(e.dataTransfer.files); }}
      >
        <b>{busy ? "กำลังอ่านไฟล์…" : "วางไฟล์ .xlsx ที่นี่ หรือกดเพื่อเลือก"}</b>
        <span className="muted small">เลือกได้หลายไฟล์ เช่น 1.Sort.xlsx ถึง 33.CMG MZ2.xlsx</span>
        <input ref={input} type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => e.target.files && readFiles(e.target.files)} />
      </div>

      {msg && <div className={`notice notice-${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}

      {merged && (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="counters">
            <div className="counter"><b>{merged.fileCount}</b><span>ไฟล์</span></div>
            <div className="counter"><b>{merged.people.length}</b><span>คน</span></div>
            <div className="counter"><b>{flags}</b><span>ธง</span></div>
            <div className="counter"><b>{merged.leaders.length}</b><span>ผู้นำธง</span></div>
            <div className={`counter ${errors.length ? "counter-fire" : ""}`}><b>{errors.length}</b><span>ปัญหาต้องแก้</span></div>
            <div className="counter"><b>{warns.length}</b><span>คำเตือน</span></div>
          </div>
          {merged.duplicates.length > 0 && (
            <div className="notice notice-warn">
              พบ {merged.duplicates.length} คนอยู่มากกว่าหนึ่งไฟล์ ระบบใช้ค่าจากไฟล์แรก ตัวอย่าง: {merged.duplicates.slice(0, 5).map((d) => `${d.emp_id} (${d.files.join(", ")})`).join("; ")}
            </div>
          )}
          {(errors.length > 0 || warns.length > 0) && (
            <details open={errors.length > 0}>
              <summary><b>รายการปัญหา</b> <span className="muted small">กดเพื่อดูทั้งหมด</span></summary>
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: "auto", marginTop: 8 }}>
                <table>
                  <thead><tr><th>ระดับ</th><th>ไฟล์</th><th>รายละเอียด</th></tr></thead>
                  <tbody>
                    {[...errors, ...warns].slice(0, 300).map((i, k) => (
                      <tr key={k}>
                        <td><span className={`pill ${i.level === "error" ? "pill-fire" : "pill-warn"}`}>{i.level === "error" ? "ต้องแก้" : "เตือน"}</span></td>
                        <td className="small">{i.file}</td>
                        <td className="small">{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="row">
            <button className="btn btn-primary btn-lg" onClick={save} disabled={busy || merged.people.length === 0}>
              บันทึกแผนอพยพ {merged.people.length} คน
            </button>
            <button className="btn btn-ghost" onClick={() => setMerged(null)} disabled={busy}>ยกเลิก</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------- เมนูซ้อม ----------------
function DrillPanel({ ready }: { ready: boolean }) {
  const router = useRouter();
  const list = usePoll<{ incidents: any[] }>("/api/incidents", 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drills = (list.data?.incidents ?? []).filter((i) => i.mode === "drill");

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const { id } = await api("/api/incidents", { method: "POST", json: { mode: "drill", title: "ซ้อมอพยพ", includePlan: true } });
      api(`/api/incidents/${id}/refresh`, { method: "POST" }).catch(() => {});
      router.push(`/incidents/${id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2>ซ้อมอพยพ</h2>
          <p className="muted small">ทำงานเหมือนเหตุการณ์จริงทุกอย่าง แต่ติดป้ายซ้อมและไม่แจ้งทีมช่วยเหลือ ระบบจับเวลาตั้งแต่เปิดจนนับครบ</p>
        </div>
        <button className="btn btn-lg" style={{ background: "var(--warn-stripe)", borderColor: "var(--warn-stripe)" }} onClick={start} disabled={busy || !ready}>
          เริ่มซ้อมอพยพ
        </button>
      </div>
      {!ready && <p className="notice notice-warn">นำเข้าแผนอพยพก่อน จึงจะเริ่มซ้อมได้</p>}
      {err && <p className="notice notice-fire">{err}</p>}
      {drills.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>เริ่มซ้อม</th><th className="r">คน</th><th className="r">นับครบใน</th><th className="r">ค้างตอนปิด</th><th></th></tr></thead>
            <tbody>
              {drills.map((d) => (
                <tr key={d.id}>
                  <td>{fmtDateTime(d.opened_at)}</td>
                  <td className="r num">{d.total}</td>
                  <td className="r num">{d.first_full_at ? duration(d.opened_at, d.first_full_at) : d.closed_at ? "ไม่ครบ" : "กำลังซ้อม"}</td>
                  <td className="r num">{d.closed_at ? d.pending : "—"}</td>
                  <td className="r"><a href={`/incidents/${d.id}`}>เปิด</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------- แผนปัจจุบัน ----------------
function CurrentPlan({ data, error }: { data: PlanSummary | null; error: string | null }) {
  if (error) return <section className="panel"><p className="notice notice-fire">{error}</p></section>;
  if (!data) return <section className="panel"><p className="muted">กำลังโหลด…</p></section>;
  const leader = new Map(data.leaders.map((l) => [l.flag_no, l]));
  return (
    <section className="panel">
      <h2>แผนอพยพที่ใช้อยู่</h2>
      <p className="muted panel-sub small">
        {data.total ? `${data.total} คน จาก ${data.files} ไฟล์ อัปเดต ${fmtDateTime(data.updated_at)}` : "ยังไม่มีแผน นำเข้าไฟล์ด้านบนก่อน"}
      </p>
      {data.total > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th className="r">ธง</th><th>จุดรวมพล</th><th>ผู้นำธง</th><th>พื้นที่</th><th className="r">คน</th><th className="r">ชาย</th><th className="r">หญิง</th></tr></thead>
            <tbody>
              {data.flags.map((f) => (
                <tr key={String(f.flag_no)}>
                  <td className="r num"><b>{f.flag_no ?? "ไม่ระบุ"}</b></td>
                  <td>{f.assembly_point ?? "—"}</td>
                  <td>{f.flag_no != null ? leader.get(f.flag_no)?.leader_name ?? <span className="pill pill-warn">ไม่มีผู้นำธง</span> : "—"}</td>
                  <td className="small">{f.areas}</td>
                  <td className="r num">{f.people}</td>
                  <td className="r num">{f.male}</td>
                  <td className="r num">{f.female}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------- จับคู่อีเมล ↔ รหัสพนักงาน ----------------
function LinkPanel() {
  const links = usePoll<{ links: number; unmatched: { email: string; name: string; checkins: number }[] }>("/api/links", 0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function send(rows: { email: string; emp_id: string }[]) {
    try {
      const r = await api("/api/links", { method: "POST", json: { rows } });
      setMsg({ kind: "safe", text: `จับคู่แล้ว ${r.saved} รายการ` });
      setDraft({});
      links.reload();
    } catch (e: any) {
      setMsg({ kind: "fire", text: e.message });
    }
  }

  async function upload(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const pick = (r: Record<string, unknown>, keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.some((y) => x.replace(/\s/g, "").toLowerCase().includes(y)));
      return k ? String(r[k]).trim() : "";
    };
    send(rows.map((r) => ({ email: pick(r, ["email", "อีเมล"]), emp_id: pick(r, ["รหัสพนักงาน", "empid", "employeeid"]) })));
  }

  const un = links.data?.unmatched ?? [];
  return (
    <section className="panel">
      <h2>จับคู่อีเมลกับรหัสพนักงาน</h2>
      <p className="muted panel-sub small">
        ฟอร์มรู้แค่อีเมล แผนอพยพรู้แค่รหัสพนักงาน คนที่ยังไม่จับคู่จะขึ้นเป็น “ไม่ระบุธง” ตอนเกิดเหตุ ({links.data?.links ?? 0} คู่ในระบบ)
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => input.current?.click()}>อัปโหลดไฟล์คู่อีเมล–รหัสพนักงาน</button>
        <span className="muted small">Excel หรือ CSV ที่มีคอลัมน์ Email และ รหัสพนักงาน</span>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {msg && <p className={`notice notice-${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</p>}
      {un.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>อีเมลที่ยังไม่จับคู่</th><th>ชื่อในฟอร์ม</th><th className="r">ส่งฟอร์ม</th><th>รหัสพนักงาน</th></tr></thead>
              <tbody>
                {un.map((u) => (
                  <tr key={u.email}>
                    <td className="small">{u.email}</td>
                    <td>{u.name}</td>
                    <td className="r num">{u.checkins}</td>
                    <td style={{ minWidth: 150 }}>
                      <input type="text" inputMode="numeric" placeholder="เช่น 20076487" value={draft[u.email] ?? ""}
                        onChange={(e) => setDraft({ ...draft, [u.email]: e.target.value })} aria-label={`รหัสพนักงานของ ${u.email}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={!Object.values(draft).some(Boolean)}
              onClick={() => send(Object.entries(draft).filter(([, v]) => v).map(([email, emp_id]) => ({ email, emp_id })))}>
              บันทึกการจับคู่
            </button>
          </div>
        </>
      ) : (
        <p className="muted small">ทุกอีเมลที่ส่งฟอร์มเข้ามาจับคู่ครบแล้ว</p>
      )}
    </section>
  );
}
