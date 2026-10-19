"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** แนบ token: PIN ของ Admin / Safety ในแท็บนี้ หรือ token ของบัญชีที่เข้าสู่ระบบ */
function adminHeader(): Record<string, string> {
  try {
    const a = JSON.parse(sessionStorage.getItem("sc_admin") ?? "null");
    if (a?.token && a.exp > Date.now()) return { "x-admin-token": a.token };
  } catch {}
  try {
    const u = JSON.parse(localStorage.getItem("sc_user") ?? "null");
    if (u?.token) return { "x-admin-token": u.token };
  } catch {}
  return {};
}

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...adminHeader(), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `ผิดพลาด (${res.status})`), { status: res.status, data });
  return data as T;
}

/** ดึงข้อมูลซ้ำทุก `ms` มิลลิวินาที (Phase 1 ใช้ polling แทน realtime) */
export function usePoll<T>(url: string | null, ms = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (alive.current) setError(e.message);
    }
  }, [url]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!ms) return () => { alive.current = false; };
    const t = setInterval(load, ms);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, ms]);
  return { data, error, reload: load };
}

const TZ = "Asia/Bangkok";
export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "ยังไม่เคย";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} วิที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}

export function duration(fromIso: string, toIso?: string | null) {
  const s = Math.max(0, Math.round(((toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export const LBL: Record<string, string> = {
  cmd: "กองอำนวยการกลาง", safe: "ปลอดภัย", in: "ยังอยู่ในคลัง", inj: "บาดเจ็บ",
  unk: "ยังไม่ทราบ", abs: "ปลอดภัยตามระบบ", gone: "ยืนยันไม่อยู่",
};
export const ORDER: Record<string, number> = { unk: 0, in: 1, inj: 2, safe: 3, cmd: 3, abs: 4, gone: 5 };
export const EVAC = ["safe", "inj", "cmd"];
export const MISSING = ["unk", "in"];
export const inPool = (s: string) => s !== "abs" && s !== "gone";
export const KINDS = [
  { id: "ไฟไหม้", label: "ไฟไหม้" }, { id: "สารเคมีรั่ว", label: "สารเคมีรั่ว" },
  { id: "แผ่นดินไหว", label: "แผ่นดินไหว" }, { id: "อื่นๆ", label: "อื่นๆ" },
];
export const TRI = [
  { id: "green", label: "เขียว", dot: "#16A34A", bg: "#DCFCE7", fg: "#14532D", name: "เจ็บเล็กน้อย" },
  { id: "yellow", label: "เหลือง", dot: "#CA8A04", bg: "#FEF9C3", fg: "#713F12", name: "เจ็บปานกลาง" },
  { id: "red", label: "แดง", dot: "#DC2626", bg: "#FEE2E2", fg: "#7F1D1D", name: "เจ็บรุนแรง" },
  { id: "black", label: "ดำ", dot: "#17191C", bg: "#E5E7EB", fg: "#111827", name: "วิกฤต" },
];
export const fmtClock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
export const initials = (name: string) => name.trim().slice(0, 2);

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** [1,2,3,5,7,8] → "1–3, 5, 7–8" */
export function rangeText(ns: number[]) {
  const s = [...ns].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
    i = j;
  }
  return out.join(", ");
}
