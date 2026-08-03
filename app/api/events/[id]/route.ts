import { type NextRequest } from "next/server";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { toEventDto } from "@/lib/server/event-dto";
import { getAllEvents, getEventById } from "@/lib/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return apiError(400, "Invalid event identifier.");
  const event = await getEventById(id);
  if (!event || event.status !== "published") return apiError(404, "Event not found.");
  const categories = new Set(event.eventCategories.map((value) => value.toLowerCase()));
  const similar = (await getAllEvents())
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => ({ candidate, relevance: candidate.eventCategories.filter((category) => categories.has(category.toLowerCase())).length * 3 + (candidate.neighborhood === event.neighborhood ? 2 : 0) + candidate.overallScore / 100 }))
    .filter(({ relevance }) => relevance > 0.5)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map(({ candidate }) => toEventDto(candidate));
  const dto = toEventDto(event, { detail: true });
  return noStoreJson({ data: dto, event: dto, similar });
}
