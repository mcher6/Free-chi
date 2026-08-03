import sanitizeHtml from "sanitize-html";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson } from "@/lib/server/api-response";
import { isAdminRequest } from "@/lib/server/admin-auth";
import { prisma } from "@/lib/server/db";
import { toEventDto } from "@/lib/server/event-dto";
import { toStoredEvent } from "@/lib/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  title: z.string().trim().min(3).max(400).optional(),
  description: z.string().max(50_000).optional(),
  shortSummary: z.string().max(600).optional(),
  startDateTime: z.string().datetime().optional(),
  endDateTime: z.string().datetime().nullable().optional(),
  venueName: z.string().max(300).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  neighborhood: z.string().max(160).nullable().optional(),
  latitude: z.number().min(40).max(43).nullable().optional(),
  longitude: z.number().min(-89).max(-86).nullable().optional(),
  registrationRequired: z.boolean().optional(),
  registrationUrl: z.string().url().nullable().optional(),
  priceText: z.string().max(1000).nullable().optional(),
  isFree: z.boolean().optional(),
  freeConfidence: z.number().min(0).max(1).optional(),
  freeExplanation: z.string().max(1000).optional(),
  overallScore: z.number().int().min(0).max(100).optional(),
  status: z.enum(["review", "published", "rejected", "cancelled", "expired"]).optional(),
  duplicateOfId: z.string().min(1).optional(),
}).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return apiError(401, "A valid administrator token is required.");
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid event changes.", parsed.error.flatten());
  if (parsed.data.duplicateOfId) {
    if (parsed.data.duplicateOfId === id) return apiError(400, "An event cannot duplicate itself.");
    const primaryId = parsed.data.duplicateOfId;
    const merged = await prisma.$transaction(async (tx) => {
      const [primary, duplicate] = await Promise.all([
        tx.event.findUnique({ where: { id: primaryId }, include: { sourceLinks: true } }),
        tx.event.findUnique({ where: { id }, include: { sourceLinks: true } }),
      ]);
      if (!primary || !duplicate) return null;
      for (const source of duplicate.sourceLinks) await tx.eventSourceLink.upsert({
        where: { eventId_originalEventUrl: { eventId: primary.id, originalEventUrl: source.originalEventUrl } },
        update: { lastSeenAt: new Date() },
        create: { eventId: primary.id, sourceName: source.sourceName, sourceUrl: source.sourceUrl, originalEventUrl: source.originalEventUrl, isPrimary: false, evidence: source.evidence ?? undefined },
      });
      await tx.event.delete({ where: { id } });
      return tx.event.findUnique({ where: { id: primary.id }, include: { sourceLinks: true } });
    });
    if (!merged) return apiError(404, "One or both events were not found.");
    return noStoreJson({ data: toEventDto(toStoredEvent(merged), { detail: true }), mergedDuplicateId: id });
  }
  const { status, startDateTime, endDateTime, description, ...rest } = parsed.data;
  try {
    const event = await prisma.event.update({
      where: { id },
      data: {
        ...rest,
        ...(status ? { status: status.toUpperCase() } : {}),
        ...(startDateTime ? { startDateTime: new Date(startDateTime) } : {}),
        ...(endDateTime !== undefined ? { endDateTime: endDateTime ? new Date(endDateTime) : null } : {}),
        ...(description !== undefined ? { description: sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} }).trim() } : {}),
        ...(parsed.data.latitude === null ? { locationQuality: "missing", locationConfidence: 0 } : parsed.data.latitude !== undefined ? { locationQuality: "confirmed", locationConfidence: 0.95 } : {}),
      },
      include: { sourceLinks: true },
    });
    return noStoreJson({ data: toEventDto(toStoredEvent(event), { detail: true }) });
  } catch { return apiError(404, "Event not found."); }
}
