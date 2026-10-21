"use client";
// แจ้งเตือนบนเครื่อง (Web Push): สมัครรับ · ทดสอบ · ลงทะเบียน service worker
import { useCallback, useEffect, useState } from "react";
import { api } from "./lib";

const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

export function usePush() {
  const [state, setState] = useState<State>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState(ios && !standalone ? "ios-install" : "unsupported"); return;
    }
    if (Notification.permission === "denied") { setState("denied"); return; }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    setEndpoint(sub?.endpoint ?? null);
    setState(sub ? "on" : "off");
  }, []);
  useEffect(() => { refresh().catch(() => setState("unsupported")); }, [refresh]);

  const enable = useCallback(async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); throw new Error("ยังไม่ได้อนุญาตการแจ้งเตือน"); }
    const { publicKey } = await api<{ publicKey: string }>("/api/push");
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
    await api("/api/push", { method: "POST", json: { action: "subscribe", subscription: sub.toJSON() } });
    setEndpoint(sub.endpoint); setState("on");
    return sub.endpoint;
  }, []);
  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api("/api/push", { method: "POST", json: { action: "unsubscribe", endpoint: sub.endpoint } }); await sub.unsubscribe(); }
    setEndpoint(null); setState("off");
  }, []);
  const test = useCallback(async () => {
    const ep = endpoint ?? (await enable());
    return api<{ sent: number; failed: number }>("/api/push", { method: "POST", json: { action: "test", endpoint: ep } });
  }, [endpoint, enable]);
  return { state, enable, disable, test, refresh };
}

/** การ์ดเปิดการแจ้งเตือน + ทดสอบ (หน้าแรก / โปรไฟล์) */
export function NotifyCard({ compact }: { compact?: boolean }) {
  const { state, enable, disable, test } = usePush();
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, okText?: (r: any) => string) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); if (okText) setMsg({ k: "ok", t: okText(r) }); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); } finally { setBusy(false); }
  };
  if (state === "loading") return null;
  if (compact && state === "on") return null; // หน้าแรก: ซ่อนเมื่อเปิดแล้ว
  return (
    <div className="card stack" style={{ padding: 14, gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <b className="grow">การแจ้งเตือนบนเครื่องนี้</b>
        <span className={`chip sm ${state === "on" ? "ok" : state === "denied" ? "err" : "grey"}`}>
          {state === "on" ? "เปิดอยู่" : state === "denied" ? "ถูกบล็อก" : state === "off" ? "ปิดอยู่" : "ใช้ไม่ได้"}</span>
      </div>
      <p className="muted xs" style={{ margin: 0 }}>
        {state === "ios-install" ? "iPhone/iPad: กดปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดแอปจากไอคอน จึงจะรับแจ้งเตือนได้"
          : state === "unsupported" ? "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน ลองใช้ Chrome / Edge หรือเพิ่มแอปไปที่หน้าจอโฮม"
          : state === "denied" ? "การแจ้งเตือนถูกบล็อก ไปที่การตั้งค่าเว็บไซต์ของเบราว์เซอร์ แล้วอนุญาตการแจ้งเตือน"
          : "รับแจ้งเตือนเมื่อเริ่มซ้อม/เกิดเหตุจริง (Admin / Safety ได้รับแจ้งเมื่อมีคนแจ้งเหตุด้วย)"}
      </p>
      {(state === "off" || state === "on") && (
        <div className="row" style={{ gap: 8 }}>
          {state === "off" && <button className="btn btn-pri btn-sm" disabled={busy} onClick={() => run(enable, () => "เปิดการแจ้งเตือนแล้ว")}>เปิดการแจ้งเตือน</button>}
          <button className="btn btn-sm" disabled={busy} onClick={() => run(test, (r) => r.sent ? "ส่งแจ้งเตือนทดสอบแล้ว ควรเด้งภายในไม่กี่วินาที" : "ส่งไม่สำเร็จ ลองปิดแล้วเปิดการแจ้งเตือนใหม่")}>ทดสอบแจ้งเตือน</button>
          {state === "on" && !compact && <button className="lk" disabled={busy} onClick={() => run(disable, () => "ปิดการแจ้งเตือนแล้ว")}>ปิด</button>}
        </div>
      )}
      {msg && <p className={`notice ${msg.k}`} style={{ margin: 0 }}>{msg.t}</p>}
    </div>
  );
}

/** Admin: ทดสอบส่งหาทุกคน / เฉพาะ Admin-Safety */
export function PushAdminCard() {
  const [stats, setStats] = useState<{ devices: number; with_account: number } | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [arm, setArm] = useState<string | null>(null);
  useEffect(() => { api<any>("/api/push").then((r) => setStats(r.stats ?? null)).catch(() => {}); }, []);
  const send = async (to: "all" | "staff") => {
    if (arm !== to) return setArm(to);
    setArm(null); setMsg(null);
    try { const r: any = await api("/api/push", { method: "POST", json: { action: "test-all", to } }); setMsg({ k: "ok", t: `ส่งแล้ว ${r.sent}/${r.devices} เครื่อง${r.failed ? ` · ไม่สำเร็จ ${r.failed}` : ""}` }); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  };
  return (
    <div className="card stack" style={{ padding: 18, gap: 10 }}>
      <b>ทดสอบการแจ้งเตือน</b>
      <p className="muted small" style={{ margin: 0 }}>
        เครื่องที่เปิดรับแจ้งเตือน {stats ? `${stats.devices} เครื่อง (ผูกบัญชี ${stats.with_account})` : "—"} ·
        แจ้งอัตโนมัติเมื่อ: เริ่มซ้อม / ยืนยันเหตุจริง → ทุกคน · มีคนแจ้งเหตุ → Admin และ Safety Officer
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm" onClick={() => send("staff")} onBlur={() => setArm(null)}>{arm === "staff" ? "กดอีกครั้งเพื่อส่ง" : "ทดสอบส่ง Admin / Safety"}</button>
        <button className="btn btn-sm" onClick={() => send("all")} onBlur={() => setArm(null)}>{arm === "all" ? "กดอีกครั้งเพื่อส่งทุกคน" : "ทดสอบส่งทุกคน"}</button>
      </div>
      {msg && <p className={`notice ${msg.k}`} style={{ margin: 0 }}>{msg.t}</p>}
      <NotifyCard />
    </div>
  );
}
