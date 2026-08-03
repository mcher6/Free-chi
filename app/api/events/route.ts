import { type NextRequest } from "next/server";
import { ZodError } from "zod";
import { filterAndPaginateEvents, parseEventQuery } from "@/lib/events/filter";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { toEventDto } from "@/lib/server/event-dto";
import { getAllEvents, type StoredEvent } from "@/lib/server/event-store";
import { getClientIdentifier, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = rateLimit(`events:${getClientIdentifier(request)}`, { limit: 180, windowMs: 60_000 });
  if (!gate.allowed) {
    const response = apiError(429, "Too many requests. Please slow down.");
    response.headers.set("Retry-After", String(gate.retryAfterSeconds));
    return response;
  }
  try {
    const query = parseEventQuery(request.nextUrl.searchParams);
    const events = await getAllEvents();
    const result = filterAndPaginateEvents(events, query);
    const items = result.items.map((event) => toEventDto(event as StoredEvent & { distanceMiles?: number }));
    const lastUpdated = events.map((event) => event.updatedAt).sort().at(-1) ?? null;
    return noStoreJson({
      data: items,
      events: items,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total, pageCount: result.totalPages, lastUpdated },
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      lastUpdated,
    });
  } catch (error) {
    if (error instanceof ZodError) return apiError(400, "Invalid event filters.", error.flatten());
    console.error("Event API failed:", error instanceof Error ? error.name : "UnknownError");
    return apiError(500, "Events are temporarily unavailable.");
  }
}
