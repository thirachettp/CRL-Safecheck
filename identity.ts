"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./lib";

export type User = { code: string; name: string };
export type Admin = { token: string; name: string; role: "admin" | "safety"; exp: number };

/** ผู้ใช้ทั่วไป: ระบุตัวตนด้วยรหัสพนักงาน (จำไว้ในเครื่องนี้) */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem("sc_user") ?? "null")); } catch {}
    setReady(true);
  }, []);
  const login = useCallback(async (code: string) => {
    const u = await api<User>("/api/login", { method: "POST", json: { code } });
    try { localStorage.setItem("sc_user", JSON.stringify(u)); } catch {}
    setUser(u);
    return u;
  }, []);
  const logout = useCallback(() => {
    try { localStorage.removeItem("sc_user"); } catch {}
    setUser(null);
  }, []);
  return { user, ready, login, logout, by: user?.name ?? "" };
}

/** Admin / Safety Officer: ใส่รหัส ได้ token อายุ 12 ชม. เก็บเฉพาะแท็บนี้ */
export function useAdmin() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const a = JSON.parse(sessionStorage.getItem("sc_admin") ?? "null");
      if (a && a.exp > Date.now()) setAdmin(a);
    } catch {}
    setReady(true);
  }, []);
  const unlock = useCallback(async (pin: string) => {
    const r = await api<{ token: string; name: string; role: "admin" | "safety" }>("/api/auth", { method: "POST", json: { pin } });
    const a = { ...r, exp: Date.now() + 12 * 3600e3 - 60e3 };
    try { sessionStorage.setItem("sc_admin", JSON.stringify(a)); } catch {}
    setAdmin(a);
    return a;
  }, []);
  const lock = useCallback(() => {
    try { sessionStorage.removeItem("sc_admin"); } catch {}
    setAdmin(null);
  }, []);
  return { admin, ready, unlock, lock };
}
