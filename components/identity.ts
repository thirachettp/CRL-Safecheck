"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./lib";

export type Role = "user" | "safety" | "admin";
export type User = { code: string; name: string; role: Role; token: string; mustChange?: boolean };
export type Admin = { token: string; name: string; role: "admin" | "safety"; exp: number; viaAccount?: boolean };

const EVT = "sc-auth";
const ping = () => { try { window.dispatchEvent(new Event(EVT)); } catch {} };

/** วันหมดอายุใน token (ไม่ได้ตรวจลายเซ็น ใช้แค่ซ่อนสถานะที่หมดอายุแล้วในเครื่อง) */
function tokenExp(t: string): number {
  try {
    const b = t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return Number(JSON.parse(decodeURIComponent(escape(atob(b)))).exp) || 0;
  } catch { return 0; }
}
function readUser(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem("sc_user") ?? "null");
    if (!u?.token) return null; // ของเก่าที่ไม่มี token = ต้องเข้าสู่ระบบใหม่
    if (tokenExp(u.token) < Date.now()) { localStorage.removeItem("sc_user"); return null; }
    return u;
  } catch { return null; }
}
function saveUser(u: User | null) {
  try { u ? localStorage.setItem("sc_user", JSON.stringify(u)) : localStorage.removeItem("sc_user"); } catch {}
  ping();
}
function readPinAdmin(): Admin | null {
  try {
    const a = JSON.parse(sessionStorage.getItem("sc_admin") ?? "null");
    return a && a.exp > Date.now() ? a : null;
  } catch { return null; }
}

function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [pin, setPin] = useState<Admin | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
    const load = () => {
      const u = readUser(), p = readPinAdmin();
      setUser((x) => (same(x, u) ? x : u)); setPin((x) => (same(x, p) ? x : p)); setReady(true);
    };
    load();
    window.addEventListener(EVT, load);
    window.addEventListener("storage", load);
    const t = setInterval(load, 60_000); // หมดอายุระหว่างเปิดหน้าค้างไว้ → ออกจากระบบเอง
    return () => { clearInterval(t); window.removeEventListener(EVT, load); window.removeEventListener("storage", load); };
  }, []);
  return { user, pin, ready };
}

let checked = false;

/** ผู้ใช้: รหัสพนักงาน + รหัสผ่าน (จำไว้ในเครื่องนี้ 30 วัน) */
export function useUser() {
  const { user, ready } = useAuthState();

  // เช็คบทบาทล่าสุดกับเซิร์ฟเวอร์ครั้งเดียวต่อการเปิดแอป (Admin เปลี่ยนบทบาท / รีเซ็ตรหัสผ่าน)
  useEffect(() => {
    if (!user || checked) return;
    checked = true;
    api<{ code: string; name: string; role: Role }>("/api/account")
      .then((s) => { if (s.role !== user.role || s.name !== user.name) saveUser({ ...user, role: s.role, name: s.name }); })
      .catch((e) => { if (e.status === 401) saveUser(null); });
  }, [user]);

  const check = useCallback((code: string) => api<{ next: "password" | "setup" }>("/api/login", { method: "POST", json: { code } }), []);
  const login = useCallback(async (code: string, password: string) => {
    const u = await api<User>("/api/login", { method: "POST", json: { code, password } });
    saveUser(u);
    return u;
  }, []);
  const setup = useCallback(async (code: string, email: string, password: string) => {
    const u = await api<User>("/api/login", { method: "POST", json: { action: "setup", code, email, password } });
    saveUser(u);
    return u;
  }, []);
  const register = useCallback(async (form: Record<string, unknown>) => {
    const u = await api<User>("/api/register", { method: "POST", json: form });
    saveUser(u);
    return u;
  }, []);
  const changePassword = useCallback(async (old: string, password: string) => {
    const u = await api<User>("/api/account", { method: "POST", json: { old, password } });
    saveUser(u);
    return u;
  }, []);
  const remember = useCallback((patch: Partial<User>) => { const u = readUser(); if (u) saveUser({ ...u, ...patch }); }, []);
  const logout = useCallback(() => {
    try { sessionStorage.removeItem("sc_admin"); } catch {}
    saveUser(null);
  }, []);
  return { user, ready, check, login, setup, register, changePassword, remember, logout, by: user?.name ?? "" };
}

/** Admin / Safety: บัญชีที่มีบทบาท admin/safety ได้สิทธิ์อัตโนมัติ หรือใส่ PIN (ระบบเดิม) อายุ 12 ชม. เฉพาะแท็บนี้ */
export function useAdmin() {
  const { user, pin, ready } = useAuthState();
  const admin: Admin | null = pin
    ?? (user && (user.role === "admin" || user.role === "safety")
      ? { token: user.token, name: user.name, role: user.role, exp: Number.MAX_SAFE_INTEGER, viaAccount: true } : null);
  const unlock = useCallback(async (p: string) => {
    const r = await api<{ token: string; name: string; role: "admin" | "safety" }>("/api/auth", { method: "POST", json: { pin: p } });
    const a = { ...r, exp: Date.now() + 12 * 3600e3 - 60e3 };
    try { sessionStorage.setItem("sc_admin", JSON.stringify(a)); } catch {}
    ping();
    return a;
  }, []);
  const lock = useCallback(() => {
    const hadPin = !!readPinAdmin();
    try { sessionStorage.removeItem("sc_admin"); } catch {}
    if (!hadPin && user) saveUser(null); // เข้าด้วยบัญชี = ออกจากระบบ
    ping();
  }, [user]);
  return { admin, ready, unlock, lock };
}
