import { scoringConfig } from "../../config/scoring";
import type { EventEvidence } from "./types";

export interface FreeClassificationInput { title: string; description?: string | null; priceText?: string | null; registrationRequired?: boolean | null; officialFreeCategory?: boolean; ticketPrices?: number[]; eventCategories?: string[]; sourceUrl?: string; }
export interface FreeClassificationResult { isFree: boolean; confidence: number; explanation: string; decision: "free" | "paid" | "ambiguous"; recommendedStatus: "published" | "review"; evidence: EventEvidence[]; }
interface Signal { confidence: number; explanation: string; excerpt: string; field: string; kind: "positive" | "negative" | "caution"; }

const POSITIVE = [
  [/\bfree admission\b/i, 0.98, "Official listing says free admission"],
  [/\b(?:admission|entry)\s+(?:is\s+)?(?:completely\s+)?free\b/i, 0.97, "Listing explicitly says admission is free"],
  [/\bno (?:cost|charge|admission fee)\b/i, 0.96, "Listing explicitly says there is no cost"],
  [/\bcomplimentary (?:admission|entry)\b/i, 0.95, "Listing says admission is complimentary"],
  [/\bfree (?:with|upon) (?:advance )?(?:registration|rsvp)\b/i, 0.95, "Free with advance RSVP"],
  [/\bfree and open to the public\b/i, 0.98, "Listing says the event is free and open to the public"],
  [/\b(?:tickets?|price|admission)\s*:?\s*\$0(?:\.00)?\b/i, 0.99, "Ticket price is explicitly $0"],
  [/\b(?:free event|event is free|completely free)\b/i, 0.9, "Listing explicitly describes the event as free"],
] as const;
const CAUTION = [
  [/\bfree trial\b/i, 0.12, "“Free” refers to a trial, not event admission"],
  [/\bbuy (?:one|1).{0,25}get (?:one|1) free\b/i, 0.08, "“Free” refers to a purchase promotion"],
  [/\bfree parking\b/i, 0.25, "“Free” refers to parking, not event admission"],
  [/\bfree for members\b/i, 0.35, "Admission appears free only for members"],
  [/\bfree with (?:paid|museum|general) admission\b/i, 0.08, "Benefit requires paid admission"],
  [/\bsuggested (?:donation|contribution)\b/i, 0.58, "Possibly free; a suggested donation is listed"],
  [/\bprices? starting at\b/i, 0.08, "Paid prices are advertised"],
  [/\b(?:giveaway|sweepstakes) entry is free\b/i, 0.15, "Only giveaway entry is described as free"],
  [/\bwith purchase\b/i, 0.12, "The offer requires a purchase"],
] as const;

function excerpt(value: string, match: RegExpMatchArray): string {
  const start = Math.max(0, (match.index ?? 0) - 70); const end = Math.min(value.length, (match.index ?? 0) + match[0].length + 100);
  return value.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 500);
}
function find(value: string, field: string, rule: readonly [RegExp, number, string], kind: Signal["kind"]): Signal | null {
  const match = value.match(rule[0]); return match ? { confidence: rule[1], explanation: rule[2], excerpt: excerpt(value, match), field, kind } : null;
}

export function classifyFreeEvent(input: FreeClassificationInput): FreeClassificationResult {
  const signals: Signal[] = [];
  if (input.officialFreeCategory) signals.push({ confidence: 0.97, explanation: "Official source categorizes the event as free", excerpt: "Official free-event category", field: "officialFreeCategory", kind: "positive" });
  if (input.ticketPrices?.length) {
    const zero = input.ticketPrices.every((price) => price === 0);
    signals.push({ confidence: zero ? 0.99 : 0.03, explanation: zero ? "Official ticket data shows a $0 price" : "Official ticket data includes a paid price", excerpt: `Ticket prices: ${input.ticketPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}`, field: "ticketPrices", kind: zero ? "positive" : "negative" });
  }
  for (const field of [{ name: "title", value: input.title }, { name: "description", value: input.description ?? "" }, { name: "priceText", value: input.priceText ?? "" }, { name: "eventCategories", value: input.eventCategories?.join(" ") ?? "" }]) {
    for (const rule of POSITIVE) { const signal = find(field.value, field.name, rule, "positive"); if (signal) signals.push(signal); }
    for (const rule of CAUTION) { const signal = find(field.value, field.name, rule, "caution"); if (signal) signals.push(signal); }
  }
  const paid = [...(input.priceText ?? "").matchAll(/\$(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1])).filter((p) => p > 0);
  if (paid.length) signals.push({ confidence: 0.02, explanation: `Paid admission is listed (${paid.map((p) => `$${p}`).join(", ")})`, excerpt: (input.priceText ?? "").trim(), field: "priceText", kind: "negative" });
  else if (/^\s*(?:free|\$0(?:\.00)?|no cost)\s*$/i.test(input.priceText ?? "")) signals.push({ confidence: 0.99, explanation: "Price field explicitly says free", excerpt: input.priceText!.trim(), field: "priceText", kind: "positive" });

  const negative = signals.filter((s) => s.kind === "negative").sort((a, b) => a.confidence - b.confidence)[0];
  const caution = signals.filter((s) => s.kind === "caution").sort((a, b) => a.confidence - b.confidence)[0];
  const positive = signals.filter((s) => s.kind === "positive").sort((a, b) => b.confidence - a.confidence)[0];
  let confidence = 0.25; let explanation = "Possibly free; price information is ambiguous"; let decision: FreeClassificationResult["decision"] = "ambiguous";
  if (negative) { confidence = negative.confidence; explanation = negative.explanation; decision = "paid"; }
  else if (positive && caution) {
    const overrides = caution.confidence <= 0.15 || /members|suggested donation/i.test(caution.explanation);
    confidence = overrides ? Math.min(positive.confidence, caution.confidence + 0.15) : positive.confidence;
    explanation = overrides ? caution.explanation : positive.explanation;
    decision = confidence >= scoringConfig.publicationThresholds.freeConfidence ? "free" : "ambiguous";
  } else if (positive) { confidence = positive.confidence; explanation = positive.explanation; decision = "free"; }
  else if (caution) { confidence = caution.confidence; explanation = caution.explanation; }
  else if (input.registrationRequired && /\b(?:rsvp|required registration|register in advance)\b/i.test(`${input.title} ${input.description ?? ""}`)) { confidence = 0.55; explanation = "Registration is required, but a $0 price is not confirmed"; }
  confidence = Math.max(0, Math.min(1, confidence));
  const isFree = decision === "free" && confidence >= scoringConfig.publicationThresholds.freeConfidence;
  return { isFree, confidence, explanation, decision, recommendedStatus: isFree || decision === "paid" ? "published" : "review", evidence: signals.map((s) => ({ type: "free", label: s.kind === "positive" ? "Free-admission signal" : s.kind === "negative" ? "Paid-admission signal" : "Pricing caution", excerpt: s.excerpt, sourceField: s.field, sourceUrl: input.sourceUrl, confidence: s.confidence })) };
}
export const classifyFree = classifyFreeEvent;
