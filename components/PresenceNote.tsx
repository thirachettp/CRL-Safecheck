"use client";
import { fmtTime } from "./lib";

export default function PresenceNote({ p }: { p: any }) {
  const gone = !p.still_in_source && p.presence !== "manual" && (
    <span className="pill pill-warn" style={{ marginLeft: 6 }}>{p.presence === "kiosk" ? "รถออกจากลานแล้ว?" : "อาจไม่อยู่ในพื้นที่"}</span>
  );
  if (p.presence === "div") return <>เช็กอินฟอร์ม {fmtTime(p.presence_since)} {p.presence_site ?? ""}{gone}</>;
  if (p.presence === "kiosk")
    return <>รถเข้าลาน {fmtTime(p.presence_since)}{p.presence_site ? `, ${p.presence_site}` : ""}{gone}</>;
  if (p.presence === "manual") return <>เพิ่มเองระหว่างเหตุการณ์</>;
  return <>ตามแผนอพยพ{gone}</>;
}
