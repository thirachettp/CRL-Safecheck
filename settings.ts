import { q, one } from "./db";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await one<{ value: T }>(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return r ? r.value : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await q(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
