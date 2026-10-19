import { q } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { sourceStates } from "@/lib/sources";
import { graphConfigured } from "@/lib/graph";
import { outsourcePresent } from "@/lib/outsource";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [states, sites, recent, osRecent, osStaff, osPresent] = await Promise.all([
    sourceStates(),
    q(`SELECT site, count(*)::int AS n FROM div_checkins WHERE site IS NOT NULL GROUP BY site ORDER BY n DESC`),
    q(`SELECT response_id, email, full_name, gender, site, submitted_at, via
       FROM div_checkins ORDER BY submitted_at DESC LIMIT 30`),
    q(`SELECT a.emp_id, concat_ws(' ', s.first_name, s.last_name) AS name, s.cost_center, a.site, a.status, a.clock_in, a.clock_out, a.received_at
       FROM outsource_attendance a LEFT JOIN outsource_staff s USING (emp_id)
       ORDER BY a.received_at DESC LIMIT 30`),
    q(`SELECT count(*)::int AS n, max(updated_at) AS at FROM outsource_staff`),
    outsourcePresent(),
  ]);
  return ok({
    states, sites, recent, graph: graphConfigured(),
    outsource: { recent: osRecent, staff: osStaff[0]?.n ?? 0, staff_at: osStaff[0]?.at ?? null, present: osPresent.length,
      ingest: !!(process.env.INGEST_TOKEN_OS || process.env.INGEST_TOKEN_DIV) },
  });
});
