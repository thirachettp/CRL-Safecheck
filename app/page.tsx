"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MobileShell from "@/components/MobileShell";
import LoginSheet from "@/components/LoginSheet";
import { useUser, useAdmin } from "@/components/identity";
import { api, usePoll, fmtTime, initials, KINDS, rangeText } from "@/components/lib";
import { IFlag, ISearch, IChart, IPlus, IUser, IAlert, ILock } from "@/components/Icons";

type Point = { code: string; name: string; backup: string | null; flags: number[] | null };

export default function HomePage() {
  return <Suspense><Home /></Suspense>;
}

function Home() {
  const router = useRouter();
  const stay = useSearchParams().get("stay") === "1";
  const { user } = useUser();
  const { unlock } = useAdmin();
  const cur = usePoll<{ current: any }>("/api/incidents", 4000);
  const plan = usePoll<{ flags: any[]; points: Point[] }>("/api/plan", 0);
  const [showLogin, setShowLogin] = useState(false);
  const [kind, setKind] = useState(KINDS[0].id);
  const [area, setArea] = useState("");
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inc = cur.data?.current ?? null;
  const step = !inc ? "idle" : inc.state === "pending" ? "pending" : "active";
  const areas = useMemo(
    () => [...new Set((plan.data?.flags ?? []).map((f) => f.area).filter(Boolean))].sort() as string[],
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
      await api("/api/incidents", { method: "POST", json: { action: "report", kind, area: area || areas[0] || "", by: user.name } });
      cur.reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr(null);
    try {
      await unlock(pin);
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
            <div className="card stack" style={{ padding: 16, borderColor: "#FCA5A5" }}>
              <b style={{ fontSize: 17 }}>แจ้งเหตุฉุกเฉิน</b>
              <p className="muted small">Admin / Safety Officer จะยืนยันก่อนเริ่ม Incident</p>
              <div className="row" style={{ gap: 8 }}>
                {KINDS.map((k) => (
                  <button key={k.id} className={`pill${kind === k.id ? " on" : ""}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}>{k.label}</button>
                ))}
              </div>
              <label className="lb" style={{ fontSize: 13 }}>พื้นที่เกิดเหตุ
                <select className="in" value={area} onChange={(e) => setArea(e.target.value)} style={{ height: 46 }}>
                  {areas.length === 0 && <option value="">ยังไม่มีข้อมูลพื้นที่</option>}
                  {areas.map((a) => <option key={a}>{a}</option>)}
                  <option>อื่นๆ</option>
                </select>
              </label>
              <button className="btn btn-red btn-block" style={{ minHeight: 56, fontSize: 17 }} onClick={report} disabled={!user || busy}>
                <IAlert />แจ้งเหตุ
              </button>
              {!user && (
                <div className="small" style={{ color: "#881337", fontWeight: 600, textAlign: "center" }}>
                  ต้องเข้าสู่ระบบก่อนแจ้งเหตุ{" "}
                  <button className="lk" style={{ textDecoration: "underline", padding: 0, minHeight: 32 }} onClick={() => setShowLogin(true)}>เข้าสู่ระบบ</button>
                </div>
              )}
              {err && <p className="notice err">{err}</p>}
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <Tile href="/review" icon={<IFlag color="#1F3A5F" />} bg="#EEF2F7" title="ตรวจทานธง" sub="ไม่ต้อง login · เพิ่ม ลด แก้ไขคนในธง" />
              <Tile href="/search" icon={<ISearch />} bg="#F3F2EE" title="ค้นหาคน" sub="ระหว่างซ้อม แอพจะเปิดหน้านี้ทันที" />
              <Tile href="/dashboard" icon={<IChart />} bg="#F3F2EE" title="Dashboard" sub="ติดตามสถานการณ์" />
              <Tile href="/injury" icon={<IPlus color="#881337" />} bg="#FFE4E6" title="ผู้บาดเจ็บ (Safety)" sub="ระบุระดับสี · อาการ · รพ. · ต้องใส่รหัส" />
            </div>
          </>
        )}

        {step === "pending" && (
          <>
            <div className="card stack" style={{ padding: 16, border: "2px solid #B91C1C", gap: 8 }}>
              <b style={{ fontSize: 17, color: "#B91C1C" }}>แจ้งเหตุแล้ว · รอยืนยัน</b>
              <div>{inc.kind} · {inc.area || "ไม่ระบุพื้นที่"}</div>
              <div className="muted small">แจ้งโดย {inc.reported_by} · {fmtTime(inc.opened_at)} · รอ Admin / Safety Officer ยืนยัน</div>
              <button className="btn btn-block" onClick={cancel} disabled={busy}>แจ้งผิด · ยกเลิกการแจ้ง</button>
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
              <label className="small">รหัสยืนยัน
                <input type="password" inputMode="numeric" placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, font: "inherit", fontSize: 20, letterSpacing: ".3em", height: 52, borderRadius: 10, border: 0, padding: "0 14px" }} />
              </label>
              {err && <p className="notice err">{err}</p>}
              <button className="btn btn-red btn-block" style={{ minHeight: 56 }} onClick={confirm} disabled={busy || pin.length < 4}>ยืนยัน เริ่ม Incident จริง</button>
              <button className="btn btn-block" onClick={cancel} disabled={busy}>ไม่ใช่เหตุจริง · ยกเลิก</button>
            </div>
          </>
        )}

        {step === "active" && (
          <>
            <div className="card stack" style={{ padding: 20, gap: 8, color: "#fff",
              background: inc.mode === "real" ? "#B91C1C" : "#422006", borderColor: inc.mode === "real" ? "#B91C1C" : "#422006" }}>
              <b style={{ fontSize: 20 }}>{inc.mode === "real" ? "Incident เริ่มแล้ว" : "กำลังซ้อมอพยพ"}</b>
              <div>{inc.mode === "real" ? `${inc.kind} · ${inc.area || "ไม่ระบุพื้นที่"}` : inc.title}</div>
              <div className="small" style={{ opacity: .9 }}>ยืนยันโดย {inc.confirmed_by ?? "—"} · snapshot ชุดธง {inc.plan_version ? `v${inc.plan_version}` : "ปัจจุบัน"} ณ {fmtTime(inc.confirmed_at ?? inc.opened_at)}</div>
              <div className="small" style={{ fontWeight: 600, background: "rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px" }}>{closedNote}</div>
            </div>
            <Link className="btn btn-dark btn-block" style={{ minHeight: 56, fontSize: 17 }} href="/search">ไปหน้าค้นหาคน</Link>
            <Link className="btn btn-block" href="/dashboard">Dashboard</Link>
            {inc.mode === "drill" && (
              <p className="muted small">ถ้าเกิดเหตุจริงระหว่างซ้อม ให้ Admin จบการซ้อมก่อน แล้วแจ้งเหตุใหม่</p>
            )}
          </>
        )}
      </div>
      {showLogin && <LoginSheet onClose={() => setShowLogin(false)} />}
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
