// เรียก RPC ของ KIOS ตรง (แทนการผ่าน Power BI) — key อยู่ฝั่ง server เท่านั้น

export function kioskConfigured() {
  return Boolean(process.env.KIOS_BASE_URL && process.env.KIOS_API_KEY);
}

/** เทียบเท่าสูตร Power Query: POST rest/v1/rpc/<fn>?status_id=eq.2 พร้อม header apikey */
export async function fetchKiosk(): Promise<Record<string, unknown>[]> {
  const base = process.env.KIOS_BASE_URL!.replace(/\/+$/, "");
  const fn = process.env.KIOS_RPC || "vms_dpark_withtransaction_detail";
  const status = process.env.KIOS_STATUS_ID || "2";
  const url = `${base}/rest/v1/rpc/${fn}?status_id=eq.${encodeURIComponent(status)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: process.env.KIOS_API_KEY!, "Content-Type": "application/json" },
    body: rpcBody(),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text.slice(0, 300);
    try {
      const e = JSON.parse(text);
      // PostgREST บอกพารามิเตอร์ที่ฟังก์ชันต้องการไว้ใน hint
      msg = [e.code, e.message, e.hint && `คำแนะนำ: ${e.hint}`].filter(Boolean).join(" · ");
    } catch {}
    throw new Error(`KIOS ตอบ ${res.status}: ${msg}`);
  }
  const j = await res.json();
  const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
  if (!rows) throw new Error("KIOS ส่งข้อมูลกลับมาไม่ใช่รายการ");
  return rows;
}

/**
 * Body ของ RPC จาก KIOS_RPC_BODY (JSON เดียวกับตัวแปร Body ใน Power Query)
 * ใส่วันที่แบบเลื่อนตามวันได้: {{today}} {{yesterday}} {{tomorrow}} (เวลาไทย, YYYY-MM-DD) และ {{now}} (ISO)
 */
export function rpcBody(now = new Date()) {
  const day = (offset: number) => new Date(now.getTime() + 7 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
  return (process.env.KIOS_RPC_BODY || "{}")
    .replaceAll("{{today}}", day(0))
    .replaceAll("{{yesterday}}", day(-1))
    .replaceAll("{{tomorrow}}", day(1))
    .replaceAll("{{now}}", now.toISOString());
}
