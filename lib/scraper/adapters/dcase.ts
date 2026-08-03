import type { AnyNode } from "domhandler";
import type { Cheerio } from "cheerio";

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
  "[data-dcase-event]",
  "article.dcase-event",
  "article.event-card",
  ".event-listing__item",
  ".cmp-list__item[data-event-id]",
].join(",");

export class DcaseAdapter extends BaseEventSourceAdapter {
  constructor() {
    super("dcase");
  }

  async fetchEvents(context: ScrapeContext): Promise<RawEvent[]> {
    const html = await context.fetchText(this.config.discoveryUrl, {
      signal: context.signal,
    });
    const structured = parseJsonLdEvents(html, {
      sourceId: this.id,
      pageUrl: this.config.discoveryUrl,
      defaultOrganizer:
        "Chicago Department of Cultural Affairs and Special Events",
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
          ".event-title a, .event-card__title a, h2 a, h3 a, a[data-event-title]",
        )
        .first();
      const eventUrl =
        absoluteHttpUrl(titleLink.attr("href"), this.config.discoveryUrl) ??
        this.config.discoveryUrl;
      const title =
        nullableText(titleLink.text()) ??
        firstText(card, [
          ".event-title",
          ".event-card__title",
          "[data-event-title]",
          "h2",
          "h3",
        ]);
      const startDateTime =
        card.attr("data-start") ??
        firstAttribute(
          card,
          [
            "time.event-start",
            "time[data-start]",
            "time[itemprop='startDate']",
            "time",
          ],
          "datetime",
        );
      const endDateTime =
        card.attr("data-end") ??
        firstAttribute(
          card,
          ["time.event-end", "time[data-end]", "time[itemprop='endDate']"],
          "datetime",
        );
      const description = firstText(card, [
        ".event-description",
        ".event-card__description",
        "[itemprop='description']",
        ".description",
      ]);
      const venueName = firstText(card, [
        ".event-venue",
        "[itemprop='location'] [itemprop='name']",
        "[data-event-venue]",
        ".venue",
      ]);
      const addressElement = card
        .find(
          "address, [itemprop='streetAddress'], [data-event-address]",
        )
        .first();
      const address = nullableText(addressElement.text());
      const priceText = firstText(card, [
        ".event-price",
        "[data-event-price]",
        "[itemprop='price']",
      ]);
      const registrationLink = card
        .find(
          "a.event-registration, a[data-registration-url], a[href*='register'], a[href*='rsvp']",
        )
        .first();
      const registrationUrl = absoluteHttpUrl(
        registrationLink.attr("href"),
        eventUrl,
      );
      const combinedText = card.text();

      candidates.push({
        sourceId: this.id,
        sourceEventId:
          card.attr("data-event-id") ??
          titleLink.attr("data-event-id") ??
          eventUrl,
        title: title ?? "",
        description,
        shortSummary: description,
        originalEventUrl: eventUrl,
        imageUrl: findImageUrl(card, this.config.discoveryUrl),
        startDateTime: startDateTime ?? "",
        endDateTime,
        timezone: CHICAGO_TIMEZONE,
        venueName,
        address,
        neighborhood:
          card.attr("data-neighborhood") ??
          firstText(card, [".event-neighborhood", "[data-neighborhood-name]"]),
        city: addressElement.attr("data-city") ?? "Chicago",
        state: addressElement.attr("data-state") ?? "IL",
        postalCode:
          addressElement.attr("data-postal-code") ??
          firstText(card, ["[itemprop='postalCode']"]),
        latitude: finiteAttribute(card.attr("data-latitude")),
        longitude: finiteAttribute(card.attr("data-longitude")),
        organizerName:
          firstText(card, [".event-organizer", "[itemprop='organizer']"]) ??
          "Chicago Department of Cultural Affairs and Special Events",
        organizerType: "GovernmentOrganization",
        registrationRequired: inferRegistrationRequired(
          combinedText,
          registrationUrl,
        ),
        registrationUrl,
        priceText,
        categories: collectTexts(card, [
          ".event-category",
          "[data-event-category]",
          "a[rel='tag']",
        ]),
        ageRestriction: firstText(card, [
          ".event-age",
          "[data-age-restriction]",
        ]),
        attendanceFormat: inferAttendanceFormat(combinedText),
        evidence: [
          ...(priceText
            ? [{ field: "price", text: priceText, url: eventUrl }]
            : []),
        ],
        rawMetadata: {
          extractionMethod: "static-html",
          sourceCardId: card.attr("data-event-id") ?? null,
        },
      });
    });

    return validatedRawEvents(candidates);
  }
}

function findImageUrl(
  card: Cheerio<AnyNode>,
  baseUrl: string,
): string | null {
  const image = card.find("img").first();
  return absoluteHttpUrl(
    image.attr("src") ?? image.attr("data-src"),
    baseUrl,
  );
}

function finiteAttribute(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const dcaseAdapter = new DcaseAdapter();
