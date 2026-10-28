import { handle, ok } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { announce, type CodeKind } from "@/lib/incident";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ประกาศ Code (Safety / Admin) เวลาบันทึกอัตโนมัติ แล้วแจ้งเตือนทุกคน */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const actor = await requireRole(req, ["admin", "safety"]);
  const id = Number((await params).id);
  const b = await req.json();
  const kinds: CodeKind[] = ["check", "urgent", "clear", "other"];
  const r = await announce(id, b.code_id ? Number(b.code_id) : null, b.label ?? null, actor, kinds.includes(b.kind) ? b.kind : null);
  const drill = r.inc.mode === "drill";
  const where = [r.inc.kind, r.inc.area].filter(Boolean).join(" · ");
  let body = [where, r.meaning].filter(Boolean).join(" · ");
  if (r.kind === "clear") body = r.closed
    ? `${where ? `${where} · ` : ""}สถานการณ์ปกติแล้ว · นับได้ ${r.closed.summary.safe + r.closed.summary.inj}/${r.closed.summary.pool} คน (${r.closed.summary.pct}%)`
    : `${where ? `${where} · ` : ""}ไม่ใช่เหตุฉุกเฉิน · ทำงานตามปกติ`;
  if (r.kind === "urgent") body = `${where ? `${where} · ` : ""}${r.meaning ? `${r.meaning} · ` : ""}ไปจุดรวมพลของธงคุณ แล้วกดปลอดภัยในแอป`;
  const pushed = await notify("all", {
    title: `📢 ${drill ? "(ซ้อม) " : ""}${r.label}`, body,
    url: r.kind === "urgent" ? "/search" : `/dashboard?id=${id}`, tag: `incident-${id}`, urgent: r.kind === "urgent" || r.kind === "check",
  }).catch(() => null);
  return ok({ ok: true, kind: r.kind, closed: !!r.closed, pushed });
});
