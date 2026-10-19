import { q, one } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

/** ค้นหา Cost Center จาก master (รหัสหรือชื่อ) */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const term = (u.get("q") ?? "").trim();
  const code = (u.get("code") ?? "").trim();
  if (code) return ok({ items: await q(`SELECT code, name, source FROM cost_centers WHERE code = $1`, [code]) });
  const items = await q(
    `SELECT code, name, source FROM cost_centers
     WHERE $1 = '' OR code ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%'
     ORDER BY (code ILIKE $1 || '%') DESC, code LIMIT 20`, [term]);
  return ok({ items });
});

/** เพิ่ม Cost Center ใหม่ที่ยังไม่มีใน master (ผู้ใช้เพิ่มเองได้ Admin ตรวจภายหลังจาก source = 'user') */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const code = String(b.code ?? "").trim().toUpperCase().slice(0, 40);
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!/^[A-Z0-9._-]{2,40}$/.test(code)) return fail("รหัส Cost Center ใช้ตัวอักษรอังกฤษ/ตัวเลข 2–40 ตัว");
  if (!name) return fail("กรอกชื่อ Cost Center");
  const ex = await one<any>(`SELECT code, name, source FROM cost_centers WHERE upper(code) = $1`, [code]);
  if (ex) return ok({ item: ex, existed: true });
  const item = await one(
    `INSERT INTO cost_centers (code, name, source, created_by) VALUES ($1, $2, 'user', $3) RETURNING code, name, source`,
    [code, name, String(b.by ?? "").slice(0, 60) || null]);
  return ok({ item }, 201);
});
