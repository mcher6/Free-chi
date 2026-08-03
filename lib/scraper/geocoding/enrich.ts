import { applyEventRanking } from "@/lib/events/rank";
import type {
  JsonObject,
  NormalizedEvent,
} from "@/lib/events/types";

import type {
  GeocodingQuery,
  GeocodingResult,
} from "./cache";

const VAGUE_ADDRESS = /^(?:chicago|citywide|online|virtual|tba|tbd|to be announced|various locations?)$/i;

export interface EventLocationGeocoder {
  geocode(query: GeocodingQuery): Promise<GeocodingResult | null>;
}

export interface EventGeocodingOptions {
  now?: Date;
  onError?: (error: unknown, event: NormalizedEvent) => void;
}

/**
 * Enriches only in-person events that have a usable published address and no
 * existing coordinate pair. A miss or provider failure keeps the event's
 * original missing-location semantics so it remains visible in the UI's
 * location-confirmation section.
 */
export async function enrichEventLocation(
  event: NormalizedEvent,
  geocoder: EventLocationGeocoder,
  options: EventGeocodingOptions = {},
): Promise<NormalizedEvent> {
  if (!shouldGeocodeEvent(event)) {
    return event;
  }

  const attemptedAt = (options.now ?? new Date()).toISOString();

  try {
    const result = await geocoder.geocode({
      address: event.address!,
      venueName: event.venueName,
      city: event.city,
      state: event.state,
      postalCode: event.postalCode,
    });

    if (!result) {
      return withGeocodingMetadata(event, {
        status: "not_found",
        attemptedAt,
      });
    }

    assertCoordinateResult(result);
    const questionable = result.questionable || result.confidence < 0.6;
    const enriched: NormalizedEvent = {
      ...event,
      latitude: result.latitude,
      longitude: result.longitude,
      neighborhood: event.neighborhood ?? result.neighborhood,
      locationQuality: questionable ? "questionable" : "confirmed",
      evidence: [
        ...event.evidence,
        {
          type: "location",
          label: questionable
            ? "Geocoded location needs confirmation"
            : "Address geocoded",
          excerpt: result.formattedAddress,
          sourceField: "address",
          confidence: clampConfidence(result.confidence),
          metadata: {
            provider: result.provider,
            questionable,
          },
        },
      ],
      rawMetadata: {
        ...event.rawMetadata,
        geocoding: {
          status: "resolved",
          attemptedAt,
          provider: result.provider,
          confidence: clampConfidence(result.confidence),
          formattedAddress: result.formattedAddress,
          questionable,
        },
      },
    };

    return applyEventRanking(enriched, {
      now: validDate(event.scrapedAt) ?? options.now ?? new Date(),
    });
  } catch (error) {
    try {
      options.onError?.(error, event);
    } catch {
      // Observability must not turn an isolated provider failure into an event
      // persistence failure.
    }

    return withGeocodingMetadata(event, {
      status: "error",
      attemptedAt,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export function shouldGeocodeEvent(event: NormalizedEvent): boolean {
  if (
    event.attendanceFormat === "online" ||
    event.locationQuality === "online" ||
    (event.latitude !== null && event.longitude !== null)
  ) {
    return false;
  }

  const address = event.address?.replace(/\s+/g, " ").trim() ?? "";
  return address.length >= 5 && !VAGUE_ADDRESS.test(address);
}

function withGeocodingMetadata(
  event: NormalizedEvent,
  metadata: JsonObject,
): NormalizedEvent {
  return {
    ...event,
    rawMetadata: {
      ...event.rawMetadata,
      geocoding: metadata,
    },
  };
}

function assertCoordinateResult(result: GeocodingResult): void {
  if (
    !Number.isFinite(result.latitude) ||
    !Number.isFinite(result.longitude) ||
    result.latitude < -90 ||
    result.latitude > 90 ||
    result.longitude < -180 ||
    result.longitude > 180
  ) {
    throw new TypeError("Geocoding provider returned invalid coordinates");
  }
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
}
