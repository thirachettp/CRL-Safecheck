"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MobileShell from "@/components/MobileShell";
import LoginSheet from "@/components/LoginSheet";
import { DEFAULT_KINDS } from "@/lib/codes";
import ReportSheet from "@/components/ReportSheet";
import { useUser, useAdmin } from "@/components/identity";
import { api, usePoll, fmtTime, fmtDateTime, initials, rangeText, freshness, lastTouch, ago } from "@/components/lib";
import { NotifyCard } from "@/components/Notify";
import ShareApp from "@/components/ShareApp";
import { IClose } from "@/components/Icons";
import { IFlag, ISearch, IChart, IUser, IAlert, ILock } from "@/components/Icons";

type Point = { code: string; name: string; backup: string | null; flags: string[] | null };

export default function HomePage() {
  return <Suspense><Home /></Suspense>;
}

function Home() {
  const router = useRouter();
  const stay = useSearchParams().get("stay") === "1";
  const { user } = useUser();
  const { admin, unlock } = useAdmin();
  const cur = usePoll<{ current: any; pending?: any }>("/api/incidents", 4000);
  const plan = usePoll<{ flags: any[]; points: Point[]; extra_areas?: string[]; kinds?: { kinds: { name: string; code: string; main?: boolean }[] } }>("/api/plan", 0);
  const [otherKind, setOtherKind] = useState("");
  const [drillPrep, setDrillPrep] = useState(false);
  const staff = admin?.role === "admin" || admin?.role === "safety";
  const [showLogin, setShowLogin] = useState(false);
  const [reporting, setReporting] = useState(false);
  // ประเภทเหตุจากหน้าตั้งค่า (ไฟไหม้ 500 · แอมโมเนียรั่ว 520 · แผ่นดินไหว 800) + อื่นๆ
  const KINDS = [...(plan.data?.kinds?.kinds ?? DEFAULT_KINDS.kinds).filter((k) => k.main !== false).map((k) => ({ id: k.name, label: k.name })), { id: "อื่นๆ", label: "อื่นๆ" }];
  const SUBKINDS = (plan.data?.kinds?.kinds ?? DEFAULT_KINDS.kinds).filter((k) => k.main === false);
  const [kindSel, setKind] = useState<string | null>(null);
  const kind = kindSel ?? KINDS[0].id;
  const [mode, setMode] = useState<"real" | "drill">("real");
  const [area, setArea] = useState("");
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เหตุจริงที่แจ้งระหว่างซ้อม ให้ขึ้นก่อน (Admin / Safety ยืนยันได้ทันที)
  const inc = cur.data?.pending ?? cur.data?.current ?? null;
  const step = !inc ? "idle" : inc.state === "pending" ? "pending" : "active";
  const areas = useMemo(
    () => [...new Set([...(plan.data?.flags ?? []).map((f) => f.area), ...(plan.data?.extra_areas ?? [])].filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "th")) as string[],
    [plan.data]);
  const points = plan.data?.points ?? [];

  // ระหว่างซ้อม เปิดแอพแล้วเข้าหน้าค้นหาทันที
  useEffect(() => {
    if (inc?.state === "active" && inc.mode === "drill" && !stay) router.replace("/search");
  }, [inc, stay, router]);

  async function report() {
    if (!user) return setShowLogin(true);
    setBusy(true); setErr(null);
    try {
      const k = kind === "อื่นๆ" ? otherKind.trim() : kind;
      if (!k) throw new Error("พิมพ์ประเภทเหตุ");
      await api("/api/incidents", { method: "POST", json: { action: "report", mode, kind: k, area: area.trim(), by: user.name } });
      cur.reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr(null);
    try {
      if (!admin) await unlock(pin);
      await api(`/api/incidents/${inc.id}`, { method: "POST", json: { action: "confirm", closedPoints: Object.keys(off).filter((k) => off[k]) } });
      setPin("");
      cur.reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true);
    try { await api(`/api/incidents/${inc.id}`, { method: "POST", json: { action: "cancel", by: user?.name ?? "" } }); cur.reload(); }
    finally { setBusy(false); }
  }

  const pointName = (code: string) => points.find((p) => p.code === code)?.name ?? `จุดรวมพล ${code}`;
  const flagsOf = (p: Point) => (p.flags?.length ? `ธง ${rangeText(p.flags)}` : "ยังไม่มีธง");
  const closedNote = (inc?.closed_points ?? []).length
    ? inc.closed_points.map((c: string) => {
        const p = points.find((x) => x.code === c);
        return `ปิด${pointName(c)} → ${p ? flagsOf(p) : ""} ไป${p?.backup ? pointName(p.backup) : "จุดสำรอง"}`;
      }).join(", ")
    : "ใช้จุดรวมพลตามปกติทุกจุด";

  return (
    <MobileShell>
      <div className="m-top row" style={{ padding: "12px 16px" }}>
        <IFlag size={22} color="#1F3A5F" />
        <b style={{ fontSize: 15 }}>CRL SafeCheck</b>
        <div className="grow" />
        {user ? (
          <Link className="acct" href="/profile"><span className="avatar">{initials(user.name)}</span>{user.name.split(" ")[0]}</Link>
        ) : (
          <button className="acct" onClick={() => setShowLogin(true)}>
            <span className="avatar" style={{ background: "#E5E7EB" }}><IUser size={16} color="#4B5058" /></span>เข้าสู่ระบบ
          </button>
        )}
      </div>

      <div className="m-body" style={{ padding: 16, gap: 14 }}>
        {cur.error && !cur.data && <p className="notice err">{cur.error}</p>}

        {step === "idle" && (
          <>
            {!user && (
              <div className="card stack" style={{ padding: 16, background: "#EEF2F7", borderColor: "#C7D2E0", gap: 8 }}>
                <b style={{ fontSize: 16 }}>เริ่มใช้งาน</b>
                <p className="small">ลงทะเบียนครั้งเดียวด้วยรหัสพนักงาน ใช้แจ้งเหตุ และช่วยให้ทีมค้นหาคุณได้เร็วตอนเกิดเหตุ</p>
                <button className="btn btn-pri btn-block" onClick={() => setShowLogin(true)}>เข้าสู่ระบบ / ลงทะเบียน</button>
              </div>
            )}
            <div className="card stack" style={{ padding: 16, borderColor: "#FCA5A5" }}>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <button className={`seg grow${mode === "real" ? " on" : ""}`} style={mode === "real" ? { background: "#B91C1C", borderColor: "#B91C1C" } : undefined}
                  onClick={() => setMode("real")} aria-pressed={mode === "real"}>เหตุจริง</button>
                <button className={`seg grow${mode === "drill" ? " on" : ""}`} style={mode === "drill" ? { background: "#A16207", borderColor: "#A16207" } : undefined}
                  onClick={() => setMode("drill")} aria-pressed={mode === "drill"}>ซ้อมอพยพ</button>
              </div>
              <b style={{ fontSize: 17 }}>{mode === "drill" ? "ขอเริ่มซ้อมอพยพ" : "แจ้งเหตุฉุกเฉิน"}</b>
              <p className="muted small">{mode === "drill" ? "เลือกสถานการณ์ที่จะซ้อม · Admin / Safety Officer ยืนยันแล้วจึงเริ่มซ้อม" : "Admin / Safety Officer จะยืนยันก่อนเริ่ม Incident"}</p>
              <div className="row" style={{ gap: 8 }}>
                {KINDS.map((k) => (
                  <button key={k.id} className={`pill${kind === k.id ? " on" : ""}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}>{k.label}</button>
                ))}
              </div>
              {kind === "อื่นๆ" && (<>
                <div className="row" style={{ gap: 6 }}>
                  {SUBKINDS.map((k) => (
                    <button key={k.name} type="button" className={`pill${otherKind.trim() === k.name ? " on" : ""}`} onClick={() => setOtherKind(k.name)}>{k.name} <span className="mono xs" style={{ opacity: .7 }}>{k.code}</span></button>
                  ))}
                </div>
                <label className="lb" style={{ fontSize: 13 }}>หรือพิมพ์เหตุเอง
                  <input className="in" value={otherKind} onChange={(e) => setOtherKind(e.target.value)} maxLength={60} placeholder="เช่น น้ำท่วม, ไฟฟ้าดับ" />
                </label>
              </>)}
              <label className="lb" style={{ fontSize: 13 }}>พื้นที่เกิดเหตุ
                <input className="in" list="areas" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80}
                  placeholder="พิมพ์เพื่อค้นหา หรือพิมพ์พื้นที่ใหม่" style={{ height: 46 }} />
                <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
              </label>
              {area.trim() && !areas.includes(area.trim()) && <div className="muted xs" style={{ marginTop: -6 }}>พื้นที่ใหม่ “{area.trim()}” จะถูกเพิ่มในรายการเมื่อแจ้งเหตุ</div>}
              <button className="btn btn-red btn-block" style={{ minHeight: 56, fontSize: 17, ...(mode === "drill" ? { background: "#A16207", borderColor: "#A16207" } : {}) }} onClick={report} disabled={!user || busy || (kind === "อื่นๆ" && !otherKind.trim())}>
                <IAlert />{mode === "drill" ? "ขอเริ่มซ้อม" : "แจ้งเหตุ"}
              </button>
              {!user && (
                <div className="small" style={{ color: "#881337", fontWeight: 600, textAlign: "center" }}>
                  ต้องเข้าสู่ระบบก่อน{mode === "drill" ? "ขอเริ่มซ้อม" : "แจ้งเหตุ"}{" "}
                  <button className="lk" style={{ textDecoration: "underline", padding: 0, minHeight: 32 }} onClick={() => setShowLogin(true)}>เข้าสู่ระบบ</button>
                </div>
              )}
              {err && <p className="notice err">{err}</p>}
            </div>
            {staff && (
              <div className="card stack" style={{ padding: 16, gap: 8, background: "#FEF3C7", borderColor: "#FCD34D" }}>
                <div className="row"><b className="grow" style={{ fontSize: 16 }}>ซ้อมอพยพ</b><span className="chip sm warn">Admin / Safety</span></div>
                <p className="small" style={{ margin: 0 }}>ดูว่าแต่ละธงตรวจทานล่าสุดเมื่อไร แล้วเริ่มซ้อม · ทุกคนที่เปิดการแจ้งเตือนจะได้รับแจ้ง</p>
                <button className="btn btn-dark btn-block" style={{ minHeight: 50 }} onClick={() => setDrillPrep(true)}>เตรียมซ้อม</button>
              </div>
            )}
            {user && <NotifyCard compact />}
            <div className="stack" style={{ gap: 10 }}>
              <Tile href="/review" icon={<IFlag color="#1F3A5F" />} bg="#EEF2F7" title="ตรวจทานธง" sub="ผู้นำธง · เพิ่ม ลด แก้ไขคนในธง และมา/ไม่มาวันนี้" />
              <Tile href="/search" icon={<ISearch />} bg="#F3F2EE" title="ค้นหาคน" sub="ระหว่างซ้อม / เกิดเหตุ แอพจะเปิดหน้านี้ให้" />
              <Tile href="/dashboard" icon={<IChart />} bg="#F3F2EE" title="Dashboard" sub="ติดตามสถานการณ์ (เหมาะกับจอใหญ่)" />
            </div>
            <ShareApp />
            <div className="card stack" style={{ padding: 16, gap: 10 }}>
              <b>ตอนเกิดเหตุ ทำ 3 ขั้น</b>
              <ol className="steps">
                <li><b>แจ้งเหตุ / ขอซ้อม</b><span className="muted small">กดปุ่มด้านบน · Admin / Safety ยืนยันแล้วระบบเริ่มนับทันที</span></li>
                <li><b>ไปจุดรวมพลของธงคุณ</b><span className="muted small">ถ้าจุดเดิมใช้ไม่ได้ แอพจะบอกจุดสำรอง</span></li>
                <li><b>ผู้นำธงกด “ปลอดภัย”</b><span className="muted small">ทีละคน หรือเช็คชื่อทั้งธงทีเดียว · คนที่ยังไม่ทราบขึ้นบน Dashboard</span></li>
              </ol>
            </div>
          </>
        )}

        {step === "pending" && (
          <>
            <div className="card stack" style={{ padding: 16, border: `2px solid ${inc.mode === "drill" ? "#A16207" : "#B91C1C"}`, gap: 8 }}>
              <b style={{ fontSize: 17, color: inc.mode === "drill" ? "#A16207" : "#B91C1C" }}>{inc.mode === "drill" ? "ขอเริ่มซ้อมอพยพ · รอยืนยัน" : "แจ้งเหตุแล้ว · รอยืนยัน"}</b>
              {cur.data?.pending && cur.data?.current?.mode === "drill" && (
                <div className="small" style={{ fontWeight: 600, background: "#FEF3C7", color: "#78350F", borderRadius: 8, padding: "6px 10px" }}>แจ้งระหว่างซ้อม · ยืนยันแล้วระบบจะจบการซ้อมให้อัตโนมัติ</div>
              )}
              <div>{inc.kind} · {inc.area || "ไม่ระบุพื้นที่"}</div>
              <div className="muted small">แจ้งโดย {inc.reported_by} · {fmtTime(inc.opened_at)} · รอ Admin / Safety Officer ยืนยัน</div>
              <button className="btn btn-block" onClick={cancel} disabled={busy}>{inc.mode === "drill" ? "ยกเลิกคำขอซ้อม" : "แจ้งผิด · ยกเลิกการแจ้ง"}</button>
              {staff && <Link className="btn btn-block" href={`/dashboard?id=${inc.id}`}>แจ้งรหัส (Code 500) บน Dashboard</Link>}
            </div>
            <div className="card stack" style={{ padding: 16, background: "#17191C", color: "#fff", borderColor: "#17191C" }}>
              <div className="row"><ILock size={18} /><b>สำหรับ Admin / Safety Officer</b></div>
              <div className="small" style={{ fontWeight: 600 }}>จุดรวมพลที่ใช้ไม่ได้ (แตะเพื่อปิด)</div>
              <div className="stack" style={{ gap: 6 }}>
                {points.length === 0 && <p className="small" style={{ opacity: .8 }}>ยังไม่มีจุดรวมพลในระบบ ตั้งที่หน้าตั้งค่า</p>}
                {points.map((p) => {
                  const isOff = !!off[p.code];
                  return (
                    <button key={p.code} onClick={() => setOff({ ...off, [p.code]: !isOff })} aria-pressed={isOff}
                      style={{ font: "inherit", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10,
                        border: `1px solid ${isOff ? "#FCA5A5" : "#3F444B"}`, background: isOff ? "#7F1D1D" : "transparent", color: "#fff",
                        cursor: "pointer", minHeight: 48, textAlign: "left" }}>
                      <span className="grow small"><b>{p.name}</b><br />
                        <span style={{ opacity: .8 }}>{isOff ? `${flagsOf(p)} → ไป${p.backup ? pointName(p.backup) : "จุดสำรอง (ยังไม่ได้ตั้ง)"}` : flagsOf(p)}</span></span>
                      <span className="xs" style={{ fontWeight: 700 }}>{isOff ? "ปิด" : "ใช้ได้"}</span>
                    </button>
                  );
                })}
              </div>
              {admin ? (
                <div className="small" style={{ background: "rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px" }}>ยืนยันในนาม <b>{admin.name}</b> ({admin.role === "admin" ? "Admin" : "Safety Officer"})</div>
              ) : (
                <label className="small">PIN ยืนยัน (หรือเข้าสู่ระบบด้วยบัญชี Admin / Safety)
                  <input type="password" inputMode="numeric" placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value)}
                    style={{ display: "block", width: "100%", marginTop: 6, font: "inherit", fontSize: 20, letterSpacing: ".3em", height: 52, borderRadius: 10, border: 0, padding: "0 14px" }} />
                </label>
              )}
              {err && <p className="notice err">{err}</p>}
              <button className="btn btn-red btn-block" onClick={confirm} disabled={busy || (!admin && pin.length < 4)}
                style={{ minHeight: 56, ...(inc.mode === "drill" ? { background: "#A16207", borderColor: "#A16207" } : {}) }}>{busy && inc.mode === "drill" ? "กำลังดึงข้อมูลเข้า-ออกล่าสุด…" : inc.mode === "drill" ? "ยืนยัน เริ่มซ้อมอพยพ" : "ยืนยัน เริ่ม Incident จริง"}</button>
              <button className="btn btn-block" onClick={cancel} disabled={busy}>{inc.mode === "drill" ? "ไม่อนุมัติ · ยกเลิกการซ้อม" : "ไม่ใช่เหตุจริง · ยกเลิก"}</button>
            </div>
          </>
        )}

        {step === "active" && (
          <>
            <div className="card stack" style={{ padding: 20, gap: 8, color: "#fff",
              background: inc.mode === "real" ? "#B91C1C" : "#422006", borderColor: inc.mode === "real" ? "#B91C1C" : "#422006" }}>
              <b style={{ fontSize: 20 }}>{inc.mode === "real" ? "Incident เริ่มแล้ว" : "กำลังซ้อมอพยพ"}</b>
              <div>{inc.mode === "real" ? `${inc.kind} · ${inc.area || "ไม่ระบุพื้นที่"}` : inc.title}</div>
              <div className="small" style={{ opacity: .9 }}>ยืนยันโดย {inc.confirmed_by ?? "—"} · snapshot ชุดธง {inc.plan_name ? `“${inc.plan_name}”` : "ปัจจุบัน"} ณ {fmtTime(inc.confirmed_at ?? inc.opened_at)}</div>
              <div className="small" style={{ fontWeight: 600, background: "rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px" }}>{closedNote}</div>
            </div>
            <Link className="btn btn-dark btn-block" style={{ minHeight: 56, fontSize: 17 }} href="/search">ไปหน้าค้นหาคน</Link>
            <Link className="btn btn-block" href="/dashboard">Dashboard</Link>
            {inc.mode === "drill" && (
              <button className="btn btn-block" style={{ color: "#B91C1C", borderColor: "#FCA5A5" }} onClick={() => setReporting(true)}>เกิดเหตุจริงระหว่างซ้อม · แจ้งเหตุจริง</button>
            )}
          </>
        )}
      </div>
      {showLogin && <LoginSheet onClose={() => setShowLogin(false)} />}
      {reporting && <ReportSheet onClose={() => { setReporting(false); cur.reload(); }} />}
      {drillPrep && <DrillPrep onClose={() => setDrillPrep(false)} onStarted={() => router.push("/dashboard")} />}
    </MobileShell>
  );
}

function Tile({ href, icon, bg, title, sub }: { href: string; icon: React.ReactNode; bg: string; title: string; sub: string }) {
  return (
    <Link className="tile" href={href}>
      <span className="tile-ic" style={{ background: bg }}>{icon}</span>
      <span className="grow"><b>{title}</b><br /><span className="muted small">{sub}</span></span>
    </Link>
  );
}

type Cell = { flag_no: string; n: number; reviewed_by?: string | null; reviewed_at?: string | null; att_at?: string | null; att_by?: string | null;
  att_today?: number; area?: string | null; leader_name?: string | null };

/** ก่อนเริ่มซ้อม: รายงานแต่ละธงอัปเดตล่าสุดเมื่อไร */
function DrillPrep({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const d = usePoll<{ cells: Cell[] }>("/api/review", 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState(`ซ้อมอพยพ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`);
  const cells = d.data?.cells ?? [];
  const cnt = { today: 0, recent: 0, old: 0 };
  for (const c of cells) cnt[freshness(lastTouch(c))]++;
  async function start() {
    setBusy(true); setErr(null);
    try { await api("/api/incidents", { method: "POST", json: { action: "drill", title } }); onStarted(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet" style={{ maxHeight: "92dvh" }}>
        <div className="row"><b className="grow" style={{ fontSize: 17 }}>เตรียมซ้อมอพยพ</b>
          <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} disabled={busy} aria-label="ปิด"><IClose size={16} /></button></div>
        <div className="row xs" style={{ gap: 10 }}>
          <span className="row" style={{ gap: 4 }}><span className="fk f-today" />ตรวจวันนี้ {cnt.today}</span>
          <span className="row" style={{ gap: 4 }}><span className="fk f-recent" />1–2 วันก่อน {cnt.recent}</span>
          <span className="row" style={{ gap: 4 }}><span className="fk" />นานกว่า/ยังไม่ตรวจ {cnt.old}</span>
        </div>
        {d.error && <p className="notice err">{d.error}</p>}
        <div className="freeze" style={{ maxHeight: "48dvh", border: "1px solid var(--line-3)", borderRadius: 10 }}>
          <table className="tbl">
            <thead><tr><th>ธง</th><th>พื้นที่</th><th>คน</th><th>อัปเดตล่าสุด</th></tr></thead>
            <tbody>
              {!d.data && <tr><td colSpan={4} className="muted small">กำลังโหลด…</td></tr>}
              {cells.map((c) => {
                const t = lastTouch(c);
                const f = freshness(t);
                return (
                  <tr key={c.flag_no}>
                    <td><span className={`cell f-${f}`} style={{ display: "inline-flex", width: 40, height: 30, cursor: "default" }}><b>{c.flag_no}</b></span></td>
                    <td className="small">{c.area ?? "—"}{c.leader_name && <div className="muted xs">{c.leader_name}</div>}</td>
                    <td className="mono small">{c.n}{c.att_today ? <div className="muted xs">ระบุวันนี้ {c.att_today}</div> : null}</td>
                    <td className="small">{t ? <>{ago(t)}<div className="muted xs">{fmtDateTime(t)}{c.reviewed_by ? ` · ${c.reviewed_by}` : c.att_by ? ` · ${c.att_by}` : ""}</div></> : <span className="muted">ยังไม่เคยตรวจ</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="lb">ชื่อการซ้อม<input className="in" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></label>
        <p className="muted xs" style={{ margin: 0 }}>กดเริ่มแล้ว ระบบดึงข้อมูลเข้า-ออกล่าสุดมาเทียบกับผลตรวจทานธง (ไม่เกิน ~15 วินาที) แล้วแจ้งเตือนทุกคน</p>
        {err && <p className="notice err">{err}</p>}
        <button className="btn btn-dark btn-lg" onClick={start} disabled={busy || !d.data}>{busy ? "กำลังดึงข้อมูลและเทียบ…" : "เริ่มซ้อม"}</button>
      </div>
    </div>
  );
}
