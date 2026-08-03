import type { EventEvidence, FreebieAvailability, FreebieType } from "./types";

export interface FreebieClassificationInput { title: string; description?: string | null; freebieText?: string | null; sourceUrl?: string; }
export interface FreebieClassificationResult { hasFreebie: boolean; types: FreebieType[]; description: string | null; availability: FreebieAvailability; confidence: number; evidence: EventEvidence[]; }

const PATTERNS: Array<[FreebieType, RegExp]> = [
  ["alcohol_samples", /\b(?:open bar|complimentary (?:beer|wine|cocktails?)|free (?:beer|wine|cocktails?)|alcohol samples?|spirits? tasting)\b/i],
  ["food", /\b(?:complimentary|free) (?:food|bites?|snacks?|meals?|pizza|tacos?|ice cream|donuts?|breakfast|lunch|dinner|coffee)\b/i],
  ["drinks", /\b(?:complimentary|free) (?:drinks?|beverages?|coffee|tea|smoothies?|soda|water)\b/i],
  ["beauty_products", /\b(?:free|complimentary) (?:beauty|makeup|skincare|cosmetic) (?:products?|samples?|kits?)\b/i],
  ["clothing", /\b(?:free|complimentary) (?:shirts?|t-shirts?|tees?|clothing|apparel|hats?|sneakers?)\b/i],
  ["gift_bag", /\b(?:gift|goodie|goody|welcome) bags?\b/i],
  ["technology_products", /\b(?:free|complimentary) (?:headphones?|earbuds?|chargers?|tech (?:product|gift|gear)|devices?)\b/i],
  ["product_samples", /\b(?:free|complimentary) (?:product )?samples?\b|\bsampling event\b/i],
  ["fitness_class", /\b(?:free|complimentary) (?:fitness|yoga|pilates|spin|dance|workout) (?:class|session)\b/i],
  ["professional_headshots", /\b(?:free|complimentary) (?:professional )?headshots?\b/i],
  ["health_screening", /\b(?:free|complimentary) (?:health|vision|hearing|blood pressure|dental) screenings?\b/i],
  ["museum_admission", /\b(?:free museum (?:admission|day)|museum admission (?:is )?free|complimentary museum admission)\b/i],
  ["tickets", /\b(?:free|complimentary) (?:movie|concert|game|show|event)?\s*tickets?\b|\bfree screening\b/i],
  ["transportation", /\b(?:free|complimentary) (?:rides?|shuttles?|transit|transportation|train fare|bus fare)\b/i],
  ["parking", /\bfree parking\b/i],
  ["services", /\b(?:free|complimentary) (?:consultations?|services?|repairs?|lessons?|coaching|tax preparation)\b/i],
  ["discounts", /\b(?:exclusive |attendee )?(?:discounts?|coupons?|promo codes?)\b/i],
  ["merchandise", /\b(?:free merch(?:andise)?|complimentary merch(?:andise)?|swag)\b/i],
  ["sweepstakes_or_raffle", /\b(?:sweepstakes?|raffles?|chance to win|enter to win)\b/i],
  ["unknown", /\b(?:giveaways?|freebies?|product drop)\b/i],
];

export function classifyFreebie(input: FreebieClassificationInput): FreebieClassificationResult {
  const fields = [{ name: "freebieText", value: input.freebieText ?? "" }, { name: "title", value: input.title }, { name: "description", value: input.description ?? "" }];
  const matches: Array<{ type: FreebieType; excerpt: string; sourceField: string }> = [];
  for (const field of fields) for (const [type, pattern] of PATTERNS) {
    const match = field.value.match(pattern); if (!match) continue;
    const start = Math.max(0, (match.index ?? 0) - 80); const end = Math.min(field.value.length, (match.index ?? 0) + match[0].length + 120);
    matches.push({ type, excerpt: field.value.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 500), sourceField: field.name });
  }
  if (!matches.length) return { hasFreebie: false, types: [], description: null, availability: "none", confidence: 0, evidence: [] };
  const text = fields.map((f) => f.value).join(" ");
  const raffle = /\b(?:sweepstakes?|raffles?|chance to win|enter to win|one lucky|winner)\b/i.test(text);
  const limited = /\b(?:first \d+|first (?:hundred|fifty|twenty|ten)|while supplies last|limited quantities|first[- ]come|until (?:we )?run out)\b/i.test(text);
  const guaranteed = /\b(?:all (?:attendees|guests) (?:receive|get)|each (?:attendee|guest) (?:receives|gets)|included for (?:all )?(?:attendees|guests)|complimentary|open bar|free (?:food|drinks?|coffee|ice cream|samples?|merch|headshots?|screenings?|class))\b/i.test(text);
  let availability: FreebieAvailability = "vague"; let confidence = 0.58;
  if (raffle) { availability = "raffle"; confidence = 0.88; } else if (limited) { availability = "limited"; confidence = 0.9; } else if (guaranteed) { availability = "guaranteed"; confidence = 0.94; }
  if (input.freebieText && availability !== "vague") confidence = Math.min(0.98, confidence + 0.03);
  const types = [...new Set(matches.map((m) => m.type))].filter((type, _i, all) => type !== "unknown" || all.every((v) => v === "unknown"));
  const best = matches.find((m) => m.sourceField === "freebieText") ?? matches[0];
  const labels: Record<FreebieAvailability, string> = { guaranteed: "Guaranteed attendee benefit", limited: "Limited first-come benefit", raffle: "Raffle or sweepstakes; not guaranteed", vague: "Promotional freebie mentioned; details are unclear", none: "" };
  return { hasFreebie: true, types, description: `${labels[availability]}: ${best.excerpt}`, availability, confidence, evidence: matches.map((m) => ({ type: "freebie", label: labels[availability], excerpt: m.excerpt, sourceField: m.sourceField, sourceUrl: input.sourceUrl, confidence })) };
}
export const classifyFreeStuff = classifyFreebie;
