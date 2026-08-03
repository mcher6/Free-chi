import { describe, expect, it } from "vitest";

import {
  ChicagoPublicLibraryAdapter,
} from "../../lib/scraper/adapters/cpl";
import { fixtureContext, readFixture } from "./test-context";

describe("ChicagoPublicLibraryAdapter", () => {
  it("parses BiblioCommons-style cards without a live request", async () => {
    const html = await readFixture("cpl-events.html");
    const adapter = new ChicagoPublicLibraryAdapter();
    const requestedUrls: string[] = [];
    const context = fixtureContext("cpl", html);
    context.fetchText = async (url) => {
      requestedUrls.push(url.toString());
      return html;
    };

    const events = await adapter.fetchEvents(context);

    expect(requestedUrls).toEqual([
      "https://chipublib.bibliocommons.com/v2/events?page=1",
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      sourceEventId: "cpl-maker-2026-08-06",
      title: "Intro to Laser Cutting",
      venueName: "Harold Washington Library Center",
      registrationRequired: true,
      priceText: "Free with registration",
      ageRestriction: "Adults: 18 and up",
    });
    expect(events[0].categories).toEqual([
      "Computers and Technology",
      "Workshops",
    ]);

    const normalized = await adapter.normalizeEvent(events[0]);
    expect(normalized.registrationUrl).toBe(
      "https://chipublib.bibliocommons.com/events/fixture-maker-workshop/registration",
    );
    expect(adapter.validateEvent(normalized).valid).toBe(true);
  });
});
