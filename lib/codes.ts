/** ชนิดของ Code ตามลำดับขั้น: 500 = ไปตรวจสอบ · 500 ด่วนมาก = อพยพ · คุณสบายใจ (ปิด) = ปกติแล้ว */
export type CodeKind = "check" | "urgent" | "clear" | "other";
export const codeKind = (c: { label?: string | null; closes?: boolean | null }): CodeKind =>
  c.closes ? "clear" : /ด่วน/.test(c.label ?? "") ? "urgent" : /500/.test(c.label ?? "") ? "check" : "other";

/** ประเภทเหตุ → เลขรหัสที่ประกาศ เช่น ไฟไหม้ = คุณรัดประภา 500 ที่ ... · main = ปุ่มหลักตอนแจ้งเหตุ (ที่เหลืออยู่ใต้ "อื่นๆ") */
export type KindRow = { name: string; code: string; meaning: string; urgent_meaning: string; main: boolean };
export type KindsCfg = { word: string; fallback: string; kinds: KindRow[] };
export const DEFAULT_KINDS: KindsCfg = {
  word: "คุณรัดประภา", fallback: "500",
  kinds: [
    { name: "ไฟไหม้", code: "500", main: true, meaning: "มีเหตุเพลิงไหม้เกิดขึ้น (เจ้าหน้าที่ดับเพลิงเข้าตรวจสอบ ยังไม่ต้องอพยพ)", urgent_meaning: "มีเหตุเพลิงไหม้ (ส่งทีมดับเพลิงเข้าจัดการทันที ยังไม่ต้องอพยพ)" },
    { name: "แอมโมเนียรั่ว", code: "520", main: true, meaning: "", urgent_meaning: "" },
    { name: "แผ่นดินไหว", code: "800", main: true, meaning: "", urgent_meaning: "" },
    { name: "วัตถุต้องสงสัย / ขู่วางระเบิด", code: "510", main: false, meaning: "พบวัตถุต้องสงสัย หรือมีเหตุโทรขู่วางระเบิด", urgent_meaning: "พบเหตุระเบิดหรือวัตถุระเบิด ต้องทำการอพยพ" },
    { name: "เพลิงไหม้ศูนย์การค้า", code: "511", main: false, meaning: "เหตุเพลิงไหม้ภายในศูนย์การค้า", urgent_meaning: "เหตุเพลิงไหม้ศูนย์การค้าลุกลาม ต้องสั่งอพยพทันที" },
    { name: "จลาจล", code: "610", main: false, meaning: "เหตุจลาจล", urgent_meaning: "เหตุจลาจลลุกลาม ต้องอพยพ" },
  ],
};
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
/** แถวของประเภทเหตุ: ชื่อตรงก่อน แล้วค่อยเทียบแบบมีคำนั้นอยู่ (เช่น "แอมโมเนีย" ตรงกับ "แอมโมเนียรั่ว") */
export function kindRow(cfg: KindsCfg, kind: string | null | undefined): KindRow | null {
  const k = norm(kind ?? "");
  if (!k) return null;
  return cfg.kinds.find((x) => norm(x.name) === k)
    ?? cfg.kinds.find((x) => { const n = norm(x.name); return n && (k.includes(n) || n.includes(k)); }) ?? null;
}
export const kindCode = (cfg: KindsCfg, kind: string | null | undefined) => kindRow(cfg, kind)?.code || cfg.fallback || "500";
/** ข้อความประกาศ เช่น "คุณรัดประภา 520 ด่วนมาก ที่ ห้องเครื่อง" */
export function codePhrase(cfg: KindsCfg, kind: string | null | undefined, area: string | null | undefined, urgent: boolean) {
  return `${cfg.word || "คุณรัดประภา"} ${kindCode(cfg, kind)}${urgent ? " ด่วนมาก" : ""}${area?.trim() ? ` ที่ ${area.trim()}` : ""}`;
}
/** ความหมายของรหัส (ถ้าตั้งไว้) */
export const codeMeaning = (cfg: KindsCfg, kind: string | null | undefined, urgent: boolean) => {
  const r = kindRow(cfg, kind);
  return (urgent ? r?.urgent_meaning : r?.meaning) || "";
};
export function cleanKinds(x: any): KindsCfg {
  const t = (v: any, n: number) => String(v ?? "").trim().slice(0, n);
  const kinds = (Array.isArray(x?.kinds) ? x.kinds : [])
    .map((k: any) => ({ name: t(k?.name, 40), code: t(k?.code, 10), meaning: t(k?.meaning, 160), urgent_meaning: t(k?.urgent_meaning, 160), main: k?.main !== false }))
    .filter((k: KindRow) => k.name);
  return { word: t(x?.word, 30) || DEFAULT_KINDS.word, fallback: t(x?.fallback, 10) || "500", kinds };
}
