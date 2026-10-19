"use client";
import { ago, useNow } from "./lib";

export type SourceState = {
  key: string; label: string; ready: boolean;
  last_ok_at: string | null; last_try_at: string | null; last_error: string | null; record_count: number | null;
};

/** แถบอายุข้อมูลรายแหล่ง: ผู้บัญชาการต้องรู้เสมอว่ากำลังใช้ข้อมูลเก่าแค่ไหน */
export default function SourceBar({ sources }: { sources: SourceState[] }) {
  const now = useNow(5000);
  return (
    <div className="sources" aria-label="สถานะแหล่งข้อมูล">
      {sources.map((s) => {
        let color = "var(--line)", text = "ยังไม่เชื่อมต่อ";
        if (s.ready) {
          const failedLast = s.last_try_at && (!s.last_ok_at || new Date(s.last_try_at) > new Date(s.last_ok_at)) && s.last_error;
          const stale = s.last_ok_at && now - new Date(s.last_ok_at).getTime() > 60 * 60 * 1000;
          if (!s.last_ok_at) { color = "var(--warn-stripe)"; text = s.last_error ?? "ยังไม่มีข้อมูล"; }
          else if (failedLast) { color = "var(--warn-stripe)"; text = `ดึงล่าสุดไม่สำเร็จ ใช้ข้อมูลเมื่อ ${ago(s.last_ok_at, now)}`; }
          else if (stale) { color = "var(--warn-stripe)"; text = `อัปเดต ${ago(s.last_ok_at, now)}`; }
          else { color = "var(--safe)"; text = `อัปเดต ${ago(s.last_ok_at, now)}`; }
        }
        return (
          <div className="src" key={s.key} title={s.last_error ?? undefined}>
            <span className="src-dot" style={{ background: color }} />
            <span><b>{s.label}</b> <span className="muted">{text}</span></span>
          </div>
        );
      })}
    </div>
  );
}
