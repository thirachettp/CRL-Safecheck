import { q, one } from "./db";
import { fetchListDelta, graphConfigured } from "./graph";
import { normalizeGender, type FormCheckin } from "./parsers";
import { fetchKiosk, fetchDpark, dparkEnabled, kioskConfigured } from "./kiosk";
import { detectFields, toVehicles, shouldHold, prepareRows, typeBreakdown, dparkFields, mergeDriverSources, normalizePlate, driverNames, nearPlate, type KioskFields, type Vehicle } from "./kioskMap";
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
    // 2 แหล่งพร้อมกัน: รายการลานจอด (dpark · มี freeMember) + รายการ visitor (มีชื่อ/เบอร์คนขับ)
    const [visR, dpR] = await Promise.allSettled([fetchKiosk(), dparkEnabled() ? fetchDpark() : Promise.reject(new Error("off"))]);
    if (visR.status === "rejected" && dpR.status === "rejected") throw visR.reason;
    const rows = visR.status === "fulfilled" ? prepareRows(visR.value) : [];
    const dpRows = dpR.status === "fulfilled" ? prepareRows(dpR.value) : null;
    await q(`INSERT INTO ingest_raw (source, batch_id, payload) VALUES ('driver', $1, $2) ON CONFLICT DO NOTHING`, [
      `kios-${Date.now()}`,
      JSON.stringify({ visitor: rows, dpark: dpRows }),
    ]);
    // ของดิบเก็บ 14 วันพอสำหรับตรวจย้อนหลัง
    await q(`DELETE FROM ingest_raw WHERE source = 'driver' AND received_at < now() - interval '14 days'`);

    const fields = detectFields(rows, kioskOverride());
    const dpF = dpRows ? dparkFields(dpRows) : null;
    const sampleKeys = rows[0] ? Object.keys(rows[0]) : [];
    // แยกตามรูปแบบการทำรายการ (freeMember / Visitor …) ไว้ตรวจว่าข้อมูลแต่ละแบบมาครบไหม
    const types = dpRows && dpF ? typeBreakdown(dpRows, dpF) : typeBreakdown(rows, fields);
    await setSetting("driver_fields", {
      fields, sampleKeys, sample: rows.slice(0, 3), types, total_rows: dpRows?.length ?? rows.length, at: new Date().toISOString(),
      dpark: dpRows ? { ok: true, fields: dpF, keys: dpRows[0] ? Object.keys(dpRows[0]) : [], rows: dpRows.length }
        : { ok: false, error: dpR.status === "rejected" ? String((dpR.reason as any)?.message ?? dpR.reason) : null },
      visitor: visR.status === "fulfilled" ? { ok: true, rows: rows.length } : { ok: false, error: String((visR.reason as any)?.message ?? visR.reason) },
    });
    if (!dpRows && rows.length && !fields.plate) {
      await markStatus("driver", false, null, "หาคอลัมน์ทะเบียนรถไม่เจอ ตั้ง KIOS_FIELD_MAP");
      return { ok: false, message: `หาคอลัมน์ทะเบียนรถไม่เจอ คอลัมน์ที่มี: ${sampleKeys.join(", ")}` };
    }
    const vis = toVehicles(rows, fields);
    let vehicles: Vehicle[] = vis.vehicles, skipped = vis.skipped, url = vis.url, old = vis.old, out = vis.out, visOnly = 0;
    if (dpRows && dpF) {
      const dp = toVehicles(dpRows, dpF);
      const seen = new Set<string>(dpRows.map((r) => normalizePlate((dpF.plate && r[dpF.plate]) || (dpF.plate_alt && r[dpF.plate_alt]) || "")).filter(Boolean));
      const m = mergeDriverSources(dp.vehicles, seen, vis.vehicles);
      vehicles = m.vehicles; visOnly = m.visOnly; skipped = dp.skipped; url = dp.url; old = dp.old; out = dp.out;
    }
    const notes = [
      dpRows ? `รายการลานจอด ${dpRows.length} แถว (รวม freeMember)` : `⚠️ ดึงรายการลานจอดไม่ได้ ใช้เฉพาะ visitor${dpR.status === "rejected" && String((dpR.reason as any)?.message) !== "off" ? ` (${String((dpR.reason as any)?.message).slice(0, 120)})` : ""}`,
      visR.status === "rejected" && "⚠️ ดึงรายการ visitor ไม่ได้ (ไม่มีชื่อ/เบอร์คนขับ)",
      visOnly && `visitor ที่ไม่มีในรายการลานจอด ${visOnly} คัน`,
      out && `ออกแล้ว (มีเวลาออก) ${out} คัน`, url && `ตัดทะเบียนที่เป็นลิงก์ ${url} แถว`, old && `ตัดรถที่เข้าลานเกิน 2 วัน ${old} คัน`,
      !dpRows && !fields.checkout_at && !fields.checkout_alt && "⚠️ หาคอลัมน์เวลาออกไม่เจอ นับทุกแถวว่ายังอยู่"].filter(Boolean).join(" · ");

    const prev = await one<{ n: number }>(`SELECT count(*)::int AS n FROM driver_presence WHERE src = 'api'`);
    if (!opts.force && shouldHold(prev?.n ?? 0, vehicles.length)) {
      const msg = `จำนวนรถลดจาก ${prev!.n} เหลือ ${vehicles.length} คัน (เกิน 30%) กักไว้ก่อน ยังใช้ข้อมูลรอบก่อน`;
      await markStatus("driver", false, null, msg);
      return { ok: false, held: true, count: vehicles.length, message: msg };
    }

    // แถวจาก API แทนที่ทั้งหมด · แถวจาก Excel (freeMember) เก็บไว้จนหมดอายุ 12 ชม. แต่ถ้า API มีทะเบียนนั้น ใช้ของ API
    // สมุดรายชื่อคนขับ: จำชื่อจาก visitor ทุกแถว (ไม่ทับที่ Admin ตั้งเอง) · เก็บ 90 วันหลังเห็นล่าสุด
    const names = driverNames(rows, fields);
    if (names.length) await q(
      `INSERT INTO driver_directory (plate, plate_display, driver_name, phone, company, source, last_seen)
       SELECT x.p, x.pd, x.n, x.ph, x.c, 'visitor', now() FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS x(p, pd, n, ph, c)
       ON CONFLICT (plate) DO UPDATE SET last_seen = now(),
         driver_name = CASE WHEN driver_directory.source = 'manual' THEN driver_directory.driver_name ELSE EXCLUDED.driver_name END,
         phone = CASE WHEN driver_directory.source = 'manual' THEN COALESCE(driver_directory.phone, EXCLUDED.phone) ELSE COALESCE(EXCLUDED.phone, driver_directory.phone) END,
         company = COALESCE(EXCLUDED.company, driver_directory.company)`,
      [names.map((n) => n.plate), names.map((n) => n.plate_display), names.map((n) => n.driver_name), names.map((n) => n.phone), names.map((n) => n.company)]);
    await q(`DELETE FROM driver_directory WHERE source = 'visitor' AND last_seen < now() - interval '90 days'`);
    // รถที่ไม่มีชื่อ (เช่น freeMember): เติมจากสมุดรายชื่อ
    const dir = await q<any>(`SELECT plate, driver_name, phone, company, source FROM driver_directory WHERE driver_name IS NOT NULL`);
    const nameSrc = new Map<string, string>();
    for (const v of vehicles) {
      if (v.driver_name) { nameSrc.set(v.plate, "visitor"); continue; }
      const key = v.plate.replace(/^ID-/, "");
      const d = dir.find((x) => nearPlate(x.plate, key));
      if (d) { v.driver_name = d.driver_name; v.phone = v.phone ?? d.phone; nameSrc.set(v.plate, d.source === "manual" ? "manual" : "history"); }
    }

    await q(`DELETE FROM driver_presence WHERE src = 'api' OR (src = 'xlsx' AND uploaded_at < now() - interval '12 hours')`);
    if (vehicles.length) {
      await q(
        `INSERT INTO driver_presence (plate, plate_display, driver_name, phone, company, zone, checkin_at, name_src)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[], $8::text[])
         ON CONFLICT (plate) DO UPDATE SET plate_display = EXCLUDED.plate_display, driver_name = EXCLUDED.driver_name, phone = EXCLUDED.phone,
           company = EXCLUDED.company, zone = EXCLUDED.zone, checkin_at = EXCLUDED.checkin_at, name_src = EXCLUDED.name_src, src = 'api', uploaded_at = NULL, seen_at = now()`,
        [
          vehicles.map((v) => v.plate), vehicles.map((v) => v.plate_display), vehicles.map((v) => v.driver_name),
          vehicles.map((v) => v.phone), vehicles.map((v) => v.company), vehicles.map((v) => v.zone),
          vehicles.map((v) => v.checkin_at), vehicles.map((v) => nameSrc.get(v.plate) ?? null),
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
