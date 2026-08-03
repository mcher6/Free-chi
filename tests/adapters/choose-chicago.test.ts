import { describe, expect, it } from "vitest";

import {
  ChooseChicagoAdapter,
} from "../../lib/scraper/adapters/choose-chicago";
import { fixtureContext, readFixture } from "./test-context";

describe("ChooseChicagoAdapter", () => {
  it("extracts validated Event JSON-LD and ignores malformed blocks", async () => {
    const html = await readFixture("choose-chicago-events.html");
    const adapter = new ChooseChicagoAdapter();

    const events = await adapter.fetchEvents(
      fixtureContext("choose-chicago", html),
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      sourceEventId: "choose-fixture-jazz",
      title: "Neighborhood Jazz at Navy Pier",
      venueName: "Navy Pier",
      city: "Chicago",
      state: "IL",
      postalCode: "60611",
      priceText: "Free admission",
      registrationRequired: true,
      attendanceFormat: "in-person",
    });
    expect(events[0].categories).toEqual(["Music", "Free events"]);
    expect(events[0].rawMetadata).toEqual({
      extractionMethod: "json-ld",
      structuredType: ["MusicEvent"],
    });

    const normalized = await adapter.normalizeEvent(events[0]);
    expect(normalized.address).toBe(
      "600 E Grand Ave, Chicago IL 60611",
    );
    expect(normalized.latitude).toBe(41.8917);
    expect(adapter.validateEvent(normalized).valid).toBe(true);
  });
});
