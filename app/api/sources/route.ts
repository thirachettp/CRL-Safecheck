import { q } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { sourceStates } from "@/lib/sources";
import { graphConfigured } from "@/lib/graph";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [states, sites, recent] = await Promise.all([
    sourceStates(),
    q(`SELECT site, count(*)::int AS n FROM div_checkins WHERE site IS NOT NULL GROUP BY site ORDER BY n DESC`),
    q(`SELECT response_id, email, full_name, gender, site, submitted_at, via
       FROM div_checkins ORDER BY submitted_at DESC LIMIT 30`),
  ]);
  return ok({ states, sites, recent, graph: graphConfigured() });
});
