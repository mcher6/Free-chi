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
  "article.cp-event-card",
  "li.cp-event-card",
  ".cp-events-search-item",
  "[data-key='eventSearchResult']",
].join(",");

export class ChicagoPublicLibraryAdapter extends BaseEventSourceAdapter {
  constructor() {
    super("cpl");
  }

  async fetchEvents(context: ScrapeContext): Promise<RawEvent[]> {
    const url = new URL(this.config.discoveryUrl);
    url.searchParams.set("page", "1");

    const html = await context.fetchText(url, { signal: context.signal });
    const structured = parseJsonLdEvents(html, {
      sourceId: this.id,
      pageUrl: url.toString(),
      defaultOrganizer: "Chicago Public Library",
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
          "h2 a[href*='/events/'], h3 a[href*='/events/'], a.event-title, a[data-event-title]",
        )
        .first();
      const title =
        nullableText(titleLink.text()) ??
        firstText(card, ["[data-event-title]", ".event-title", "h2", "h3"]);
      const eventUrl =
        absoluteHttpUrl(titleLink.attr("href"), this.config.discoveryUrl) ??
        this.config.discoveryUrl;
      const startDateTime =
        card.attr("data-start") ??
        firstAttribute(
          card,
          [
            "time[data-event-start]",
            "time.event-start",
            "time[itemprop='startDate']",
            "time",
          ],
          "datetime",
        );
      const endDateTime =
        card.attr("data-end") ??
        firstAttribute(
          card,
          [
            "time[data-event-end]",
            "time.event-end",
            "time[itemprop='endDate']",
          ],
          "datetime",
        );
      const description = firstText(card, [
        "[data-event-description]",
        ".event-description",
        ".cp-event-description",
        "[itemprop='description']",
      ]);
      const venueName = firstText(card, [
        "[data-event-location]",
        ".event-location",
        ".cp-event-location",
        "[itemprop='location'] [itemprop='name']",
      ]);
      const addressElement = card
        .find("address, [data-event-address], [itemprop='streetAddress']")
        .first();
      const address = nullableText(addressElement.text());
      const registrationLink = card
        .find(
          "a[data-event-registration], a[href*='/events/'][href*='register'], a[href*='registration']",
        )
        .first();
      const registrationUrl = absoluteHttpUrl(
        registrationLink.attr("href"),
        eventUrl,
      );
      const combinedText = card.text();
      const priceText = firstText(card, [
        "[data-event-price]",
        ".event-price",
        ".admission",
      ]);
      const categories = collectTexts(card, [
        "[data-event-category]",
        ".event-category",
        ".event-tags a",
        "a[rel='tag']",
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
        address,
        neighborhood:
          card.attr("data-neighborhood") ??
          firstText(card, ["[data-neighborhood]", ".event-neighborhood"]),
        city: addressElement.attr("data-city") ?? "Chicago",
        state: addressElement.attr("data-state") ?? "IL",
        postalCode:
          addressElement.attr("data-postal-code") ??
          firstText(card, ["[itemprop='postalCode']"]),
        latitude: null,
        longitude: null,
        organizerName: "Chicago Public Library",
        organizerType: "LibrarySystem",
        registrationRequired: inferRegistrationRequired(
          combinedText,
          registrationUrl,
        ),
        registrationUrl,
        priceText,
        categories,
        ageRestriction:
          firstText(card, [
            "[data-event-audience]",
            ".event-audience",
            ".audience",
          ]) ?? categories.find((value) => /\b(?:adults|kids|teens)\b/i.test(value)),
        attendanceFormat: inferAttendanceFormat(
          `${venueName ?? ""} ${combinedText}`,
        ),
        evidence: [
          ...(priceText
            ? [{ field: "admission", text: priceText, url: eventUrl }]
            : []),
          ...(registrationUrl
            ? [
                {
                  field: "registration",
                  text: nullableText(registrationLink.text()) ?? "Registration link",
                  url: eventUrl,
                },
              ]
            : []),
        ],
        rawMetadata: {
          extractionMethod: "static-html",
          bibliocommonsEventId: card.attr("data-event-id") ?? null,
        },
      });
    });

    return validatedRawEvents(candidates);
  }
}

export const chicagoPublicLibraryAdapter =
  new ChicagoPublicLibraryAdapter();
