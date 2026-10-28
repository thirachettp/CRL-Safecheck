"use client";
import { Analytics } from "@vercel/analytics/next";

/** Vercel Web Analytics: นับการเข้าใช้แต่ละหน้า · ตัด query string ออก (ไม่ส่งรหัส/ค่าค้นหาไปนอกระบบ) */
export default function VercelAnalytics() {
  return <Analytics beforeSend={(e) => ({ ...e, url: e.url.split(/[?#]/)[0] })} />;
}
