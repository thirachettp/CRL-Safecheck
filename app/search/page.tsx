"use client";
import { cmpFlag } from "@/lib/flag";
import { matchName, normName } from "@/lib/names";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileShell from "@/components/MobileShell";
import { useUser } from "@/components/identity";
import { api, usePoll, fmtTime, LBL, ORDER, EVAC, inPool, TRI } from "@/components/lib";
import { IFlag, IBuilding, IDown, IUp, IClose, ISearch, ICheck } from "@/components/Icons";

type P = any;
type Data = { incident: any; people: P[]; points: any[]; leaders: any[]; viewer?: "anon" | "user" | "staff" };

export default function SearchPage() {
  const cur = usePoll<{ current: any }>("/api/incidents", 5000);
  const inc = cur.data?.current;
  if (cur.data && (!inc || inc.state !== "active")) {
    return (
      <MobileShell>
        <div className="m-body" style={{ padding: 16 }}>
          <div className="card stack" style={{ padding: 18 }}>
            <b style={{ fontSize: 17 }}>ตอนนี้ไม่มีเหตุการณ์หรือการซ้อม</b>
            <p className="muted small">{inc?.state === "pending" ? "มีการแจ้งเหตุที่รอยืนยัน หน้านี้จะเปิดใช้เมื่อ Admin / Safety Officer ยืนยันแล้ว" : "หน้าค้นหาคนจะเปิดใช้เมื่อเริ่มซ้อมหรือยืนยันเหตุจริง"}</p>
            <Link className="btn btn-dark" href="/?stay=1">กลับหน้าแรก</Link>
          </div>
        </div>
      </MobileShell>
    );
  }
  if (!inc) return <MobileShell><p className="muted" style={{ padding: 16 }}>กำลังโหลด…</p></MobileShell>;
  return <SearchIncident id={inc.id} />;
}

function SearchIncident({ id }: { id: number }) {
  const { by } = useUser();
  const who = by || "ไม่ระบุชื่อ";
  const d = usePoll<Data>(`/api/incidents/${id}`, 3000);
  const [q, setQ] = useState("");
  const [f, setF] = useState<string>("all");
  // มาจาก Heatmap ใน Dashboard: /search?g=<ธง หรือ Cost Center>
  useEffect(() => {
    try { const g = new URLSearchParams(window.location.search).get("g"); if (g) setF(g); } catch {}
  }, []);
  const [sf, setSf] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [roll, setRoll] = useState(false);
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const [inj, setInj] = useState<Record<string, boolean>>({});
  const [cnt, setCnt] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inc = d.data?.incident;
  const realMode = inc?.mode === "real";
  const [byCC, setByCC] = useState(false); // ตอนซ้อม: สลับกรองตามธง ↔ Cost Center
  const real = realMode || byCC; // จัดกลุ่มตาม Cost Center
  const anon = d.data?.viewer === "anon";
  const hidden = <span className="muted">เข้าสู่ระบบเพื่อดู</span>;
  const people: P[] = useMemo(
    () => (d.data?.people ?? []).map((p) => (local[p.person_key] ? { ...p, status: local[p.person_key] } : p)),
    [d.data, local]);
  const points = d.data?.points ?? [];
  const closed = new Set<string>(inc?.closed_points ?? []);
  const grp = (p: P) => (real ? p.cost_center ?? "ไม่ระบุ" : p.flag_no == null ? "none" : String(p.flag_no));
  const pName = (c: string) => points.find((x: any) => x.code === c)?.name ?? `จุดรวมพล ${c}`;
  const pointLabel = (p: P) => {
    if (!p.assembly_point) return "—";
    if (!closed.has(p.assembly_point)) return pName(p.assembly_point);
    const bk = points.find((x: any) => x.code === p.assembly_point)?.backup;
    return `${bk ? pName(bk) : "จุดสำรอง"} (สำรอง · ${pName(p.assembly_point)} ปิด)`;
  };

  async function mark(p: P, v: string) {
    const next = p.status === v ? (p.here ? "unk" : "abs") : v;
    setLocal((x) => ({ ...x, [p.person_key]: next }));
    setErr(null);
    try {
      await api(`/api/incidents/${id}/people`, { method: "PATCH", json: { person_key: p.person_key, status: next, by: who } });
      d.reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLocal((x) => { const y = { ...x }; delete y[p.person_key]; return y; });
    }
  }

  // ---------- ค้นหา / กรอง ----------
  const qq = q.trim().toLowerCase();
  const bypass = qq.length > 0;
  const enHit = new Set<string>();
  const list = people.filter((p) => {
    if (bypass) {
      // ชื่อ: ไม่สนคำนำหน้า ตัวเล็กใหญ่ ช่องว่าง และลำดับคำ ค้นได้ทั้งไทยและอังกฤษ
      const nm = normName(q) ? matchName(q, [p.name, p.name_en]) : -1;
      if (nm >= 0) { if (nm === 1) enHit.add(p.person_key); return true; }
      const hay = [p.name, p.emp_id, p.plate, p.email, p.tel, (p.tel ?? "").replace(/-/g, ""), p.cost_center, p.cc_name, p.area]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(qq) || hay.replace(/[\s-]/g, "").includes(qq.replace(/[\s-]/g, ""));
    }
    if (f !== "all" && grp(p) !== f) return false;
    if (sf === "abs") return !p.here;
    if (sf !== "all" && (p.status === "cmd" ? "safe" : p.status) !== sf) return false;
    return true;
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || cmpFlag(a.flag_no, b.flag_no));
  const LIMIT = 80;

  const n: Record<string, number> = { unk: 0, in: 0, safe: 0, inj: 0 };
  let pool = 0, absPend = 0, absGone = 0;
  for (const p of people) {
    if (p.status === "abs") absPend++;
    else if (p.status === "gone") absGone++;
    else { n[p.status === "cmd" ? "safe" : p.status]++; pool++; }
  }
  const SUMS = [["unk", "ยังไม่ทราบ", "#17191C"], ["in", "ในคลัง", "#9A3412"], ["safe", "ปลอดภัย", "#14532D"], ["inj", "บาดเจ็บ", "#881337"]];

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; mem: number; done: number }>();
    for (const p of people) {
      const g = grp(p);
      const x = m.get(g) ?? { id: g, name: real ? p.cc_name ?? "" : "", mem: 0, done: 0 };
      if (inPool(p.status)) { x.mem++; if (EVAC.includes(p.status)) x.done++; }
      m.set(g, x);
    }
    return [...m.values()].sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : real ? a.id.localeCompare(b.id) : cmpFlag(a.id, b.id)));
  }, [people, real]);

  // ---------- เช็คชื่อทั้งธง ----------
  const flagMem = !real && f !== "all" ? people.filter((p) => grp(p) === f) : [];
  const rollItem = (p: P) => {
    const checked = (tick[p.person_key] ?? p.here) || !!inj[p.person_key];
    return { ...p, checked, injOn: !!inj[p.person_key] };
  };
  const rollRows = flagMem.filter((p) => p.status === "unk").map(rollItem);
  const rollAbs = flagMem.filter((p) => p.status === "abs").map(rollItem);
  const allRoll = [...rollRows, ...rollAbs];
  const ticked = allRoll.filter((m) => m.checked);
  const doneList = flagMem.filter((p) => p.status === "safe" || p.status === "inj");
  const atPoint = ticked.length + doneList.length;
  const cntN = parseInt(cnt, 10), hasCnt = !isNaN(cntN);
  const diff = hasCnt ? cntN - atPoint : 0;
  const cmp = !hasCnt ? { bg: "#F3F2EE", fg: "#4B5058", text: "พิมพ์จำนวนที่นับได้ ระบบจะเทียบกับรายชื่อที่ติ๊ก" }
    : diff === 0 ? { bg: "#DCFCE7", fg: "#14532D", text: `ตรงกัน นับได้ ${cntN} = ที่จุดรวมพลตามรายชื่อ ${atPoint} คน` }
    : diff < 0 ? { bg: "#FFEDD5", fg: "#9A3412", text: `นับได้น้อยกว่ารายชื่อ ${-diff} คน แตะเอาติ๊กออกคนที่ไม่เห็น` }
    : { bg: "#FFEDD5", fg: "#9A3412", text: `นับได้มากกว่ารายชื่อ ${diff} คน ติ๊กเพิ่ม (ดูกลุ่มปลอดภัยตามระบบ) หรือเพิ่มคนนอกรายชื่อ` };
  const pendInFlag = flagMem.filter((p) => p.status === "unk" || p.status === "abs").length;
  const canRoll = !real && f !== "all" && f !== "none" && pendInFlag > 0 && !bypass;
  const cntG = (arr: P[], g: string) => arr.filter((p) => p.gender === g).length;

  async function confirmRoll() {
    setErr(null);
    try {
      await api(`/api/incidents/${id}/roll`, { method: "POST", json: {
        flag: f, count: cntN, by: who,
        safe: ticked.filter((m) => !m.injOn).map((m) => m.person_key), inj: ticked.filter((m) => m.injOn).map((m) => m.person_key) } });
      setRoll(false);
      d.reload();
    } catch (e: any) { setErr(e.message); }
  }

  if (!d.data) return <MobileShell><p className="muted" style={{ padding: 16 }}>{d.error ?? "กำลังโหลด…"}</p></MobileShell>;

  const closedNames = [...closed].map(pName);
  const ui = realMode
    ? { bg: "#B91C1C", fg: "#FFF", badgeBg: "#FFF", badgeFg: "#B91C1C", badge: "จริง", title: `INCIDENT · ${inc.kind ?? ""} ${inc.area ?? ""}`,
        sub: `ยืนยันโดย ${inc.confirmed_by ?? "—"} · ${closedNames.length ? `ปิด ${closedNames.join(", ")} ใช้จุดสำรอง` : "ใช้จุดรวมพลตามปกติ"}` }
    : { bg: "#FCD34D", fg: "#422006", badgeBg: "#422006", badgeFg: "#FCD34D", badge: "ซ้อม", title: `${inc.title ?? "ซ้อมอพยพ"}${inc.plan_version ? ` · ชุดธง v${inc.plan_version}${inc.plan_name ? ` ${inc.plan_name}` : ""}` : ""}`,
        sub: `เริ่มโดย ${inc.confirmed_by ?? "—"} · ${fmtTime(inc.opened_at)} · คุณ: ${by || "ไม่ระบุชื่อ"}` };
  const groupLabel = f === "all" ? (real ? "ทุก Cost Center" : "ทุกธง") : real ? `CC ${f}` : f === "none" ? "ไม่ระบุธง" : `ธง ${f}`;

  return (
    <MobileShell>
      <div style={{ background: ui.bg, color: ui.fg, padding: "12px 16px 10px", position: "sticky", top: 0, zIndex: 6 }}>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: ui.badgeBg, color: ui.badgeFg }}>{ui.badge}</span>
          <b className="grow" style={{ fontSize: 15 }}>{ui.title}</b>
          {realMode ? <Link href="/dashboard" style={{ color: "inherit", fontSize: 13, fontWeight: 600 }}>สรุปผล</Link>
            : <Link href="/?stay=1" style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C", background: "#fff", border: "1px solid #B91C1C", borderRadius: 8, padding: "6px 8px", textDecoration: "none" }}>แจ้งเหตุจริง</Link>}
        </div>
        <div className="xs" style={{ opacity: .9, marginTop: 4 }}>{ui.sub}</div>
      </div>

      {!roll && (
        <>
          <div style={{ padding: "10px 16px", background: "#fff", borderBottom: "1px solid var(--line)" }}>
            <label className="row" style={{ border: "2px solid var(--ink)", borderRadius: 12, padding: "0 14px", height: 50, background: "#fff", flexWrap: "nowrap" }}>
              <ISearch />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ, รหัส, Cost Center, เบอร์โทร" aria-label="ค้นหาคน"
                style={{ border: 0, outline: 0, font: "inherit", fontSize: 16, flexGrow: 1, background: "transparent", minWidth: 0 }} />
            </label>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "nowrap" }}>
              <button className="fbtn" onClick={() => setPicker(true)}>{real ? <IBuilding size={16} /> : <IFlag size={16} />}{groupLabel}<IDown size={14} /></button>
              {canRoll ? (
                <button className="btn btn-go grow" style={{ minHeight: 40 }} onClick={() => { setRoll(true); setTick({}); setInj({}); setCnt(""); }}>เช็คชื่อทั้งธง {f}</button>
              ) : (
                <span className="muted xs grow" style={{ textAlign: "right" }}>{realMode ? "ระบุรายคนเท่านั้น" : byCC ? "กรองตาม Cost Center · เช็คชื่อทั้งธงให้เลือกธง" : f === "all" ? "เลือกธงเพื่อเช็คชื่อทั้งธง" : "ธงนี้ครบแล้ว"}</span>
              )}
            </div>
            {bypass && <div className="xs" style={{ marginTop: 8, background: "#EEF2F7", color: "#1F3A5F", borderRadius: 8, padding: "6px 10px", fontWeight: 600 }}>กำลังค้นหาทุกกลุ่มและทุกสถานะ (ข้าม filter)</div>}
          </div>

          <div className="m-body">
            {err && <p className="notice err">{err}</p>}
            {list.length > 0 && <div className="muted xs" style={{ margin: "0 4px" }}>กด “ปลอดภัย” ได้ทันที · แตะชื่อเพื่อเลือกสถานะอื่น / ดูเบอร์โทร</div>}
            {list.slice(0, LIMIT).map((p) => {
              const v = p.status, isOpen = open === p.person_key, fromAbs = !p.here;
              const dim = v === "abs" || v === "gone";
              const t = TRI.find((x) => x.id === p.triage);
              return (
                <div key={p.person_key} className={`prow${dim ? " dim" : ""}${isOpen ? " open" : ""}`}>
                  <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <button className="head-btn grow" style={{ minWidth: 0 }} onClick={() => setOpen(isOpen ? null : p.person_key)} aria-expanded={isOpen}
                      aria-label={`${p.name} ${LBL[v]} แตะเพื่อดูรายละเอียดและสถานะอื่น`}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <b className="ellip" style={{ fontSize: 15 }}>{p.name}</b>
                          {p.gender && <span className="g">{p.gender}</span>}
                          {p.plate && <span className="g">{p.plate}</span>}
                        </div>
                        {enHit.has(p.person_key) && <div className="xs ellip" style={{ color: "var(--navy)", fontWeight: 600 }} lang="en">{p.name_en}</div>}
                        <div className="muted xs ellip" style={{ marginTop: 1 }}>
                          {realMode ? `${p.cost_center ?? "—"} · ${p.cc_name ?? p.area ?? ""}` : `ธง ${p.flag_no ?? "?"} · ${[p.cost_center, p.area ?? p.cc_name].filter(Boolean).join(" ")}`}
                          {fromAbs && <span className="tag-abs" style={{ marginLeft: 6 }}>เดิม: ปลอดภัยตามระบบ</span>}
                        </div>
                      </div>
                      {v !== "safe" && <span className={`chip sm s-${v}`}>{LBL[v]}</span>}
                    </button>
                    <button className={`qsafe${v === "safe" ? " on" : ""}`} onClick={() => mark(p, "safe")}
                      aria-pressed={v === "safe"} aria-label={v === "safe" ? `ยกเลิกปลอดภัย ${p.name}` : `ปลอดภัย ${p.name}`}>
                      {v === "safe" ? <><ICheck size={16} /> ปลอดภัย</> : "ปลอดภัย"}
                    </button>
                  </div>
                  {v === "inj" && <span className="injnote">{t ? `Safety ระบุแล้ว · ${t.label}${p.symptoms ? ` · ${p.symptoms}` : ""}` : "รอ Safety ระบุระดับ · อาการ · รพ."}</span>}
                  {v === "in" && p.status_note && <span className="injnote" style={{ color: "#9A3412", background: "#FFF7ED" }}>{p.status_note}</span>}
                  {isOpen && (
                    <>
                      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "nowrap" }}>
                        {fromAbs && <button className={`sb sm${v === "gone" ? " gone-on" : ""}`} onClick={() => mark(p, "gone")}>ไม่อยู่จริง</button>}
                        <button className={`sb sm${v === "in" ? " in-on" : ""}`} onClick={() => mark(p, "in")}>ยังอยู่ในคลัง</button>
                        <button className={`sb sm${v === "inj" ? " inj-on" : ""}`} onClick={() => mark(p, "inj")}>บาดเจ็บ</button>
                      </div>
                      <button className={`cmdbtn${v === "cmd" ? " on" : ""}`} onClick={() => mark(p, "cmd")}>
                        {v === "cmd" ? "อยู่กองอำนวยการกลาง (แตะเพื่อยกเลิก)" : "ประจำกองอำนวยการกลาง (นับเป็นอพยพแล้ว)"}
                      </button>
                      <div className="kv">
                        <span className="muted">รหัส</span><span className="mono">{p.emp_id ?? p.plate ?? p.email ?? "—"}</span>
                        {p.name_en && p.name_en !== p.name && <><span className="muted">ชื่ออังกฤษ</span><span lang="en">{p.name_en}</span></>}
                        <span className="muted">เบอร์โทร</span>{anon ? hidden : p.tel ? <a href={`tel:${p.tel.replace(/[^\d+]/g, "")}`} style={{ fontWeight: 600 }}>{p.tel}</a> : <span>—</span>}
                        <span className="muted">ธง</span><span>{p.flag_no != null ? `ธง ${p.flag_no}` : "ไม่ระบุธง"}</span>
                        <span className="muted">จุดรวมพล</span><span>{pointLabel(p)}</span>
                        <span className="muted">ที่มาข้อมูล</span><span>{p.source ?? "—"}{!p.still_in_source && p.presence !== "manual" ? " · หายจากแหล่งข้อมูลล่าสุด" : ""}</span>
                        <span className="muted">ผู้ติดต่อฉุกเฉิน</span>{anon ? hidden : <span>{p.emer ?? "ยังไม่ลงทะเบียน"}</span>}
                        <span className="muted">ระบุล่าสุดโดย</span><span>{p.status_by ? `${p.status_by} · ${fmtTime(p.status_at)}` : "–"}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {list.length > LIMIT && <div className="muted xs" style={{ textAlign: "center", padding: 8 }}>แสดง {LIMIT} จาก {list.length} คน · พิมพ์ค้นหาหรือเลือกกลุ่มเพื่อแคบลง</div>}
            {list.length === 0 && <p className="muted small" style={{ textAlign: "center", padding: 16 }}>{bypass ? "ไม่พบชื่อนี้ในเหตุการณ์" : "ไม่มีรายชื่อในตัวกรองนี้"}</p>}
            <button className="btn" onClick={() => setAdding(true)}>+ เพิ่มคนนอกรายชื่อ</button>
          </div>

          <div className="m-foot" style={{ padding: "8px 10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4 }}>
              {SUMS.map(([k, label, color]) => (
                <button key={k} className={`sum${sf === k ? " on" : ""}`} aria-pressed={sf === k} onClick={() => setSf(sf === k ? "all" : k)}>
                  <div className="mono" style={{ fontSize: 19, fontWeight: 600, color }}>{n[k]}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                  <div className="mono muted" style={{ fontSize: 11 }}>{pool ? Math.round((n[k] / pool) * 100) : 0}%</div>
                </button>
              ))}
            </div>
            <button className={`absbar${sf === "abs" ? " on" : ""}`} aria-pressed={sf === "abs"} onClick={() => setSf(sf === "abs" ? "all" : "abs")}>
              <span className="grow" style={{ textAlign: "left" }}>ปลอดภัยตามระบบ · <b style={{ color: "var(--ink)" }}>รอยืนยัน {absPend}</b> · ยืนยันไม่อยู่แล้ว {absGone}</span>
              <span className="muted">ไม่นับใน %</span>
            </button>
          </div>
        </>
      )}

      {roll && (
        <>
          <div className="stack" style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid var(--line)", gap: 10 }}>
            <div>
              <b style={{ fontSize: 16 }}>เช็คชื่อธง {f}{flagMem[0] ? ` · ${pointLabel(flagMem[0])}` : ""}</b>
              <div className="muted xs" style={{ marginTop: 2 }}>
                ในระบบ: มาวันนี้ {flagMem.filter((p) => p.here).length} คน (ชาย {cntG(flagMem.filter((p) => p.here), "ชาย")} / หญิง {cntG(flagMem.filter((p) => p.here), "หญิง")}) · ปลอดภัยตามระบบ {flagMem.filter((p) => !p.here).length}
              </div>
            </div>
            <div className="row" style={{ flexWrap: "nowrap", gap: 12 }}>
              <label className="grow" style={{ fontSize: 13, fontWeight: 700 }}>นับที่จุดรวมพลได้กี่คน?
                <div className="muted xs" style={{ fontWeight: 400 }}>รวมคนที่ระบุไปแล้ว {doneList.length} คน</div></label>
              <input className="cnt" type="number" inputMode="numeric" min={0} value={cnt} onChange={(e) => setCnt(e.target.value)} aria-label="จำนวนที่นับได้" />
            </div>
            <div className="small" style={{ fontWeight: 600, padding: "8px 10px", borderRadius: 8, background: cmp.bg, color: cmp.fg }}>{cmp.text}</div>
          </div>
          <div className="m-body" style={{ gap: 6 }}>
            {err && <p className="notice err">{err}</p>}
            <b className="muted xs" style={{ margin: "0 4px" }}>มาวันนี้ · ติ๊กไว้ให้แล้ว แตะเอาออกคนที่ไม่เห็น</b>
            {rollRows.map((m) => <RollRow key={m.person_key} m={m} setTick={setTick} setInj={setInj} />)}
            {rollAbs.length > 0 && (
              <>
                <b className="muted xs" style={{ margin: "8px 4px 0" }}>ปลอดภัยตามระบบ · ไม่ได้ติ๊ก ติ๊กถ้าเห็นตัวที่จุดรวมพล</b>
                {rollAbs.map((m) => <RollRow key={m.person_key} m={m} dashed setTick={setTick} setInj={setInj} />)}
              </>
            )}
            {doneList.length > 0 && (
              <>
                <b className="muted xs" style={{ margin: "8px 4px 0" }}>ระบุสถานะแล้ว ({doneList.length})</b>
                {doneList.map((p) => (
                  <div key={p.person_key} className="row" style={{ background: "var(--subtle)", border: "1px dashed var(--line-2)", borderRadius: 12, padding: "8px 12px", flexWrap: "nowrap" }}>
                    <span className="grow small">{p.name}</span><span className={`chip sm s-${p.status}`}>{LBL[p.status]}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="m-foot stack" style={{ gap: 8 }}>
            <div className="muted xs" style={{ textAlign: "center" }}>
              ติ๊กอยู่ {ticked.length} คน (ชาย {cntG(ticked, "ชาย")} / หญิง {cntG(ticked, "หญิง")}) · บาดเจ็บ {allRoll.filter((m) => m.injOn).length} · ไม่ติ๊ก = คงสถานะเดิม
            </div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button className="btn" style={{ flex: "1 1 0", minHeight: 50 }} onClick={() => setRoll(false)}>ยกเลิก</button>
              <button className="btn btn-go" style={{ flex: "2 1 0", minHeight: 50 }} disabled={!(hasCnt && diff === 0) || ticked.length === 0} onClick={confirmRoll}>ยืนยัน {ticked.length} คน</button>
            </div>
          </div>
        </>
      )}

      {picker && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setPicker(false)}>
          <div className="sheet">
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <b className="grow" style={{ fontSize: 17 }}>{real ? "เลือก Cost Center" : "เลือกธง"}</b>
              {!realMode && (
                <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <button className={`pill${!byCC ? " on" : ""}`} onClick={() => { setByCC(false); setF("all"); }}>ธง</button>
                  <button className={`pill${byCC ? " on" : ""}`} onClick={() => { setByCC(true); setF("all"); }}>Cost Center</button>
                </span>
              )}
              <button className="fbtn" style={{ borderColor: "var(--line-2)" }} onClick={() => { setF("all"); setPicker(false); }}>ทั้งหมด</button>
              <button className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={() => setPicker(false)} aria-label="ปิด"><IClose size={16} /></button>
            </div>
            <div className="muted xs row" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#86EFAC" }} />ครบแล้ว</span>
              <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#FCA5A5" }} />ไม่ครบ (ไม่ทราบ / ในคลัง)</span>
            </div>
            <div className={real ? "cells2" : "cells5"}>
              {groups.map((g) => (
                <button key={g.id} className={`cell${real ? " ccell" : ""}${g.done === g.mem ? " done" : " bad"}${f === g.id ? " on" : ""}`}
                  onClick={() => { setF(g.id); setPicker(false); }}>
                  {real ? (
                    <>
                      <span className="row" style={{ width: "100%", gap: 6, flexWrap: "nowrap" }}><b className="mono grow" style={{ fontSize: 14 }}>{g.id}</b><span className="mono" style={{ fontSize: 11 }}>{g.done}/{g.mem}</span></span>
                      <span className="xs">{g.name}</span>
                    </>
                  ) : (
                    <><b style={{ fontSize: 16 }}>{g.id === "none" ? "?" : g.id}</b><span className="mono" style={{ fontSize: 11 }}>{g.done}/{g.mem}</span></>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {adding && (
        <AddOutside defaultFlag={!real && f !== "all" && f !== "none" ? f : ""} onClose={() => setAdding(false)}
          onSave={async (x) => { await api(`/api/incidents/${id}/people`, { method: "POST", json: { ...x, by: who } }); setAdding(false); d.reload(); }} />
      )}
    </MobileShell>
  );
}

function RollRow({ m, dashed, setTick, setInj }: { m: any; dashed?: boolean; setTick: any; setInj: any }) {
  return (
    <div className="row" style={{ background: "#fff", border: `1px ${dashed ? "dashed #9CA3AF" : "solid var(--line)"}`, borderRadius: 12, padding: "8px 10px", flexWrap: "nowrap" }}>
      <button className={`ck${m.checked ? " on" : ""}`} aria-pressed={m.checked} aria-label={`${m.checked ? "เอาติ๊กออก" : "ติ๊ก"} ${m.name}`}
        onClick={() => {
          setTick((t: any) => ({ ...t, [m.person_key]: !m.checked }));
          setInj((j: any) => { const y = { ...j }; delete y[m.person_key]; return y; });
        }}><ICheck size={22} /></button>
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name} {m.gender && <span className="g">{m.gender}</span>}</div>
        <div className="muted xs"><span className="mono">{m.cost_center ?? ""}</span> {m.area ?? ""}</div>
      </div>
      <button className={`ij${m.injOn ? " on" : ""}`} onClick={() => {
        setInj((j: any) => { const y = { ...j }; if (m.injOn) delete y[m.person_key]; else y[m.person_key] = true; return y; });
        setTick((t: any) => ({ ...t, [m.person_key]: true }));
      }}>บาดเจ็บ</button>
    </div>
  );
}

function AddOutside({ defaultFlag, onClose, onSave }: { defaultFlag: string; onClose: () => void; onSave: (x: any) => Promise<void> }) {
  const [x, setX] = useState({ name: "", gender: "", flag_no: defaultFlag, note: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={async (e) => { e.preventDefault(); try { await onSave(x); } catch (z: any) { setErr(z.message); } }}>
        <div className="row"><b className="grow" style={{ fontSize: 17 }}>เพิ่มคนนอกรายชื่อ</b>
          <button type="button" className="fbtn" style={{ borderColor: "var(--line-2)", width: 44, justifyContent: "center", padding: 0 }} onClick={onClose} aria-label="ปิด"><IClose size={16} /></button></div>
        <p className="muted xs">คนที่อยู่ในพื้นที่จริงแต่ไม่มีในข้อมูลใดเลย เช่น ผู้รับเหมา ผู้มาติดต่อ</p>
        <label className="lb">ชื่อ-สกุล<input className="in" required value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="lb">เพศ<select className="in" value={x.gender} onChange={(e) => setX({ ...x, gender: e.target.value })}><option value="">ไม่ระบุ</option><option>ชาย</option><option>หญิง</option></select></label>
          <label className="lb">ธง<input className="in mono" value={x.flag_no} onChange={(e) => setX({ ...x, flag_no: e.target.value })} /></label>
        </div>
        <label className="lb">บริษัท / หมายเหตุ<input className="in" value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} /></label>
        {err && <p className="notice err">{err}</p>}
        <button className="btn btn-pri btn-lg" type="submit">เพิ่มเข้ารายชื่อ</button>
      </form>
    </div>
  );
}
