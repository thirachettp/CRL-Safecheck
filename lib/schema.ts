// สร้างตารางแบบ idempotent — รันทุกครั้งที่ instance ตื่นครั้งแรก
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS evac_plan (
    emp_id          text PRIMARY KEY,
    prefix          text,
    first_name      text,
    last_name       text,
    gender          text,
    cost_center     text,
    area            text,
    assembly_point  text,
    flag_no         int,
    flag_no_old     int,
    role            text,
    source_file     text,
    updated_at      timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flag_leaders (
    flag_no         int PRIMARY KEY,
    assembly_point  text,
    flag_no_old     int,
    leader_name     text,
    cost_center     text,
    area            text,
    note            text
  )`,
  `CREATE TABLE IF NOT EXISTS person_links (
    email   text PRIMARY KEY,
    emp_id  text NOT NULL,
    source  text NOT NULL DEFAULT 'manual',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS ingest_raw (
    id          bigserial PRIMARY KEY,
    source      text NOT NULL,
    batch_id    text NOT NULL,
    payload     jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, batch_id)
  )`,
  `CREATE TABLE IF NOT EXISTS div_checkins (
    response_id   text PRIMARY KEY,
    email         text NOT NULL,
    full_name     text,
    gender        text,
    site          text,
    submitted_at  timestamptz NOT NULL,
    via           text NOT NULL DEFAULT 'graph',
    received_at   timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS div_checkins_email_time ON div_checkins (lower(email), submitted_at)`,
  `CREATE TABLE IF NOT EXISTS source_status (
    source        text PRIMARY KEY,
    last_ok_at    timestamptz,
    last_try_at   timestamptz,
    last_error    text,
    record_count  int,
    cursor        text
  )`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id          bigserial PRIMARY KEY,
    mode        text NOT NULL CHECK (mode IN ('real','drill')),
    title       text,
    div_sites   text[],
    include_plan boolean NOT NULL DEFAULT true,
    opened_at   timestamptz NOT NULL DEFAULT now(),
    closed_at   timestamptz,
    first_full_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS incident_people (
    incident_id   bigint NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    person_key    text NOT NULL,
    emp_id        text,
    email         text,
    name          text NOT NULL,
    gender        text,
    area          text,
    flag_no       int,
    assembly_point text,
    is_leader     boolean NOT NULL DEFAULT false,
    presence      text NOT NULL DEFAULT 'plan',
    presence_site text,
    presence_since timestamptz,
    still_in_source boolean NOT NULL DEFAULT true,
    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','safe','injured','trapped','absent')),
    status_by     text,
    status_at     timestamptz,
    added_by      text NOT NULL DEFAULT 'snapshot',
    added_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, person_key)
  )`,
  `CREATE TABLE IF NOT EXISTS status_log (
    id          bigserial PRIMARY KEY,
    incident_id bigint NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    person_key  text NOT NULL,
    from_status text,
    to_status   text NOT NULL,
    by_name     text,
    at          timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS driver_presence (
    plate         text PRIMARY KEY,
    plate_display text,
    driver_name   text,
    phone         text,
    company       text,
    zone          text,
    checkin_at    timestamptz,
    seen_at       timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key   text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS plate text`,

  // ---------- v2: ตาม mockup SafeCheck v1 ----------
  // แผนอพยพ: เก็บค่าจาก Excel ไว้เทียบความแม่นยำ + ร่องรอยการแก้จากหน้าตรวจทาน
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS tel text`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS orig_flag int`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS added_manually boolean NOT NULL DEFAULT false`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS edited_note text`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS edited_by text`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS edited_at timestamptz`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS removed boolean NOT NULL DEFAULT false`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS removed_reason text`,
  `ALTER TABLE evac_plan ADD COLUMN IF NOT EXISTS removed_by text`,
  `CREATE TABLE IF NOT EXISTS assembly_points (
    code      text PRIMARY KEY,
    name      text NOT NULL,
    backup    text,
    sort      int NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS flag_reviews (
    flag_no     int PRIMARY KEY,
    reviewed_by text,
    reviewed_at timestamptz NOT NULL DEFAULT now()
  )`,
  // มา / ไม่มา วันนี้ (ตั้งจากหน้าตรวจทาน) ใช้ตอน snapshot
  `CREATE TABLE IF NOT EXISTS attendance (
    person_key text NOT NULL,
    day        date NOT NULL,
    here       boolean NOT NULL,
    by_name    text,
    at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (person_key, day)
  )`,
  `CREATE TABLE IF NOT EXISTS plan_versions (
    id         serial PRIMARY KEY,
    note       text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    people     int NOT NULL,
    data       jsonb NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS confirmers (
    id        serial PRIMARY KEY,
    name      text NOT NULL,
    role      text NOT NULL CHECK (role IN ('admin','safety')),
    pin_hash  text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS announce_codes (
    id      serial PRIMARY KEY,
    label   text NOT NULL,
    meaning text,
    tone    text NOT NULL DEFAULT 'warn',
    closes  boolean NOT NULL DEFAULT false,
    sort    int NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    code       text PRIMARY KEY,
    name       text,
    gender     text,
    tel        text,
    emer_name  text,
    emer_tel   text,
    blood      text,
    consent_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // เหตุการณ์: แจ้ง → รอยืนยัน → เริ่ม → ปิด
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'active'`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS kind text`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS area text`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reported_by text`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS confirmed_by text`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS confirmed_at timestamptz`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS closed_points text[]`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS plan_version int`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS closed_by text`,
  `UPDATE incidents SET state = 'closed' WHERE state = 'active' AND closed_at IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS incident_announcements (
    id          bigserial PRIMARY KEY,
    incident_id bigint NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    code_id     int,
    label       text NOT NULL,
    tone        text,
    meaning     text,
    by_name     text,
    at          timestamptz NOT NULL DEFAULT now()
  )`,
  // สถานะคนตาม Flow: unk ยังไม่ทราบ, in ยังอยู่ในคลัง, safe, inj บาดเจ็บ, cmd กองอำนวยการกลาง,
  // abs ปลอดภัยตามระบบ (ไม่มา รอยืนยัน), gone ยืนยันไม่อยู่
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_people_status_check'
                    AND pg_get_constraintdef(oid) LIKE '%unk%') THEN
       ALTER TABLE incident_people DROP CONSTRAINT IF EXISTS incident_people_status_check;
       UPDATE incident_people SET status = CASE status WHEN 'pending' THEN 'unk' WHEN 'injured' THEN 'inj'
         WHEN 'trapped' THEN 'in' WHEN 'absent' THEN 'gone' ELSE status END;
       ALTER TABLE incident_people ALTER COLUMN status SET DEFAULT 'unk';
       ALTER TABLE incident_people ADD CONSTRAINT incident_people_status_check
         CHECK (status IN ('unk','in','safe','inj','cmd','abs','gone'));
     END IF;
   END $$`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS here boolean NOT NULL DEFAULT true`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS cost_center text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS cc_name text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS tel text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS source text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS status_note text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS triage text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS symptoms text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS hospital text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS triage_by text`,
  `ALTER TABLE incident_people ADD COLUMN IF NOT EXISTS done_at timestamptz`,
  // ---------- v3: บัญชีผู้ใช้ + master Cost Center ----------
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prefix text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cost_center text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`,
  `CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON profiles (lower(email)) WHERE email IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS cost_centers (
    code       text PRIMARY KEY,
    name       text NOT NULL,
    source     text NOT NULL DEFAULT 'master',
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // master ตั้งต้นจากชุดธง (ชื่อ = แผนกที่พบบ่อยที่สุดของ Cost Center นั้น)
  `INSERT INTO cost_centers (code, name, source)
   SELECT cost_center, COALESCE(mode() WITHIN GROUP (ORDER BY area), cost_center), 'master' FROM evac_plan
   WHERE cost_center IS NOT NULL AND cost_center <> '' GROUP BY cost_center
   ON CONFLICT (code) DO NOTHING`,
  `INSERT INTO announce_codes (label, meaning, tone, closes, sort)
   SELECT * FROM (VALUES ('Code 500', NULL::text, 'warn', false, 1), ('Code 500 ด่วนมาก', NULL::text, 'err', false, 2),
                         ('คุณสบายใจ', 'ใช้ปิดเหตุการณ์', 'grey', true, 3)) v
   WHERE NOT EXISTS (SELECT 1 FROM announce_codes)`,
  // v4 Outsource (Power Apps → SharePoint → Power Automate ส่งเข้า)
  `CREATE TABLE IF NOT EXISTS outsource_staff (
    emp_id      text PRIMARY KEY,
    first_name  text,
    last_name   text,
    cost_center text,
    updated_at  timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS outsource_attendance (
    item_id     text PRIMARY KEY,
    emp_id      text NOT NULL,
    clock_in    timestamptz,
    clock_out   timestamptz,
    status      text,
    site        text,
    received_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS outsource_attendance_emp ON outsource_attendance (emp_id, clock_in DESC)`,
  // v5 บัญชีผู้ใช้: รหัสผ่าน + บทบาท (user / safety / admin)
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pass_hash text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_pw boolean NOT NULL DEFAULT false`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until timestamptz`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pw_updated_at timestamptz`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_by text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
       ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user','safety','admin'));
     END IF;
   END $$`,
  // v5 บัญชีผู้ใช้: รหัสผ่าน (scrypt) + บทบาท
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_pw boolean NOT NULL DEFAULT false`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pw_ver int NOT NULL DEFAULT 0`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until timestamptz`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
       ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user','safety','admin'));
     END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS account_log (
    id         bigserial PRIMARY KEY,
    code       text NOT NULL,
    action     text NOT NULL,
    detail     text,
    by_code    text,
    at         timestamptz NOT NULL DEFAULT now()
  )`,
];
