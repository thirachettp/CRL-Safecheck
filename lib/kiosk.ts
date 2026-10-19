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
    body: process.env.KIOS_RPC_BODY || "{}",
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KIOS ตอบ ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
  if (!rows) throw new Error("KIOS ส่งข้อมูลกลับมาไม่ใช่รายการ");
  return rows;
}
