import { describe, expect, it } from "vitest";
import { classifyCompanies } from "../../lib/events/classify-company";

describe("major-company classification", () => {
  it("treats a watched organizer as host", () => { const result = classifyCompanies({ title: "Open House", organizerName: "Google Chicago" }); expect(result.hasMajorCompany).toBe(true); expect(result.names).toContain("Google"); expect(result.involvement[0].relationship).toBe("hosted_by"); });
  it("records sponsorship separately", () => { const result = classifyCompanies({ title: "Run", description: "This neighborhood run is sponsored by Nike." }); expect(result.involvement).toContainEqual(expect.objectContaining({ name: "Nike", relationship: "sponsored_by" })); });
  it("keeps a context-free mention as mention only", () => { const result = classifyCompanies({ title: "Career Workshop", description: "Learn how applicants prepare for careers at Amazon." }); expect(result.hasMajorCompany).toBe(false); expect(result.involvement[0].relationship).toBe("mentioned_only"); });
  it("ignores boilerplate", () => { const result = classifyCompanies({ title: "Talk", description: "A local talk. Copyright Google. Privacy policy applies." }); expect(result.names).not.toContain("Google"); });
  it("recognizes a brand pop-up", () => { const result = classifyCompanies({ title: "Amazon summer pop-up", description: "Try product demos." }); expect(result.hasMajorCompany).toBe(true); expect(result.involvement[0].relationship).toBe("featuring"); });
});
