import { q } from "@/lib/db";
import { handle, ok, fail } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { cleanKinds, DEFAULT_KINDS } from "@/lib/codes";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok({
  codes: await q(`SELECT * FROM announce_codes ORDER BY sort, id`),
  kinds: cleanKinds(await getSetting("incident_kinds", DEFAULT_KINDS)),
}));

/** รายการ Code ประกาศ */
export const POST = handle(async (req: Request) => {
  await requireRole(req, ["admin"]);
  const b = await req.json();
  if (b.action === "kinds") {
    const cfg = cleanKinds(b.cfg);
    await setSetting("incident_kinds", cfg);
    return ok({ kinds: cfg });
  }
  if (b.action === "delete") {
    await q(`DELETE FROM announce_codes WHERE id = $1`, [Number(b.id)]);
    return ok({ deleted: true });
  }
  if (!String(b.label ?? "").trim()) return fail("ระบุชื่อ Code");
  const tone = ["warn", "err", "grey"].includes(b.tone) ? b.tone : "warn";
  if (b.id) {
    await q(`UPDATE announce_codes SET label = $2, meaning = $3, tone = $4, closes = $5 WHERE id = $1`,
      [Number(b.id), b.label.trim(), b.meaning || null, tone, !!b.closes]);
  } else {
    await q(`INSERT INTO announce_codes (label, meaning, tone, closes, sort)
             VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(sort), 0) + 1 FROM announce_codes))`,
      [b.label.trim(), b.meaning || null, tone, !!b.closes]);
  }
  return ok({ saved: true });
});
