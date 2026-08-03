import {
  absoluteHttpUrl,
  collectTexts,
  firstAttribute,
  firstText,
  getDocumentRoot,
  nullableText,
  parseJsonLdEvents,
} from "../parsing";
import {
  CHICAGO_TIMEZONE,
  type RawEvent,
  type ScrapeContext,
} from "../types";
import { BaseEventSourceAdapter } from "./base";
import {
  deduplicateRawEvents,
  inferAttendanceFormat,
  inferRegistrationRequired,
  validatedRawEvents,
} from "./helpers";

const CARD_SELECTOR = [
  "[data-event-id]",
  "article.event-card",
  ".event-listing__card",
  ".events-list .card",
].join(",");

export class ChooseChicagoAdapter extends BaseEventSourceAdapter {
  constructor() {
    super("choose-chicago");
  }

  async fetchEvents(context: ScrapeContext): Promise<RawEvent[]> {
    const html = await context.fetchText(this.config.discoveryUrl, {
      signal: context.signal,
    });
    const structured = parseJsonLdEvents(html, {
      sourceId: this.id,
      pageUrl: this.config.discoveryUrl,
      defaultOrganizer: "Choose Chicago",
    });
    const cards = this.parseCards(html);
    const events = deduplicateRawEvents([...structured, ...cards]);

    return context.limit ? events.slice(0, context.limit) : events;
  }

  parseCards(html: string): RawEvent[] {
    const $ = getDocumentRoot(html);
    const candidates: Partial<RawEvent>[] = [];

    $(CARD_SELECTOR).each((_, element) => {
      const card = $(element);
      const titleLink = card
        .find(
          "h2 a, h3 a, .event-card__title a, a[data-event-title]",
        )
        .first();
      const eventUrl =
        absoluteHttpUrl(titleLink.attr("href"), this.config.discoveryUrl) ??
        this.config.discoveryUrl;
      const title =
        nullableText(titleLink.text()) ??
        firstText(card, [".event-card__title", "[data-event-title]", "h2", "h3"]);
      const startDateTime =
        card.attr("data-start") ??
        firstAttribute(
          card,
          ["time.event-start", "time[itemprop='startDate']", "time"],
          "datetime",
        );
      const endDateTime =
        card.attr("data-end") ??
        firstAttribute(
          card,
          ["time.event-end", "time[itemprop='endDate']"],
          "datetime",
        );
      const description = firstText(card, [
        ".event-card__description",
        "[data-event-description]",
        "[itemprop='description']",
      ]);
      const venueName = firstText(card, [
        ".event-card__venue",
        "[data-event-venue]",
        "[itemprop='location'] [itemprop='name']",
      ]);
      const addressElement = card.find("address, [data-event-address]").first();
      const registrationLink = card
        .find("a[href*='register'], a[href*='tickets'], a[data-registration-url]")
        .first();
      const registrationUrl = absoluteHttpUrl(
        registrationLink.attr("href"),
        eventUrl,
      );
      const combinedText = card.text();
      const priceText = firstText(card, [
        ".event-card__price",
        "[data-event-price]",
        ".admission",
      ]);

      candidates.push({
        sourceId: this.id,
        sourceEventId: card.attr("data-event-id") ?? eventUrl,
        title: title ?? "",
        description,
        shortSummary: description,
        originalEventUrl: eventUrl,
        imageUrl: absoluteHttpUrl(
          card.find("img").first().attr("src") ??
            card.find("img").first().attr("data-src"),
          this.config.discoveryUrl,
        ),
        startDateTime: startDateTime ?? "",
        endDateTime,
        timezone: CHICAGO_TIMEZONE,
        venueName,
        address: nullableText(addressElement.text()),
        neighborhood:
          card.attr("data-neighborhood") ??
          firstText(card, [".event-card__neighborhood", "[data-neighborhood]"]),
        city: addressElement.attr("data-city") ?? "Chicago",
        state: addressElement.attr("data-state") ?? "IL",
        postalCode: addressElement.attr("data-postal-code") ?? null,
        latitude: numberOrNull(card.attr("data-latitude")),
        longitude: numberOrNull(card.attr("data-longitude")),
        organizerName: firstText(card, [
          ".event-card__organizer",
          "[itemprop='organizer']",
        ]),
        organizerType: null,
        registrationRequired: inferRegistrationRequired(
          combinedText,
          registrationUrl,
        ),
        registrationUrl,
        priceText,
        categories: collectTexts(card, [
          ".event-card__category",
          "[data-event-category]",
          "a[rel='tag']",
        ]),
        ageRestriction: firstText(card, [
          ".event-card__age",
          "[data-age-restriction]",
        ]),
        attendanceFormat: inferAttendanceFormat(combinedText),
        evidence: priceText
          ? [{ field: "price", text: priceText, url: eventUrl }]
          : [],
        rawMetadata: {
          extractionMethod: "static-html-fallback",
          chooseChicagoEventId: card.attr("data-event-id") ?? null,
        },
      });
    });

    return validatedRawEvents(candidates);
  }
}

function numberOrNull(value: string | undefined): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : null;
}

export const chooseChicagoAdapter = new ChooseChicagoAdapter();
