import { type NextRequest } from "next/server";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { isAdminRequest } from "@/lib/server/admin-auth";
import { prisma } from "@/lib/server/db";
import { getAllEvents, getRecentlyExpiredEvents } from "@/lib/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const defaults = [
  { id: "dcase", name: "Chicago DCASE" },
  { id: "cpl", name: "Chicago Public Library" },
  { id: "choose-chicago", name: "Choose Chicago" },
];

export async function GET(request: NextRequest) {
  const hasToken = request.headers.has("authorization") || request.headers.has("x-admin-token");
  if (hasToken && !isAdminRequest(request)) return apiError(401, "The administrator token was not accepted.");
  try {
    const [controls, latestRun, events, expired] = await Promise.all([
      prisma.sourceControl.findMany({ orderBy: { sourceName: "asc" } }),
      prisma.scrapeRun.findFirst({ where: { status: "SUCCESS" }, orderBy: { completedAt: "desc" }, include: { sourceResults: true } }),
      getAllEvents({ includeReview: true, includeExpired: true }),
      getRecentlyExpiredEvents(50),
    ]);
    const base = controls.length
      ? controls.map((item) => ({ id: item.sourceKey, name: item.sourceName, enabled: item.enabled, healthy: item.consecutiveErrors < 3, lastRunAt: item.lastAttemptAt?.toISOString(), lastSuccessAt: item.lastSuccessAt?.toISOString(), durationMs: item.averageDurationMs, error: item.lastError }))
      : defaults.map((item) => ({ ...item, enabled: true, healthy: true, durationMs: undefined as number | undefined, error: null as string | null }));
    const sources = base.map((source) => {
      const result = latestRun?.sourceResults.find((item) => item.sourceKey === source.id);
      return { ...source, fetched: result?.fetchedCount ?? 0, created: result?.createdCount ?? 0, updated: result?.updatedCount ?? 0, rejected: result?.rejectedCount ?? 0, deduplicated: result?.deduplicatedCount ?? 0, awaitingReview: result?.reviewCount ?? 0, durationMs: result?.durationMs ?? source.durationMs };
    });
    return noStoreJson({
      data: sources,
      sources,
      lastSuccessfulRun: latestRun?.completedAt?.toISOString() ?? null,
      summary: {
        recentlyExpired: expired.length,
        missingLocations: events.filter((event) => event.latitude === null || event.longitude === null).length,
        ambiguousFree: events.filter((event) => event.status === "review" || (event.freeConfidence > 0 && event.freeConfidence < 0.78)).length,
      },
    });
  } catch {
    const events = await getAllEvents({ includeReview: true, includeExpired: true });
    const sources = defaults.map((item) => ({ ...item, enabled: true, healthy: true, fetched: 0, created: 0, updated: 0, rejected: 0, deduplicated: 0, awaitingReview: 0 }));
    return noStoreJson({ data: sources, sources, lastSuccessfulRun: null, summary: { recentlyExpired: 0, missingLocations: events.filter((event) => event.latitude === null).length, ambiguousFree: events.filter((event) => event.status === "review").length } });
  }
}
