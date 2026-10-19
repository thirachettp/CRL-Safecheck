import { handle, ok, fail } from "@/lib/http";
import { login } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ใส่รหัส Admin / Safety Officer → token อายุ 12 ชม. */
export const POST = handle(async (req: Request) => {
  const { pin } = await req.json();
  const r = await login(pin);
  if (!r) return fail("รหัสไม่ถูกต้อง", 401);
  return ok(r);
});
