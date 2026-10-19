import { handle, ok, fail } from "@/lib/http";
import { storeCheckins } from "@/lib/sources";
import { normalizeGender, type FormCheckin } from "@/lib/parsers";

export const dynamic = "force-dynamic";

/** ทาง Premium: Power Automate ยิง HTTP POST เข้ามาตรงๆ (X-Sync-Token + X-Batch-Id) */
export const POST = handle(async (req: Request) => {
  const token = process.env.INGEST_TOKEN_DIV;
  if (!token || req.headers.get("x-sync-token") !== token) return fail("token ไม่ถูกต้อง", 401);
  const batch = req.headers.get("x-batch-id");
  if (!batch) return fail("ต้องมี X-Batch-Id");
  const body = await req.json();
  const records: any[] = Array.isArray(body.records) ? body.records : [body];
  const rows: FormCheckin[] = records
    .map((r) => ({
      response_id: String(r.response_id ?? r.ResponseId ?? "").trim(),
      email: String(r.email ?? r.Email ?? "").trim().toLowerCase(),
      full_name: r.full_name ?? r.FullName ?? null,
      gender: normalizeGender(r.gender ?? r.Gender),
      site: r.site ?? r.Site ?? null,
      submitted_at: new Date(r.submitted_at ?? r.SubmittedAt).toISOString(),
    }))
    .filter((r) => r.response_id && r.email.includes("@"));
  return ok(await storeCheckins(rows, "push", batch));
});
