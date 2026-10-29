import { q, one } from "./db";
import { fetchListDelta, graphConfigured } from "./graph";
import { normalizeGender, type FormCheckin } from "./parsers";
import { fetchKiosk, kioskConfigured } from "./kiosk";
import { detectFields, toVehicles, shouldHold, prepareRows, type KioskFields } from "./kioskMap";
import { setSetting } from "./settings";

export const SOURCES = [
  { key: "div", label: "DIV+ และอื่นๆ (MS Form)", ready: true },
  { key: "cnext", label: "Fulltime (Cnext)", ready: false },
  { key: "outsource", label: "Outsource (Power Apps)", ready: true },
  { key: "driver", label: "Driver (KIOS)", ready: true },
] as const;

async function markStatus(source: string, ok: boolean, count: number | null, error?: string, cursor?: string | null) {
  await q(
    `INSERT INTO source_status (source, last_ok_at, last_try_at, last_error, record_count, cursor)
     VALUES ($1, CASE WHEN $2 THEN now() END, now(), $3, $4, $5)
     ON CONFLICT (source) DO UPDATE SET
       last_try_at = now(),
       last_ok_at  = CASE WHEN $2 THEN now() ELSE source_status.last_ok_at END,
       last_error  = $3,
       record_count = COALESCE($4, source_status.record_count),
       cursor      = COALESCE($5, source_status.cursor)`,
    [source, ok, ok ? null : error ?? "ไม่ทราบสาเหตุ", count, cursor ?? null],
  );
}

/** ใช้กับแหล่งที่ส่งเข้ามาเอง (push) */
export async function markSource(source: string, ok: boolean, count: number | null, error?: string) {
  if (source === "outsource" && ok && count === null) {
    const r = await one<{ n: number }>(`SELECT count(*)::int AS n FROM outsource_attendance WHERE clock_in > now() - interval '14 hours' AND clock_out IS NULL`);
    count = r?.n ?? null;
  }
  await markStatus(source, ok, count, error);
}

/** เก็บของดิบลง ingest_raw ก่อนเสมอ แล้วจึง upsert เช็กอิน (batch_id ซ้ำ = ไม่ทำอะไร) */
export async function storeCheckins(rows: FormCheckin[], via: string, batchId: string) {
  const raw = await q(
    `INSERT INTO ingest_raw (source, batch_id, payload) VALUES ('div', $1, $2)
     ON CONFLICT (source, batch_id) DO NOTHING RETURNING id`,
    [batchId, JSON.stringify(rows)],
  );
  if (!raw.length) return { inserted: 0, duplicateBatch: true };
  if (!rows.length) return { inserted: 0, duplicateBatch: false };

  const res = await q(
    `INSERT INTO div_checkins (response_id, email, full_name, gender, site, submitted_at, via)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::text[])
     ON CONFLICT (response_id) DO NOTHING RETURNING response_id`,
    [
      rows.map((r) => r.response_id),
      rows.map((r) => r.email.toLowerCase()),
      rows.map((r) => r.full_name),
      rows.map((r) => r.gender),
      rows.map((r) => r.site),
      rows.map((r) => r.submitted_at),
      rows.map(() => via),
    ],
  );
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM div_checkins`);
  await markStatus("div", true, total?.n ?? null);
  return { inserted: res.length, duplicateBatch: false };
}

function fieldMap() {
  const def = {
    response_id: "ResponseId",
    email: "Email",
    full_name: "FullName",
    gender: "Gender",
    site: "Site",
    submitted_at: "SubmittedAt",
  };
  try {
    return { ...def, ...(process.env.SP_FIELD_MAP ? JSON.parse(process.env.SP_FIELD_MAP) : {}) };
  } catch {
    return def;
  }
}

/** ดึงเส้น MS Form จาก SharePoint List (Graph delta) */
export async function syncDiv(): Promise<{ ok: boolean; inserted: number; message: string }> {
  // ยังไม่มี app registration: ไม่นับเป็นการดึงล้มเหลว ข้อมูลยังเข้าได้ทาง Excel/ทดสอบ
  if (!graphConfigured()) return { ok: false, inserted: 0, message: "ยังไม่ได้ตั้งค่าการเชื่อม SharePoint" };
  const st = await one<{ cursor: string | null }>(`SELECT cursor FROM source_status WHERE source='div'`);
  try {
    const { items, deltaLink } = await fetchListDelta(st?.cursor ?? null);
    const F = fieldMap();
    const rows: FormCheckin[] = [];
    for (const f of items) {
      const id = String(f[F.response_id] ?? f.Title ?? "").trim();
      const email = String(f[F.email] ?? "").trim().toLowerCase();
      const at = f[F.submitted_at] ? new Date(f[F.submitted_at]) : null;
      if (!id || !email || !at || isNaN(at.getTime())) continue;
      rows.push({
        response_id: id,
        email,
        full_name: f[F.full_name] ?? null,
        gender: normalizeGender(f[F.gender]),
        site: f[F.site] ?? null,
        submitted_at: at.toISOString(),
      });
    }
    const batch = `graph-${Date.now()}`;
    const r = await storeCheckins(rows, "graph", batch);
    await markStatus("div", true, null, undefined, deltaLink);
    return { ok: true, inserted: r.inserted, message: `ได้แถวใหม่ ${r.inserted} แถว` };
  } catch (e: any) {
    await markStatus("div", false, null, e?.message ?? String(e));
    return { ok: false, inserted: 0, message: e?.message ?? "ดึงข้อมูลไม่สำเร็จ" };
  }
}

function kioskOverride(): Partial<KioskFields> {
  try {
    return process.env.KIOS_FIELD_MAP ? JSON.parse(process.env.KIOS_FIELD_MAP) : {};
  } catch {
    return {};
  }
}

/**
 * ดึงรถที่อยู่ในลานจาก KIOS (status_id=2) เป็น snapshot ทั้งชุด ใช้ทะเบียนรถเป็น key
 * จำนวนรถลดเกิน 30% จากรอบก่อน = กักไว้ไม่ใช้ จนกว่าจะกดยืนยัน (force)
 */
export async function syncDriver(opts: { force?: boolean } = {}): Promise<{ ok: boolean; held?: boolean; count?: number; message: string }> {
  if (!kioskConfigured()) return { ok: false, message: "ยังไม่ได้ตั้งค่า KIOS_BASE_URL / KIOS_API_KEY" };
  // KIOS ล่มรอบก่อน → พัก 1 นาทีก่อนเรียกใหม่ (ไม่ซ้ำเติมเซิร์ฟเวอร์ที่ล่มอยู่) ใช้ข้อมูลเดิมไปก่อน
  const st = await one<any>(`SELECT last_try_at, last_ok_at, last_error FROM source_status WHERE source = 'driver'`);
  if (st?.last_error && st.last_try_at && (!st.last_ok_at || new Date(st.last_try_at) > new Date(st.last_ok_at))) {
    const wait = 60 - Math.floor((Date.now() - new Date(st.last_try_at).getTime()) / 1000);
    if (wait > 0 && !opts.force) {
      return { ok: false, message: `KIOS ไม่ตอบรอบก่อน รออีก ${wait} วินาทีก่อนดึงใหม่ · ใช้ข้อมูลเดิมไปก่อน` };
    }
  }
  try {
    const rows = prepareRows(await fetchKiosk());
    await q(`INSERT INTO ingest_raw (source, batch_id, payload) VALUES ('driver', $1, $2) ON CONFLICT DO NOTHING`, [
      `kios-${Date.now()}`,
      JSON.stringify(rows),
    ]);
    // ของดิบเก็บ 14 วันพอสำหรับตรวจย้อนหลัง
    await q(`DELETE FROM ingest_raw WHERE source = 'driver' AND received_at < now() - interval '14 days'`);

    const fields = detectFields(rows, kioskOverride());
    const sampleKeys = rows[0] ? Object.keys(rows[0]) : [];
    await setSetting("driver_fields", { fields, sampleKeys, sample: rows.slice(0, 3) });
    if (rows.length && !fields.plate) {
      await markStatus("driver", false, null, "หาคอลัมน์ทะเบียนรถไม่เจอ ตั้ง KIOS_FIELD_MAP");
      return { ok: false, message: `หาคอลัมน์ทะเบียนรถไม่เจอ คอลัมน์ที่มี: ${sampleKeys.join(", ")}` };
    }
    const { vehicles, skipped, url, old, out } = toVehicles(rows, fields);
    const notes = [out && `ออกแล้ว (มีเวลาออก) ${out} คัน`, url && `ตัดทะเบียนที่เป็นลิงก์ ${url} แถว`, old && `ตัดรถที่เข้าลานเกิน 2 วัน ${old} คัน`,
      !fields.checkout_at && !fields.checkout_alt && "⚠️ หาคอลัมน์เวลาออกไม่เจอ นับทุกแถวว่ายังอยู่"].filter(Boolean).join(" · ");

    const prev = await one<{ n: number }>(`SELECT count(*)::int AS n FROM driver_presence`);
    if (!opts.force && shouldHold(prev?.n ?? 0, vehicles.length)) {
      const msg = `จำนวนรถลดจาก ${prev!.n} เหลือ ${vehicles.length} คัน (เกิน 30%) กักไว้ก่อน ยังใช้ข้อมูลรอบก่อน`;
      await markStatus("driver", false, null, msg);
      return { ok: false, held: true, count: vehicles.length, message: msg };
    }

    await q(`DELETE FROM driver_presence`);
    if (vehicles.length) {
      await q(
        `INSERT INTO driver_presence (plate, plate_display, driver_name, phone, company, zone, checkin_at)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[])`,
        [
          vehicles.map((v) => v.plate), vehicles.map((v) => v.plate_display), vehicles.map((v) => v.driver_name),
          vehicles.map((v) => v.phone), vehicles.map((v) => v.company), vehicles.map((v) => v.zone),
          vehicles.map((v) => v.checkin_at),
        ],
      );
    }
    await markStatus("driver", true, vehicles.length);
    return {
      ok: true,
      count: vehicles.length,
      message: `รถในลาน ${vehicles.length} คัน${skipped ? ` (ข้าม ${skipped} แถวที่ไม่มีทะเบียน)` : ""}${notes ? ` · ${notes}` : ""}`,
    };
  } catch (e: any) {
    await markStatus("driver", false, null, e?.message ?? String(e));
    return { ok: false, message: e?.message ?? "ดึงข้อมูล KIOS ไม่สำเร็จ" };
  }
}

export type SourceState = {
  key: string;
  label: string;
  ready: boolean;
  last_ok_at: string | null;
  last_try_at: string | null;
  last_error: string | null;
  record_count: number | null;
};

export async function sourceStates(): Promise<SourceState[]> {
  const rows = await q<any>(`SELECT * FROM source_status`);
  return SOURCES.map((s) => {
    const r = rows.find((x) => x.source === s.key);
    return {
      key: s.key,
      label: s.label,
      ready: s.ready,
      last_ok_at: r?.last_ok_at ? new Date(r.last_ok_at).toISOString() : null,
      last_try_at: r?.last_try_at ? new Date(r.last_try_at).toISOString() : null,
      last_error: r?.last_error ?? null,
      record_count: r?.record_count ?? null,
    };
  });
}

/** เรียกทุกแหล่งพร้อมกัน แยก timeout รายแหล่ง แหล่งไหนช้า/พังไม่ลากแหล่งอื่น */
export async function fanOutSync(timeoutMs = 25_000) {
  const jobs: Record<string, () => Promise<unknown>> = { div: syncDiv, driver: () => syncDriver() };
  const results = await Promise.allSettled(
    Object.entries(jobs).map(([k, fn]) =>
      Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${k}: เกินเวลา ${timeoutMs / 1000} วินาที`)), timeoutMs)),
      ]),
    ),
  );
  const keys = Object.keys(jobs);
  return results.map((r, i) => ({
    source: keys[i],
    ...(r.status === "fulfilled" ? (r.value as object) : { ok: false, message: String(r.reason?.message ?? r.reason) }),
  }));
}
