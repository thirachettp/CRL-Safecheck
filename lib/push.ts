// แจ้งเตือนแบบ Web Push (ไม่ต้องใช้บริการภายนอก) · กุญแจ VAPID จาก env หรือสร้างเองครั้งแรกแล้วเก็บในฐานข้อมูล
import webpush from "web-push";
import { q, one } from "./db";
import { getSetting, setSetting } from "./settings";
import { bootstrapAdmins } from "./auth";

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

export async function vapidKeys(): Promise<Keys> {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  let k = await getSetting<Keys | null>("vapid_keys", null);
  if (!k) {
    k = webpush.generateVAPIDKeys();
    await setSetting("vapid_keys", k);
    // กันสองเครื่องสร้างพร้อมกัน: อ่านค่าที่บันทึกจริงกลับมา
    k = (await getSetting<Keys | null>("vapid_keys", null)) ?? k;
  }
  cached = k;
  return k;
}

export type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function saveSub(s: Sub, who: { code?: string | null; role?: string | null }, ua: string | null) {
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) throw new Error("ข้อมูลการสมัครรับแจ้งเตือนไม่ครบ");
  await q(
    `INSERT INTO push_subs (endpoint, p256dh, auth, code, role, ua) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       code = COALESCE(EXCLUDED.code, push_subs.code), role = COALESCE(EXCLUDED.role, push_subs.role), ua = EXCLUDED.ua, fails = 0`,
    [s.endpoint, s.keys.p256dh, s.keys.auth, who.code ?? null, who.role ?? null, ua?.slice(0, 200) ?? null]);
}

export const removeSub = (endpoint: string) => q(`DELETE FROM push_subs WHERE endpoint = $1`, [endpoint]);

export type Payload = { title: string; body: string; url?: string; tag?: string; urgent?: boolean };
export type Audience = "all" | "staff" | { endpoint: string };

/** ส่งแจ้งเตือน · staff = Admin / Safety Officer · ไม่รอเกิน ~8 วินาที */
export async function notify(to: Audience, p: Payload) {
  const k = await vapidKeys();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:safecheck@central.co.th", k.publicKey, k.privateKey);
  const boot = bootstrapAdmins();
  const subs = typeof to === "object"
    ? await q<any>(`SELECT * FROM push_subs WHERE endpoint = $1`, [to.endpoint])
    : to === "staff"
      ? await q<any>(
          `SELECT s.* FROM push_subs s LEFT JOIN profiles p ON p.code = s.code
           WHERE s.role IN ('admin','safety','lp') OR p.role IN ('admin','safety','lp') OR s.code = ANY($1::text[])`, [boot])
      : await q<any>(`SELECT * FROM push_subs`);
  const body = JSON.stringify({ ...p, url: p.url ?? "/" });
  let sent = 0, failed = 0;
  const one_ = async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body,
        { TTL: 3600, urgency: p.urgent ? "high" : "normal", topic: p.tag?.slice(0, 32) });
      sent++;
      await q(`UPDATE push_subs SET last_ok_at = now(), fails = 0 WHERE endpoint = $1`, [s.endpoint]);
    } catch (e: any) {
      failed++;
      // เครื่องยกเลิก/หมดอายุ → ลบทิ้ง · ผิดพลาดอื่นนับไว้ ลบเมื่อพลาดติดกัน 5 ครั้ง
      if (e?.statusCode === 404 || e?.statusCode === 410) await removeSub(s.endpoint);
      else await q(`UPDATE push_subs SET fails = fails + 1 WHERE endpoint = $1`, [s.endpoint]).then(() =>
        q(`DELETE FROM push_subs WHERE endpoint = $1 AND fails >= 5`, [s.endpoint]));
    }
  };
  await Promise.race([
    Promise.allSettled(subs.map(one_)),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  return { devices: subs.length, sent, failed };
}

export async function pushStats() {
  const r = await one<any>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE code IS NOT NULL)::int AS with_account FROM push_subs`);
  return { devices: r?.n ?? 0, with_account: r?.with_account ?? 0 };
}
