import { handle, ok } from "@/lib/http";
import { syncDiv } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const POST = handle(async () => ok(await syncDiv()));
