"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./lib";

export type LookupHit = {
  emp_id: string; prefix: string | null; first_name: string | null; last_name: string | null; name_en: string | null;
  gender: string | null; cost_center: string | null; area: string | null; role: string | null; tel: string | null;
  in_plan: { flag_no: string | null } | null; removed: boolean; from: string;
};

const PREFIX_GENDER: Record<string, string> = { "นาย": "ชาย", "Mr.": "ชาย", "นาง": "หญิง", "นางสาว": "หญิง", "Mrs.": "หญิง", "Ms.": "หญิง", "Miss": "หญิง" };
export const genderOf = (prefix: string) => PREFIX_GENDER[prefix?.trim()] ?? "";

/**
 * พิมพ์รหัสพนักงานแล้วค้นข้อมูลเดิม (ชุดธง / เวอร์ชันเก่า / โปรไฟล์ / Outsource)
 * เจอแล้วเติมช่องที่ยังว่างให้อัตโนมัติ (ไม่ทับที่พิมพ์เอง)
 */
export function usePersonLookup(base: string, code: string, form: any, setForm: (f: any) => void) {
  const [hit, setHit] = useState<LookupHit | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = useRef<string>("");
  const formRef = useRef(form);
  formRef.current = form;
  useEffect(() => {
    const c = code.trim();
    if (c.length < 4) { setHit(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api(`${base}?lookup=${encodeURIComponent(c)}`);
        if (!live) return;
        const h: LookupHit | null = r.person ?? null;
        setHit(h);
        if (h && !h.in_plan && filled.current !== c.toUpperCase()) {
          filled.current = c.toUpperCase();
          const f = { ...formRef.current };
          for (const k of ["prefix", "first_name", "last_name", "name_en", "gender", "cost_center", "area", "tel"] as const) {
            if (h[k] && !String(f[k] ?? "").trim()) f[k] = h[k];
          }
          if (h.gender && f.gender !== h.gender && !formRef.current.first_name?.trim()) f.gender = h.gender;
          if (h.role && (!f.role || f.role === "ผู้อพยพ")) f.role = h.role;
          setForm(f);
        }
      } catch { if (live) setHit(null); } finally { if (live) setBusy(false); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [base, code]); // eslint-disable-line react-hooks/exhaustive-deps
  return { hit, busy, reset: () => { filled.current = ""; setHit(null); } };
}

export function LookupNote({ hit, busy, code }: { hit: LookupHit | null; busy: boolean; code: string }) {
  if (code.trim().length < 4) return <span className="muted xs">พิมพ์รหัสพนักงาน ระบบจะเติมข้อมูลเดิมให้ถ้าเคยมี</span>;
  if (busy && !hit) return <span className="muted xs">กำลังค้นข้อมูลเดิม…</span>;
  if (!hit) return <span className="muted xs">ไม่พบข้อมูลเดิม · กรอกเองได้เลย</span>;
  if (hit.in_plan) return <span className="xs" style={{ color: "#9F1239", fontWeight: 600 }}>รหัสนี้อยู่ธง {hit.in_plan.flag_no ?? "—"} แล้ว ({[hit.prefix, hit.first_name, hit.last_name].filter(Boolean).join(" ")}) · ใช้แก้ไข/ย้ายธงแทน</span>;
  return (
    <span className="xs" style={{ color: "#166534", fontWeight: 600 }}>
      ✓ เติมข้อมูลจาก{hit.from}แล้ว: {[hit.prefix, hit.first_name, hit.last_name].filter(Boolean).join(" ")}
      {hit.cost_center ? ` · ${hit.cost_center}` : ""}{hit.area ? ` ${hit.area}` : ""} · ตรวจแล้วกดเพิ่ม
      {hit.removed ? " (คืนกลับเข้าธงนี้)" : ""}
    </span>
  );
}
