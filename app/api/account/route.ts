import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { changePassword } from "@/lib/account";

export const dynamic = "force-dynamic";

/** ข้อมูลเซสชันปัจจุบัน (ใช้เช็คบทบาทล่าสุดตอนเปิดแอป) */
export const GET = handle(async (req: Request) => ok(await requireUser(req)));

/** เปลี่ยนรหัสผ่านตัวเอง */
export const POST = handle(async (req: Request) => {
  const s = await requireUser(req);
  const b = await req.json();
  return ok(await changePassword(s.code, String(b.old ?? ""), String(b.password ?? "")));
});
