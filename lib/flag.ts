// เบอร์ธงเป็นข้อความได้ เช่น "17", "17A", "OS-1" · ใช้ร่วมกันทั้งเบราว์เซอร์และเซิร์ฟเวอร์

/** ทำเบอร์ธงให้เป็นรูปแบบเดียวกัน: ตัดช่องว่าง, ตัดคำว่า "ธง" นำหน้า, 17.0 → 17, 07 → 7 */
export function normFlag(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  let s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(/^ธง\s*(ที่)?\s*/i, "").replace(/^(no\.?|เบอร์)\s*/i, "").trim();
  if (/^\d+(\.0+)?$/.test(s)) s = String(parseInt(s, 10));
  return s ? s.slice(0, 20) : null;
}

/** เรียงเบอร์ธงแบบธรรมชาติ: 1, 2, 10, 10A, OS-1 · ค่าว่างไว้ท้าย */
export function cmpFlag(a: string | null | undefined, b: string | null | undefined) {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  return a.localeCompare(b, "th", { numeric: true, sensitivity: "base" });
}

/** SQL สำหรับ ORDER BY เบอร์ธงแบบธรรมชาติ (ต้องมีฟังก์ชัน flag_key ใน schema) */
export const flagOrder = (col: string) => `flag_key(${col}), ${col}`;

/** สรุปรายการธงสั้น ๆ: 1–3, 5, 10A */
export function flagRange(list: (string | null | undefined)[]) {
  const xs = [...new Set(list.filter((x): x is string => !!x))].sort(cmpFlag);
  const out: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (!/^\d+$/.test(xs[i])) { out.push(xs[i]); continue; }
    let j = i;
    while (j + 1 < xs.length && /^\d+$/.test(xs[j + 1]) && Number(xs[j + 1]) === Number(xs[j]) + 1) j++;
    out.push(j > i ? `${xs[i]}–${xs[j]}` : xs[i]);
    i = j;
  }
  return out.join(", ");
}
