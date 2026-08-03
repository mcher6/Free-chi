import notableConfig from "../../config/notable-people.json";
import type { EventEvidence, NotableLabel, NotablePersonInvolvement } from "./types";

export interface NotableWatchlistEntry { name: string; aliases: string[]; category: string; chicagoRelevance: "high" | "medium" | "low"; }
export interface NotableClassificationInput { title: string; description?: string | null; speakerNames?: string[]; performerNames?: string[]; hostNames?: string[]; sourceUrl?: string; }
export interface NotableClassificationResult { hasNotable: boolean; names: string[]; confidence: number; label: NotableLabel; people: NotablePersonInvolvement[]; evidence: EventEvidence[]; }

const WATCHLIST = notableConfig.people as NotableWatchlistEntry[];
const APPEARANCE = /\b(?:celebrity appearance|special guest|meet and greet|autograph signing|red carpet|keynote|fireside chat|book signing|album signing|athlete appearance|creator appearance|cast appearance|will appear|joins us|in conversation with|performance by|featuring)\b/i;
const STRONG = /\b(?:meet and greet|autograph signing|book signing|album signing|will appear|joins us|live appearance|performance by)\b/i;
const BOILERPLATE = /\b(?:privacy policy|terms of use|copyright|photo credit|related article|past event)\b/i;

function escape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function contains(text: string, name: string): boolean { return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(name)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text); }
function sentences(text: string): string[] { return text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g)?.map((v) => v.trim()).filter(Boolean) ?? []; }
function watch(candidate: string, list: NotableWatchlistEntry[]) { const key = candidate.trim().toLowerCase(); return list.find((p) => [p.name, ...p.aliases].some((n) => n.toLowerCase() === key)); }
function merge(values: NotablePersonInvolvement[]): NotablePersonInvolvement[] {
  const result = new Map<string, NotablePersonInvolvement>();
  for (const value of values) { const key = value.name.toLowerCase(); if (!result.has(key) || value.confidence > result.get(key)!.confidence) result.set(key, value); }
  return [...result.values()].sort((a, b) => b.confidence - a.confidence);
}

export function classifyNotablePeople(input: NotableClassificationInput, list: NotableWatchlistEntry[] = WATCHLIST): NotableClassificationResult {
  const values: NotablePersonInvolvement[] = [];
  for (const group of [{ names: input.speakerNames ?? [], role: "speaker", confidence: 0.84 }, { names: input.performerNames ?? [], role: "performer", confidence: 0.88 }, { names: input.hostNames ?? [], role: "host", confidence: 0.8 }]) {
    for (const candidate of group.names) { const watched = watch(candidate, list); values.push({ name: watched?.name ?? candidate.trim(), role: group.role, label: "listed_speaker_or_performer", confidence: Math.min(0.98, group.confidence + (watched ? 0.1 : 0)), evidence: `Listed as ${group.role} in the source’s structured event fields` }); }
  }
  const text = `${input.title}. ${input.description ?? ""}`;
  for (const person of list) {
    const alias = [person.name, ...person.aliases].find((name) => contains(text, name)); if (!alias) continue;
    const sentence = sentences(text).find((s) => contains(s, alias) && !BOILERPLATE.test(s)) ?? input.title;
    const appearance = APPEARANCE.test(sentence); const strong = STRONG.test(sentence);
    values.push({ name: person.name, role: appearance ? person.category : "mentioned", label: strong ? "confirmed_appearance" : appearance ? "possible_notable_guest" : "unverified_mention", confidence: strong ? 0.94 : appearance ? 0.86 : 0.28, evidence: sentence.slice(0, 700) });
  }
  for (const sentence of sentences(text)) {
    if (!APPEARANCE.test(sentence) || BOILERPLATE.test(sentence)) continue;
    const match = sentence.match(/(?:special guest|keynote(?: speaker)?|featuring|performance by|book signing with|in conversation with)\s*:?\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,3})/i);
    if (match) values.push({ name: match[1].replace(/[.,;:!?]+$/, "").replace(/\s+(?:At|In|On|For|From)$/i, ""), role: "guest", label: "possible_notable_guest", confidence: 0.67, evidence: sentence.slice(0, 700) });
  }
  const people = merge(values); const order: NotableLabel[] = ["confirmed_appearance", "listed_speaker_or_performer", "possible_notable_guest", "unverified_mention", "none"];
  const label = order.find((item) => people.some((p) => p.label === item)) ?? "none";
  return { hasNotable: people.some((p) => p.label !== "unverified_mention" && p.confidence >= 0.65), names: people.map((p) => p.name), confidence: people[0]?.confidence ?? 0, label, people, evidence: people.map((p) => ({ type: "notable", label: p.label.replaceAll("_", " "), excerpt: p.evidence, sourceField: ["speaker", "performer", "host"].includes(p.role) ? `${p.role}Names` : "description", sourceUrl: input.sourceUrl, confidence: p.confidence, metadata: { name: p.name, role: p.role } })) };
}
export const classifyCelebrity = classifyNotablePeople;
