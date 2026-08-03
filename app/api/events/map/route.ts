import { type NextRequest } from "next/server";
import { ZodError } from "zod";
import { filterAndPaginateEvents, parseEventQuery } from "@/lib/events/filter";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { getAllEvents } from "@/lib/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = parseEventQuery({ ...params, page: 1, pageSize: Math.min(Number(params.limit ?? 500), 500) });
    const result = filterAndPaginateEvents(await getAllEvents(), query);
    const markers = result.items.filter((event) => event.latitude !== null && event.longitude !== null).map((event) => ({
      id: event.id,
      title: event.title,
      startDateTime: event.startDateTime,
      venueName: event.venueName,
      neighborhood: event.neighborhood,
      latitude: event.latitude,
      longitude: event.longitude,
      isFree: event.isFree,
      hasFreebie: event.freebieType.length > 0 && event.freebieAvailability !== "none",
      hasNotable: event.celebrityConfidence >= 0.65,
      hasCompany: event.companyConfidence >= 0.65,
      overallScore: event.overallScore,
    }));
    return noStoreJson({ data: markers, total: result.total, missingLocationCount: result.items.length - markers.length });
  } catch (error) {
    return error instanceof ZodError ? apiError(400, "Invalid map filters.", error.flatten()) : apiError(500, "Map events are temporarily unavailable.");
  }
}
