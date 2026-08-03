import { z } from "zod";

import { GEOCODING_OUTBOUND_CONFIG } from "../../../config/sources";
import { AllowlistedFetcher } from "../fetcher";
import type {
  GeocodingProvider,
  GeocodingQuery,
  GeocodingResult,
} from "./cache";

const nominatimResultSchema = z
  .object({
    lat: z.string().regex(/^-?\d+(?:\.\d+)?$/),
    lon: z.string().regex(/^-?\d+(?:\.\d+)?$/),
    display_name: z.string().trim().min(1).max(1_000),
    importance: z.number().min(0).max(1).optional(),
    address: z
      .object({
        neighbourhood: z.string().optional(),
        neighborhood: z.string().optional(),
        suburb: z.string().optional(),
        quarter: z.string().optional(),
        city: z.string().optional(),
        town: z.string().optional(),
        state: z.string().optional(),
        postcode: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const nominatimResponseSchema = z.array(nominatimResultSchema).max(5);

export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly id = "openstreetmap-nominatim";

  constructor(private readonly fetcher = new AllowlistedFetcher()) {}

  async geocode(query: GeocodingQuery): Promise<GeocodingResult | null> {
    const url = new URL(GEOCODING_OUTBOUND_CONFIG.discoveryUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "us");
    if (process.env.NOMINATIM_EMAIL) {
      url.searchParams.set("email", process.env.NOMINATIM_EMAIL);
    }
    // west,north,east,south; bounded prevents silent placement far away.
    url.searchParams.set("viewbox", "-88.10,42.15,-87.30,41.55");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("q", formatQuery(query));

    const raw = await this.fetcher.fetchJson(url, GEOCODING_OUTBOUND_CONFIG);
    const parsed = nominatimResponseSchema.parse(raw);
    const match = parsed.find((candidate) => {
      const city = candidate.address?.city ?? candidate.address?.town ?? "";
      return !city || /chicago/i.test(city);
    });

    if (!match) {
      return null;
    }

    const latitude = Number(match.lat);
    const longitude = Number(match.lon);
    const insideChicagoArea =
      latitude >= 41.55 &&
      latitude <= 42.15 &&
      longitude >= -88.1 &&
      longitude <= -87.3;

    return {
      latitude,
      longitude,
      formattedAddress: match.display_name,
      neighborhood:
        match.address?.neighbourhood ??
        match.address?.neighborhood ??
        match.address?.quarter ??
        match.address?.suburb ??
        null,
      confidence: Math.max(
        0.2,
        Math.min(0.95, (match.importance ?? 0.45) + 0.2),
      ),
      questionable: !insideChicagoArea,
      provider: this.id,
    };
  }
}

function formatQuery(query: GeocodingQuery): string {
  return [
    query.venueName,
    query.address,
    query.city ?? "Chicago",
    query.state ?? "IL",
    query.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}
