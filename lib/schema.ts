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
];
