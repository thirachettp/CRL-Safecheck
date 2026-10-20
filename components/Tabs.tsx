"use client";
import { useEffect, useState } from "react";

/** แท็บแบบง่าย จำแท็บล่าสุดไว้ในเครื่อง (ต่อหน้า) */
export function useTab<T extends string>(key: string, ids: readonly T[], initial: T) {
  const [tab, setTab] = useState<T>(initial);
  useEffect(() => {
    try {
      const h = window.location.hash.slice(1) as T;
      const v = (ids.includes(h) ? h : localStorage.getItem(`tab:${key}`)) as T | null;
      if (v && ids.includes(v)) setTab(v);
    } catch {}
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: T) => {
    setTab(v);
    try { localStorage.setItem(`tab:${key}`, v); history.replaceState(null, "", `#${v}`); } catch {}
  };
  return [tab, change] as const;
}

export default function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; badge?: string | number | null }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="stabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`stab${value === t.id ? " on" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}{t.badge != null && t.badge !== "" && <span className="stab-b">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
