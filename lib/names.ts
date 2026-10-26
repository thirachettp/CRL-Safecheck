// ชื่อไทย / อังกฤษ: ตัดคำนำหน้า ทำให้เป็นรูปแบบเดียวกัน และค้นหาได้ทั้งสองภาษา (ใช้ทั้งเบราว์เซอร์และเซิร์ฟเวอร์)

const PREFIX_RE = /^(นางสาว|น\.ส\.|นส\.|นาง|นาย|ด\.ช\.|ด\.ญ\.|ดร\.|mr\.?|mrs\.?|ms\.?|miss|dr\.?)\s*/i;

/** คำนำหน้าภาษาอังกฤษ → เพศ */
export const EN_PREFIX_GENDER: Record<string, string> = { "mr": "ชาย", "mr.": "ชาย", "mrs": "หญิง", "mrs.": "หญิง", "ms": "หญิง", "ms.": "หญิง", "miss": "หญิง" };

/** ตัดคำนำหน้าออก (ไทย/อังกฤษ) */
export const stripPrefix = (s: string) => s.replace(/[​-‍﻿]/g, "").trim().replace(PREFIX_RE, "").trim();

/** รูปแบบสำหรับเทียบ/ค้นหา: ไม่มีคำนำหน้า ตัวเล็ก ช่องว่างเดียว ไม่มีอักขระที่มองไม่เห็น */
export function normName(s: string | null | undefined) {
  return stripPrefix(String(s ?? "")).normalize("NFC").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

/** เป็นชื่ออักษรอังกฤษ (ไม่มีอักษรไทย และมีตัวอักษรละติน) */
export const isLatin = (s: string | null | undefined) => !!s && /[a-z]/i.test(s) && !/[฀-๿]/.test(s);

/**
 * คำค้นตรงกับชื่อไหม: ทุกคำในคำค้นต้องอยู่ในชื่อ (สลับลำดับได้ เช่น พิมพ์นามสกุลก่อน)
 * ส่ง field ได้หลายช่อง (ชื่อไทย ชื่ออังกฤษ รหัส ฯลฯ) คืน index ของช่องแรกที่ตรง หรือ -1
 */
export function matchName(query: string, fields: (string | null | undefined)[]): number {
  const words = normName(query).split(" ").filter(Boolean);
  if (!words.length) return -1;
  const hay = fields.map((f) => normName(f));
  const all = hay.join(" ");
  if (!words.every((w) => all.includes(w))) return -1;
  const i = hay.findIndex((h) => words.every((w) => h.includes(w)));
  return i >= 0 ? i : 0;
}
