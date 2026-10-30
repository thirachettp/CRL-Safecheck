// เรียก RPC ของ KIOS ตรง (แทนการผ่าน Power BI) — key อยู่ฝั่ง server เท่านั้น

export function kioskConfigured() {
  return Boolean(process.env.KIOS_BASE_URL && process.env.KIOS_API_KEY);
}

/** สรุป error ให้อ่านง่าย: หน้า HTML จาก gateway → "502 Bad Gateway" แทนการแปะทั้งหน้า */
export function kioskError(status: number, text: string) {
  const NAMES: Record<number, string> = { 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout", 524: "Timeout" };
  if (/^\s*</.test(text)) {
    const title = text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    return `KIOS ไม่ตอบ (${status} ${NAMES[status] ?? ""}${title && !title.includes(String(status)) ? ` · ${title.slice(0, 80)}` : ""}) · เซิร์ฟเวอร์ KIOS ล่มหรือประมวลผลนานเกิน`.replace(/\s+\)/, ")");
  }
  let msg = text.slice(0, 200);
  try {
    const e = JSON.parse(text);
    // PostgREST บอกพารามิเตอร์ที่ฟังก์ชันต้องการไว้ใน hint
    msg = [e.code, e.message, e.hint && `คำแนะนำ: ${e.hint}`].filter(Boolean).join(" · ");
  } catch {}
  return `KIOS ตอบ ${status}: ${msg}`;
}

const RETRY = new Set([502, 503, 504, 520, 522, 524]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เทียบเท่าสูตร Power Query: POST rest/v1/rpc/<fn> พร้อม header apikey (ข้อมูลเดียวกับเมนู dParkTransactions)
 *  ล่ม (502/503/504/เชื่อมต่อไม่ได้) → ไม่ลองซ้ำทันที ระบบพัก 1 นาทีก่อนเรียกรอบถัดไป (ดู syncDriver) */
export async function fetchKiosk(): Promise<Record<string, unknown>[]> {
  const base = process.env.KIOS_BASE_URL!.replace(/\/+$/, "");
  const fn = process.env.KIOS_RPC || "vms_dpark_withtransaction_detail";
  // ไม่ใช้ filter สถานะของ KIOS (ไม่น่าเชื่อถือ) · ดึงทุกแถวในช่วงเวลาของ KIOS_RPC_BODY แล้วนับเฉพาะแถวที่ยังไม่มีเวลาออก
  // ตั้ง KIOS_STATUS_ID ไว้ = กลับไปใช้ filter สถานะแบบเดิม
  const status = process.env.KIOS_STATUS_ID;
  const url = `${base}/rest/v1/rpc/${fn}${status ? `?status_id=eq.${encodeURIComponent(status)}` : ""}`;
  const body = rpcBody();
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 1; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { apikey: process.env.KIOS_API_KEY!, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
    } catch (e: any) {
      lastErr = new Error(e?.name === "TimeoutError" ? "KIOS ไม่ตอบภายใน 12 วินาที" : `เชื่อมต่อ KIOS ไม่ได้: ${e?.message ?? e}`);
      if (attempt === 1) { await wait(2500); continue; }
      break;
    }
    if (res.ok) {
      const j = await res.json();
      const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
      if (!rows) throw new Error("KIOS ส่งข้อมูลกลับมาไม่ใช่รายการ");
      return rows;
    }
    lastErr = new Error(kioskError(res.status, await res.text()));
    if (attempt === 1 && RETRY.has(res.status)) { await wait(2500); continue; }
    break;
  }
  throw new Error(`${lastErr!.message} · จะลองใหม่ได้ใน 1 นาที`);
}

/**
 * Body ของ RPC จาก KIOS_RPC_BODY (JSON เดียวกับตัวแปร Body ใน Power Query)
 * ใส่วันที่แบบเลื่อนตามวันได้: {{today}} {{yesterday}} {{tomorrow}} {{today-2}} {{today+1}} (เวลาไทย, YYYY-MM-DD) และ {{now}} (ISO)
 */
export function rpcBody(now = new Date()) {
  const day = (offset: number) => new Date(now.getTime() + 7 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
  return (process.env.KIOS_RPC_BODY || "{}")
    .replace(/\{\{today([+-]\d{1,3})\}\}/g, (_, n) => day(Number(n)))
    .replaceAll("{{today}}", day(0))
    .replaceAll("{{yesterday}}", day(-1))
    .replaceAll("{{tomorrow}}", day(1))
    .replaceAll("{{now}}", now.toISOString());
}

/** วันเวลาไทยแบบ YYYY-MM-DDTHH:mm:ss (รูปแบบที่หน้า dParkTransactions ส่ง) */
const bkkStamp = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 19);

/** เปิดใช้ RPC รายการเข้า-ออกทั้งหมดของลานจอด (มี freeMember) ไหม · ปิดได้ด้วย KIOS_DPARK_RPC=off */
export const dparkEnabled = () => kioskConfigured() && (process.env.KIOS_DPARK_RPC ?? "") !== "off";

/**
 * รายการเข้า-ออกทั้งหมดของลานจอด (ตัวเดียวกับเมนู dParkTransactions: rpc/dpark_tr_transaction_alltime_bydate)
 * ได้ทั้ง freeMember และ visitor · ช่วงเวลา 48 ชม. ย้อนหลังถึงตอนนี้
 */
export async function fetchDpark(now = new Date()): Promise<Record<string, unknown>[]> {
  const base = (process.env.KIOS_DPARK_BASE_URL || process.env.KIOS_BASE_URL!).replace(/\/+$/, "");
  const fn = process.env.KIOS_DPARK_RPC || "dpark_tr_transaction_alltime_bydate";
  const body = JSON.stringify({
    appid: Number(process.env.KIOS_APPID || 34),
    begindatetime: bkkStamp(new Date(now.getTime() - 48 * 3600e3)),
    enddatetime: bkkStamp(new Date(now.getTime() + 3600e3)),
  });
  let res: Response;
  try {
    res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: process.env.KIOS_API_KEY!, Authorization: `Bearer ${process.env.KIOS_API_KEY!}`, "Content-Type": "application/json" },
      body, signal: AbortSignal.timeout(12_000), cache: "no-store",
    });
  } catch (e: any) {
    throw new Error(e?.name === "TimeoutError" ? "dpark: KIOS ไม่ตอบภายใน 12 วินาที" : `dpark: เชื่อมต่อไม่ได้: ${e?.message ?? e}`);
  }
  if (!res.ok) throw new Error(`dpark: ${kioskError(res.status, await res.text())}`);
  const j = await res.json();
  const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
  if (!rows) throw new Error("dpark: ข้อมูลที่ได้ไม่ใช่รายการ");
  return rows;
}

async function kiosGet(path: string, label: string): Promise<Record<string, unknown>[]> {
  const base = (process.env.KIOS_DPARK_BASE_URL || process.env.KIOS_BASE_URL!).replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: process.env.KIOS_API_KEY!, Authorization: `Bearer ${process.env.KIOS_API_KEY!}` },
      signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
  } catch (e: any) {
    throw new Error(e?.name === "TimeoutError" ? `${label}: KIOS ไม่ตอบภายใน 15 วินาที` : `${label}: เชื่อมต่อไม่ได้: ${e?.message ?? e}`);
  }
  if (!res.ok) throw new Error(`${label}: ${kioskError(res.status, await res.text())}`);
  const j = await res.json();
  if (!Array.isArray(j)) throw new Error(`${label}: ข้อมูลที่ได้ไม่ใช่รายการ`);
  return j;
}

/**
 * สมาชิกลานจอด (เมนู จัดการสมาชิก › สมาชิก + บัตร + รถ)
 * - ticketMember: ticketMemberID, ticketMemberName, ticketMemberTaxID (= หมายเลขประจำตัว / รหัสพนักงาน), ticketMemberTel
 * - dpark_Car: carPlateNumber, ticketMemberID (รถของสมาชิก)
 * ขอเฉพาะคอลัมน์ที่ใช้ (ไม่ดึงที่อยู่ / อีเมล)
 */
export async function fetchMembers(): Promise<{ members: Record<string, unknown>[]; cars: Record<string, unknown>[] }> {
  const appid = Number(process.env.KIOS_APPID || 34);
  const [members, cars] = await Promise.all([
    kiosGet(`ticketMember?select=ticketMemberID,ticketMemberName,ticketMemberTaxID,ticketMemberTel,ticketMemberActive&AppID=eq.${appid}&Del=eq.false`, "สมาชิก"),
    kiosGet(`dpark_Car?select=*&AppID=eq.${appid}`, "รถสมาชิก"),
  ]);
  return { members, cars };
}
