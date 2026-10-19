// กฎอนุมานเข้า/ออกจาก MS Form (ไม่มีคำถามเข้า/ออกในฟอร์ม)
// 1. รายการแรก = เข้า
// 2. ส่งอีกครั้งภายใน 14 ชม. ที่ไซต์เดิม = ออก (ปิดคู่) ครั้งถัดไปเริ่มคู่ใหม่
// 3. ครบ 14 ชม. ไม่มีขาที่สอง = ออกอัตโนมัติ
// 4. ส่งซ้ำภายใน 10 นาที นับเป็นครั้งเดียว
// 5. ขาที่สองเป็นไซต์อื่น = ย้ายไซต์ (ออกจากไซต์เดิม เข้าไซต์ใหม่ทันที)
// 6. จับคู่ตามช่วง 14 ชม. ไม่ใช่วันปฏิทิน

export const DEDUPE_MS = 10 * 60 * 1000;
export const AUTO_OUT_MS = 14 * 60 * 60 * 1000;

export type CheckinEvent = { at: Date; site: string | null };

export type Presence =
  | { state: "in"; site: string | null; since: Date }
  | { state: "out"; reason: "manual" | "auto"; site: string | null; at: Date }
  | { state: "none" };

const norm = (s: string | null) => (s ?? "").trim().toUpperCase();

/** คำนวณสถานะของคนหนึ่งคน ณ เวลา `now` จากรายการเช็กอินทั้งหมดของเขา */
export function computePresence(events: CheckinEvent[], now: Date): Presence {
  const sorted = events
    .filter((e) => e.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let cur: Presence = { state: "none" };
  let lastAccepted: number | null = null;

  for (const e of sorted) {
    const t = e.at.getTime();
    // กฎ 4: กดซ้ำภายใน 10 นาที นับเป็นครั้งเดียว
    if (lastAccepted !== null && t - lastAccepted < DEDUPE_MS) continue;
    lastAccepted = t;

    if (cur.state === "in") {
      const openFor = t - cur.since.getTime();
      if (openFor >= AUTO_OUT_MS) {
        // คู่เดิมถูกปิดอัตโนมัติไปแล้ว รายการนี้คือการเข้ารอบใหม่
        cur = { state: "in", site: e.site, since: e.at };
      } else if (norm(e.site) !== norm(cur.site)) {
        // กฎ 5: ย้ายไซต์
        cur = { state: "in", site: e.site, since: e.at };
      } else {
        cur = { state: "out", reason: "manual", site: e.site, at: e.at };
      }
    } else {
      cur = { state: "in", site: e.site, since: e.at };
    }
  }

  // กฎ 3: ออกอัตโนมัติเมื่อครบ 14 ชม.
  if (cur.state === "in" && now.getTime() - cur.since.getTime() >= AUTO_OUT_MS) {
    return {
      state: "out",
      reason: "auto",
      site: cur.site,
      at: new Date(cur.since.getTime() + AUTO_OUT_MS),
    };
  }
  return cur;
}
