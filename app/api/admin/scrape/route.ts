import { spawn } from "node:child_process";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { isAdminRequest } from "@/lib/server/admin-auth";
import { getClientIdentifier, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ source: z.enum(["dcase", "cpl", "choose-chicago"]).optional(), limit: z.number().int().min(1).max(250).optional(), dryRun: z.boolean().optional() }).strict();
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return apiError(401, "A valid administrator token is required.");
  const gate = rateLimit(`admin-scrape:${getClientIdentifier(request)}`, { limit: 5, windowMs: 600_000 });
  if (!gate.allowed) return apiError(429, `Scrape requests are rate limited. Retry in ${gate.retryAfterSeconds} seconds.`);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "Invalid scrape request.", parsed.error.flatten());
  const args = ["run", "scrape", "--"];
  if (parsed.data.source) args.push(`--source=${parsed.data.source}`);
  if (parsed.data.limit) args.push(`--limit=${parsed.data.limit}`);
  if (parsed.data.dryRun) args.push("--dry-run");
  const child = spawn("npm", args, { cwd: process.cwd(), detached: true, stdio: "ignore", env: { ...process.env, SCRAPE_TRIGGER: "ADMIN" } });
  child.unref();
  return noStoreJson({ accepted: true, source: parsed.data.source ?? "all", message: "Scrape queued; the database lease prevents overlap." }, { status: 202 });
}
