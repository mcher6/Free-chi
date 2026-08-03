import companyConfig from "../../config/company-watchlist.json";
import type { CompanyInvolvement, CompanyRelationship, EventEvidence } from "./types";

export interface CompanyWatchlistEntry { name: string; aliases: string[]; category: string; tier: 1 | 2 | 3; }
export interface CompanyClassificationInput { title: string; description?: string | null; organizerName?: string | null; hostNames?: string[]; sponsorNames?: string[]; exhibitorNames?: string[]; giveawayProviders?: string[]; sourceUrl?: string; }
export interface CompanyClassificationResult { hasMajorCompany: boolean; names: string[]; confidence: number; involvement: CompanyInvolvement[]; evidence: EventEvidence[]; }
const WATCHLIST = companyConfig.companies as CompanyWatchlistEntry[];
const BOILERPLATE = /\b(?:privacy policy|cookie policy|terms of (?:use|service)|copyright|all rights reserved|website powered by)\b/i;
function escape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function contains(text: string, name: string): boolean { return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(name)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text); }
function watched(candidate: string, list: CompanyWatchlistEntry[]) { const key = candidate.trim().toLowerCase(); return list.find((c) => [c.name, ...c.aliases].some((name) => name.toLowerCase() === key)); }
const BASE: Record<CompanyRelationship, number> = { hosted_by: 0.94, sponsored_by: 0.9, featuring: 0.82, exhibiting: 0.82, giveaway_provider: 0.92, mentioned_only: 0.25 };
function confidence(company: CompanyWatchlistEntry, relation: CompanyRelationship) { return Math.min(0.98, BASE[relation] + (company.tier === 1 ? 0.03 : 0)); }
function relation(sentence: string, name: string): CompanyRelationship {
  const escaped = escape(name); const near = (phrase: string) => new RegExp(`(?:${phrase}).{0,50}${escaped}|${escaped}.{0,50}(?:${phrase})`, "i").test(sentence);
  if (near("hosted by|presented by|organized by|brought to you by|hosts?|presents?")) return "hosted_by";
  if (near("sponsored by|sponsors?|support(?:ed)? by")) return "sponsored_by";
  if (near("giveaway|free samples?|complimentary|swag|gift bags?|product drop")) return "giveaway_provider";
  if (near("exhibitors?|exhibiting|booth")) return "exhibiting";
  if (near("featuring|in partnership with|partner(?:ed|ing)? with|pop-up|activation")) return "featuring";
  return "mentioned_only";
}
function merge(values: CompanyInvolvement[]): CompanyInvolvement[] {
  const result = new Map<string, CompanyInvolvement>();
  for (const value of values.sort((a, b) => b.confidence - a.confidence)) if (!result.has(value.name.toLowerCase())) result.set(value.name.toLowerCase(), value);
  return [...result.values()];
}
export function classifyCompanies(input: CompanyClassificationInput, list: CompanyWatchlistEntry[] = WATCHLIST): CompanyClassificationResult {
  const values: CompanyInvolvement[] = [];
  for (const group of [
    { names: input.organizerName ? [input.organizerName] : [], relation: "hosted_by" as const, field: "organizerName" },
    { names: input.hostNames ?? [], relation: "hosted_by" as const, field: "hostNames" },
    { names: input.sponsorNames ?? [], relation: "sponsored_by" as const, field: "sponsorNames" },
    { names: input.exhibitorNames ?? [], relation: "exhibiting" as const, field: "exhibitorNames" },
    { names: input.giveawayProviders ?? [], relation: "giveaway_provider" as const, field: "giveawayProviders" },
  ]) for (const candidate of group.names) { const company = watched(candidate, list); if (company) values.push({ name: company.name, relationship: group.relation, confidence: confidence(company, group.relation), evidence: `${company.name} is listed in the ${group.field} field` }); }
  const text = `${input.title}. ${input.description ?? ""}`;
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()) ?? [];
  for (const company of list) for (const sentence of sentences) {
    if (BOILERPLATE.test(sentence)) continue; const name = [company.name, ...company.aliases].find((n) => contains(sentence, n)); if (!name) continue;
    const relationship = relation(sentence, name); values.push({ name: company.name, relationship, confidence: confidence(company, relationship), evidence: sentence.slice(0, 700) });
  }
  const involvement = merge(values);
  return { hasMajorCompany: involvement.some((c) => c.relationship !== "mentioned_only" && c.confidence >= 0.65), names: involvement.map((c) => c.name), confidence: involvement[0]?.confidence ?? 0, involvement, evidence: involvement.map((c) => ({ type: "company", label: c.relationship.replaceAll("_", " "), excerpt: c.evidence, sourceField: "description", sourceUrl: input.sourceUrl, confidence: c.confidence, metadata: { name: c.name, relationship: c.relationship } })) };
}
export const classifyCompany = classifyCompanies;
