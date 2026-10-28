/** ชนิดของ Code ตามลำดับขั้น: 500 = ไปตรวจสอบ · 500 ด่วนมาก = อพยพ · คุณสบายใจ (ปิด) = ปกติแล้ว */
export type CodeKind = "check" | "urgent" | "clear" | "other";
export const codeKind = (c: { label?: string | null; closes?: boolean | null }): CodeKind =>
  c.closes ? "clear" : /ด่วน/.test(c.label ?? "") ? "urgent" : /500/.test(c.label ?? "") ? "check" : "other";
