import { z } from "zod";
import { parseEventDate } from "./dates";
import type { EventQuery, EventRecord, JsonObject, RawEvent, ValidationResult } from "./types";

const confidence = z.number().min(0).max(1);
const safeUrl = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "URL must use HTTP or HTTPS");
const isoDate = z.string().refine((value) => parseEventDate(value) !== null, "Invalid date/time");
const sourceDate = z.union([z.date().refine((value) => !Number.isNaN(value.getTime())), z.string().min(1).refine((value) => parseEventDate(value) !== null, "Invalid date/time")]);
const jsonObject = z.record(z.string(), z.unknown());

export const organizerTypeSchema = z.enum(["government", "nonprofit", "company", "university", "cultural_institution", "community", "individual", "unknown"]);
export const attendanceFormatSchema = z.enum(["in_person", "online", "hybrid", "unknown"]);
export const environmentSchema = z.enum(["indoor", "outdoor", "mixed", "unknown"]);
export const freebieTypeSchema = z.enum(["food", "drinks", "alcohol_samples", "beauty_products", "clothing", "merchandise", "gift_bag", "technology_products", "product_samples", "fitness_class", "professional_headshots", "health_screening", "museum_admission", "tickets", "transportation", "parking", "services", "discounts", "sweepstakes_or_raffle", "unknown"]);

export const eventEvidenceSchema = z.object({
  type: z.enum(["free", "freebie", "notable", "company", "location", "source", "ranking"]),
  label: z.string().min(1).max(160), excerpt: z.string().min(1).max(1_000),
  sourceField: z.string().max(80).optional(), sourceUrl: safeUrl.optional(), confidence,
  metadata: jsonObject.optional(),
});
export const eventSourceLinkSchema = z.object({ sourceName: z.string().trim().min(1).max(160), url: safeUrl, isPrimary: z.boolean(), reliability: confidence, firstSeenAt: isoDate.optional(), lastSeenAt: isoDate.optional() });

export const rawEventSchema: z.ZodType<RawEvent> = z.object({
  externalId: z.string().max(300).nullable().optional(), title: z.string().trim().min(3).max(400),
  description: z.string().max(100_000).nullable().optional(), shortSummary: z.string().max(1_000).nullable().optional(),
  sourceName: z.string().trim().min(1).max(160), sourceUrl: safeUrl,
  originalEventUrl: safeUrl.nullable().optional(), canonicalUrl: safeUrl.nullable().optional(), imageUrl: safeUrl.nullable().optional(),
  startDateTime: sourceDate, endDateTime: sourceDate.nullable().optional(), timezone: z.string().min(1).max(80).nullable().optional(),
  venueName: z.string().max(300).nullable().optional(), address: z.string().max(500).nullable().optional(), neighborhood: z.string().max(160).nullable().optional(),
  city: z.string().max(160).nullable().optional(), state: z.string().max(80).nullable().optional(), postalCode: z.string().max(20).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(),
  organizerName: z.string().max(300).nullable().optional(), organizerType: organizerTypeSchema.nullable().optional(),
  registrationRequired: z.boolean().nullable().optional(), registrationUrl: safeUrl.nullable().optional(), priceText: z.string().max(1_000).nullable().optional(),
  officialFreeCategory: z.boolean().optional(), ticketPrices: z.array(z.number().min(0).max(1_000_000)).max(100).optional(), freebieText: z.string().max(5_000).nullable().optional(),
  speakerNames: z.array(z.string().min(2).max(160)).max(100).optional(), performerNames: z.array(z.string().min(2).max(160)).max(100).optional(), hostNames: z.array(z.string().min(2).max(200)).max(100).optional(),
  sponsorNames: z.array(z.string().min(2).max(200)).max(100).optional(), exhibitorNames: z.array(z.string().min(2).max(200)).max(200).optional(), giveawayProviders: z.array(z.string().min(2).max(200)).max(100).optional(),
  eventCategories: z.array(z.string().min(1).max(100)).max(100).optional(), ageRestriction: z.string().max(100).nullable().optional(), attendanceFormat: attendanceFormatSchema.nullable().optional(), environment: environmentSchema.nullable().optional(),
  familyFriendly: z.boolean().nullable().optional(), capacityLimited: z.boolean().optional(), sourceReliability: confidence.optional(), rawMetadata: jsonObject.optional() as z.ZodType<JsonObject>, seedLabel: z.string().max(160).nullable().optional(),
}).superRefine((event, context) => {
  if ((event.latitude == null) !== (event.longitude == null)) context.addIssue({ code: "custom", message: "Latitude and longitude must be provided together", path: ["latitude"] });
  const start = parseEventDate(event.startDateTime, { timezone: event.timezone ?? undefined });
  const end = event.endDateTime ? parseEventDate(event.endDateTime, { timezone: event.timezone ?? undefined }) : null;
  if (start && end && end < start) context.addIssue({ code: "custom", message: "End date/time cannot be before start date/time", path: ["endDateTime"] });
}) as z.ZodType<RawEvent>;

const notableLabel = z.enum(["confirmed_appearance", "listed_speaker_or_performer", "possible_notable_guest", "unverified_mention", "none"]);
const companyRelationship = z.enum(["hosted_by", "sponsored_by", "featuring", "exhibiting", "giveaway_provider", "mentioned_only"]);

export const normalizedEventSchema: z.ZodType<EventRecord> = z.object({
  id: z.string().min(1).max(300), title: z.string().trim().min(3).max(400), normalizedTitle: z.string().min(1).max(400),
  description: z.string().max(50_000).nullable(), shortSummary: z.string().max(600).nullable(), sourceName: z.string().trim().min(1).max(160),
  sourceUrl: safeUrl, originalEventUrl: safeUrl, canonicalUrl: safeUrl.nullable(), sourceLinks: z.array(eventSourceLinkSchema).min(1).max(50), imageUrl: safeUrl.nullable(),
  startDateTime: isoDate, endDateTime: isoDate.nullable(), timezone: z.string().min(1).max(80), venueName: z.string().max(300).nullable(), address: z.string().max(500).nullable(),
  neighborhood: z.string().max(160).nullable(), city: z.string().min(1).max(160), state: z.string().min(1).max(80), postalCode: z.string().max(20).nullable(),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), locationQuality: z.enum(["confirmed", "questionable", "missing", "online"]),
  organizerName: z.string().max(300).nullable(), organizerType: organizerTypeSchema, registrationRequired: z.boolean(), registrationUrl: safeUrl.nullable(), priceText: z.string().max(1_000).nullable(),
  isFree: z.boolean(), freeConfidence: confidence, freeExplanation: z.string().min(1).max(1_000), freebieType: z.array(freebieTypeSchema).max(20), freebieDescription: z.string().max(1_000).nullable(),
  freebieAvailability: z.enum(["guaranteed", "limited", "raffle", "vague", "none"]), freebieConfidence: confidence,
  celebrityNames: z.array(z.string().min(2).max(160)).max(100), celebrityConfidence: confidence, celebrityLabel: notableLabel,
  notablePeople: z.array(z.object({ name: z.string().min(2).max(160), role: z.string().min(1).max(100), label: notableLabel, confidence, evidence: z.string().min(1).max(1_000) })).max(100),
  companyNames: z.array(z.string().min(1).max(200)).max(200), companyConfidence: confidence,
  companyInvolvement: z.array(z.object({ name: z.string().min(1).max(200), relationship: companyRelationship, confidence, evidence: z.string().min(1).max(1_000) })).max(200),
  eventCategories: z.array(z.string().min(1).max(100)).max(100), ageRestriction: z.string().max(100).nullable(), attendanceFormat: attendanceFormatSchema, environment: environmentSchema,
  familyFriendly: z.boolean().nullable(), capacityLimited: z.boolean(), status: z.enum(["draft", "review", "published", "rejected", "cancelled", "expired"]),
  firstSeenAt: isoDate, lastSeenAt: isoDate, scrapedAt: isoDate, sourceReliability: confidence, uniquenessScore: confidence, overallScore: z.number().min(0).max(100),
  rankingExplanation: z.array(z.string().min(1).max(500)).max(20), deduplicationKey: z.string().min(1).max(500), evidence: z.array(eventEvidenceSchema).max(500),
  rawMetadata: jsonObject as z.ZodType<JsonObject>, seedLabel: z.string().max(160).nullable(),
}).superRefine((event, context) => {
  if ((event.latitude === null) !== (event.longitude === null)) context.addIssue({ code: "custom", message: "Latitude and longitude must be provided together", path: ["latitude"] });
  const start = parseEventDate(event.startDateTime); const end = event.endDateTime ? parseEventDate(event.endDateTime) : null;
  if (start && end && end < start) context.addIssue({ code: "custom", message: "End date/time cannot be before start date/time", path: ["endDateTime"] });
  if (event.locationQuality === "confirmed" && event.latitude === null) context.addIssue({ code: "custom", message: "Confirmed locations require coordinates", path: ["locationQuality"] });
}) as z.ZodType<EventRecord>;

const queryBoolean = z.preprocess((value) => value === "true" || value === "1" ? true : value === "false" || value === "0" ? false : value, z.boolean());
const queryArray = z.preprocess((value) => typeof value === "string" ? value.split(",").map((v) => v.trim()).filter(Boolean) : value, z.array(z.string().trim().min(1)).max(100));

export const eventQuerySchema: z.ZodType<EventQuery> = z.object({
  search: z.string().trim().max(200).optional(), datePreset: z.enum(["today", "tomorrow", "weekend", "next_7_days"]).optional(), dateFrom: isoDate.optional(), dateTo: isoDate.optional(),
  neighborhoods: queryArray.optional(), latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional(), distanceMiles: z.coerce.number().positive().max(250).optional(),
  categories: queryArray.optional(), freeOnly: queryBoolean.optional(), hasFreebie: queryBoolean.optional(), hasNotable: queryBoolean.optional(), hasCompany: queryBoolean.optional(), registrationRequired: queryBoolean.optional(),
  ageRestriction: z.string().trim().max(100).optional(), environment: environmentSchema.optional(), familyFriendly: queryBoolean.optional(), sources: queryArray.optional(), minimumConfidence: z.coerce.number().min(0).max(1).optional(),
  sort: z.enum(["best", "soonest", "closest", "most_notable", "best_freebies", "newly_discovered"]).optional(), page: z.coerce.number().int().min(1).max(100_000).optional(), pageSize: z.coerce.number().int().min(1).max(500).optional(),
}).superRefine((query, context) => {
  const lat = query.latitude !== undefined; const lng = query.longitude !== undefined;
  if (lat !== lng) context.addIssue({ code: "custom", message: "Latitude and longitude must be provided together", path: [lat ? "longitude" : "latitude"] });
  if (query.distanceMiles !== undefined && (!lat || !lng)) context.addIssue({ code: "custom", message: "Distance filtering requires latitude and longitude", path: ["distanceMiles"] });
  const from = query.dateFrom ? parseEventDate(query.dateFrom) : null; const to = query.dateTo ? parseEventDate(query.dateTo) : null;
  if (from && to && to < from) context.addIssue({ code: "custom", message: "dateTo cannot be before dateFrom", path: ["dateTo"] });
}) as z.ZodType<EventQuery>;

export interface EventValidationOptions { now?: Date; allowExpired?: boolean; maxFutureDays?: number; }
export function validateNormalizedEvent(input: unknown, options: EventValidationOptions = {}): ValidationResult {
  const parsed = normalizedEventSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "event"}: ${issue.message}`), warnings: [] };
  const event = parsed.data; const errors: string[] = []; const warnings: string[] = []; const now = options.now ?? new Date(); const start = new Date(event.startDateTime); const max = options.maxFutureDays ?? 400;
  if (!options.allowExpired && start.getTime() < now.getTime() - 86_400_000) errors.push("startDateTime: event is expired");
  if (start.getTime() > now.getTime() + max * 86_400_000) errors.push(`startDateTime: event is more than ${max} days away`);
  if (!event.address && event.attendanceFormat === "in_person") warnings.push("In-person event is missing an address");
  if (!event.description) warnings.push("Event is missing a description");
  if (!event.priceText && event.freeConfidence < 0.78) warnings.push("Pricing needs confirmation");
  return { valid: errors.length === 0, errors, warnings };
}
export const validateEvent = validateNormalizedEvent;
