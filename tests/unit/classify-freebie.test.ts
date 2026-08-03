import { describe, expect, it } from "vitest";
import { classifyFreebie } from "../../lib/events/classify-freebie";

describe("free-stuff classification", () => {
  it("distinguishes a limited benefit", () => { const result = classifyFreebie({ title: "Morning Pop-up", description: "The first 100 guests get free coffee while supplies last." }); expect(result.types).toContain("food"); expect(result.availability).toBe("limited"); });
  it("labels raffles as non-guaranteed", () => { const result = classifyFreebie({ title: "Fair", description: "Enter the raffle for a chance to win free concert tickets." }); expect(result.types).toContain("sweepstakes_or_raffle"); expect(result.availability).toBe("raffle"); expect(result.description).toContain("not guaranteed"); });
  it("recognizes a guaranteed open bar", () => { const result = classifyFreebie({ title: "Gallery Opening", description: "Guests can enjoy an open bar and complimentary snacks." }); expect(result.types).toContain("alcohol_samples"); expect(result.availability).toBe("guaranteed"); });
  it("keeps a generic giveaway vague", () => expect(classifyFreebie({ title: "Activation", description: "Giveaways and surprises." })).toMatchObject({ types: ["unknown"], availability: "vague" }));
  it("returns no benefit without evidence", () => expect(classifyFreebie({ title: "Talk", description: "A discussion about the city." })).toMatchObject({ hasFreebie: false, availability: "none", types: [] }));
});
