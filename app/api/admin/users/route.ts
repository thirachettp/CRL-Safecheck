import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { listUsers, setRole, resetPassword } from "@/lib/account";

export const dynamic = "force-dynamic";

/** Admin จัดการผู้ใช้: ดูรายชื่อ ปรับบทบาท รีเซ็ตรหัสผ่าน (แก้ข้อมูลอื่นของผู้ใช้ไม่ได้) */
export const GET = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  return ok({ users: await listUsers(new URL(req.url).searchParams.get("q") ?? "") });
});

export const POST = handle(async (req: Request) => {
  const a = await requireRole(req, ["admin"]);
  const b = await req.json();
  const by = a.code ?? `PIN:${a.name}`;
  if (b.action === "role") return ok(await setRole(String(b.code), b.role, by));
  if (b.action === "reset") return ok(await resetPassword(String(b.code), by));
  return fail("ไม่รู้จักคำสั่ง");
});
