import { describe, expect, it } from "vitest";
import { classifyNotablePeople } from "../../lib/events/classify-notable";

describe("notable-person classification", () => {
  it("uses structured speaker evidence", () => { const result = classifyNotablePeople({ title: "Leadership Forum", speakerNames: ["Barack Obama"] }); expect(result.hasNotable).toBe(true); expect(result.names).toContain("Barack Obama"); expect(result.label).toBe("listed_speaker_or_performer"); });
  it("does not claim attendance from an unrelated mention", () => { const result = classifyNotablePeople({ title: "Book Club", description: "Participants discuss a memoir by Michelle Obama. The author is not scheduled to attend." }); expect(result.hasNotable).toBe(false); expect(result.label).toBe("unverified_mention"); });
  it("recognizes strong appearance language", () => { const result = classifyNotablePeople({ title: "Comedy Night", description: "Special guest Ayo Edebiri joins us for a live appearance." }); expect(result.hasNotable).toBe(true); expect(result.label).toBe("confirmed_appearance"); });
  it("extracts an explicitly introduced guest", () => { const result = classifyNotablePeople({ title: "Forum", description: "Keynote speaker: Ada Lovelace." }, []); expect(result.hasNotable).toBe(true); expect(result.names).toContain("Ada Lovelace"); });
});
