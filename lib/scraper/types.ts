import { z } from "zod";

import type {
  JsonValue,
  NormalizedEvent,
  RawEvent as DomainRawEvent,
  ValidationResult,
} from "@/lib/events/types";
import type { EventSourceId, SourceConfig } from "../../config/sources";

export const CHICAGO_TIMEZONE = "America/Chicago";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "URL must use HTTP or HTTPS");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .nullish()
    .transform((value) => value ?? null);

const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const rawEvidenceSchema = z
  .object({
    field: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(1_000),
    url: httpUrlSchema.nullish().transform((value) => value ?? null),
  })
  .strict();

/**
 * Every adapter validates its extraction through this schema before data can
 * reach normalization, classification, or persistence.
 */
export const rawEventSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(64),
    sourceEventId: optionalText(256),
    title: z.string().trim().min(1).max(300),
    description: optionalText(20_000),
    shortSummary: optionalText(1_000),
    originalEventUrl: httpUrlSchema,
    imageUrl: httpUrlSchema.nullish().transform((value) => value ?? null),
    startDateTime: z.string().trim().min(1).max(120),
    endDateTime: optionalText(120),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default(CHICAGO_TIMEZONE),
    venueName: optionalText(300),
    address: optionalText(500),
    neighborhood: optionalText(120),
    city: optionalText(120),
    state: optionalText(80),
    postalCode: optionalText(20),
    latitude: z.number().min(-90).max(90).nullish().transform(nullable),
    longitude: z.number().min(-180).max(180).nullish().transform(nullable),
    organizerName: optionalText(300),
    organizerType: optionalText(80),
    registrationRequired: z.boolean().nullish().transform(nullable),
    registrationUrl: httpUrlSchema.nullish().transform((value) => value ?? null),
    priceText: optionalText(500),
    categories: z
      .array(z.string().trim().min(1).max(100))
      .max(30)
      .default([]),
    ageRestriction: optionalText(120),
    attendanceFormat: z
      .enum(["in-person", "online", "hybrid", "unknown"])
      .default("unknown"),
    evidence: z.array(rawEvidenceSchema).max(30).default([]),
    rawMetadata: z
      .record(z.string(), jsonValueSchema)
      .default({})
      .refine(
        (metadata) =>
          !Object.keys(metadata).some((key) =>
            /(?:raw_?html|page_?html|document_?html)/i.test(key),
          ),
        "Raw HTML is not permitted in extraction metadata",
      ),
  })
  .strict();

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export type SourceRawEvent = z.infer<typeof rawEventSchema>;
/**
 * Adapter extraction alias retained for the interface wording in source docs.
 * Domain `RawEvent` is imported from `@/lib/events/types` during normalization.
 */
export type RawEvent = SourceRawEvent;
export type RawEvidence = z.infer<typeof rawEvidenceSchema>;

export interface ScraperLogger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface FetchTextOptions {
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}

export interface ScrapeContext {
  source: SourceConfig;
  windowStart: Date;
  windowEnd: Date;
  limit?: number;
  signal?: AbortSignal;
  logger: ScraperLogger;
  fetchText(url: string | URL, options?: FetchTextOptions): Promise<string>;
}

export interface EventSourceAdapter {
  readonly id: EventSourceId;
  readonly sourceName: string;
  readonly sourceBaseUrl: string;
  fetchEvents(context: ScrapeContext): Promise<RawEvent[]>;
  normalizeEvent(rawEvent: RawEvent): Promise<NormalizedEvent>;
  validateEvent(event: NormalizedEvent): ValidationResult;
}

export interface ScrapeEventSink {
  upsert(
    event: NormalizedEvent,
  ): Promise<"created" | "updated" | "deduplicated" | "unchanged">;
}

export interface ScrapeRunLock {
  /**
   * Returns a release callback, or null when another worker owns the lock.
   * Production should implement this with a database advisory/lease lock.
   */
  acquire(): Promise<(() => Promise<void>) | null>;
}

export interface SourceScrapeResult {
  sourceId: EventSourceId;
  sourceName: string;
  success: boolean;
  fetched: number;
  normalized: number;
  created: number;
  updated: number;
  deduplicated: number;
  unchanged: number;
  rejected: number;
  events: NormalizedEvent[];
  errors: string[];
  durationMs: number;
}

export interface ScrapeRunResult {
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  results: SourceScrapeResult[];
}

export interface ScrapeRunRecorder {
  record(result: ScrapeRunResult): Promise<void>;
}

export type {
  DomainRawEvent,
  JsonValue,
  NormalizedEvent,
  ValidationResult,
};
