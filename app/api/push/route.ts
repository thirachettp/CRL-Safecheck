import { handle, ok, fail } from "@/lib/http";
import { actorOf, sessionOf, requireRole } from "@/lib/auth";
import { vapidKeys, saveSub, removeSub, notify, pushStats } from "@/lib/push";

export const dynamic = "force-dynamic";

/** กุญแจสาธารณะสำหรับสมัครรับแจ้งเตือน (+ จำนวนเครื่องสำหรับ Admin) */
export const GET = handle(async (req: Request) => {
  const k = await vapidKeys();
  const admin = await requireRole(req, ["admin"]).catch(() => null);
  return ok({ publicKey: k.publicKey, ...(admin ? { stats: await pushStats() } : {}) });
});

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const s = await sessionOf(req);
  const pin = actorOf(req);
  switch (b.action) {
    case "subscribe":
      await saveSub(b.subscription, { code: s?.code ?? null, role: s?.role ?? pin?.role ?? null }, req.headers.get("user-agent"));
      return ok({ ok: true });
    case "unsubscribe":
      await removeSub(String(b.endpoint ?? ""));
      return ok({ ok: true });
    case "test":
      // ทดสอบส่งหาเครื่องนี้
      return ok(await notify({ endpoint: String(b.endpoint ?? "") }, {
        title: "ทดสอบแจ้งเตือน · CRL SafeCheck", body: `แจ้งเตือนทำงานปกติ ${new Date().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}`,
        url: "/", tag: "test" }));
    case "test-all": {
      const a = await requireRole(req, ["admin"]);
      const to = b.to === "staff" ? "staff" : "all";
      return ok(await notify(to, { title: "ทดสอบแจ้งเตือน (ไม่ใช่เหตุจริง)", body: `ส่งโดย ${a.name} · ${to === "staff" ? "เฉพาะ Admin / Safety" : "ทุกคน"}`, url: "/", tag: "test-all" }));
    }
  }
  return fail("ไม่รู้จักคำสั่ง");
});
