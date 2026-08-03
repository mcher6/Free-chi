import { scoringConfig } from "../../config/scoring";
import { parseEventDate } from "./dates";
import type { EventRecord, FreebieAvailability, FreebieType } from "./types";

export interface RankingContext { now?: Date; userLocation?: { latitude: number; longitude: number }; isDuplicate?: boolean; outsideChicagoArea?: boolean; }
export interface RankingAdjustment { label: string; points: number; }
export interface RankingResult {
  score: number;
  components: { freeConfidence: number; notableRelevance: number; companyInvolvement: number; freebieValue: number; sourceReliability: number; uniqueness: number; descriptionCompleteness: number; proximity: number; discoveryRecency: number; };
  bonuses: RankingAdjustment[]; penalties: RankingAdjustment[]; explanation: string[]; distanceMiles?: number;
}

const VALUES: Record<FreebieType, number> = { food: 0.88, drinks: 0.72, alcohol_samples: 0.82, beauty_products: 0.86, clothing: 0.9, merchandise: 0.78, gift_bag: 0.9, technology_products: 1, product_samples: 0.72, fitness_class: 0.72, professional_headshots: 0.9, health_screening: 0.86, museum_admission: 0.82, tickets: 0.95, transportation: 0.78, parking: 0.35, services: 0.7, discounts: 0.25, sweepstakes_or_raffle: 0.3, unknown: 0.4 };
const AVAILABILITY: Record<FreebieAvailability, number> = { guaranteed: 1, limited: 0.82, raffle: 0.42, vague: 0.35, none: 0 };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value: number, precision = 1) => Math.round(value * 10 ** precision) / 10 ** precision;

export function haversineMiles(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude); const dLng = radians(to.longitude - from.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3_958.8 * Math.asin(Math.min(1, Math.sqrt(value)));
}
function proximity(distance: number) { return distance <= 1 ? 1 : distance <= 3 ? 0.85 : distance <= 6 ? 0.65 : distance <= 10 ? 0.45 : distance <= 20 ? 0.2 : 0; }
function notable(event: EventRecord) {
  if (!event.celebrityNames.length) return 0;
  return event.celebrityConfidence * ({ confirmed_appearance: 1, listed_speaker_or_performer: 0.9, possible_notable_guest: 0.65, unverified_mention: 0.08, none: 0 }[event.celebrityLabel]);
}
function company(event: EventRecord) {
  if (!event.companyInvolvement.length) return 0;
  const factors = { hosted_by: 1, sponsored_by: 0.88, giveaway_provider: 0.95, featuring: 0.74, exhibiting: 0.68, mentioned_only: 0.08 };
  return Math.max(...event.companyInvolvement.map((c) => c.confidence * factors[c.relationship]));
}
function freebie(event: EventRecord) { return event.freebieType.length ? Math.max(...event.freebieType.map((type) => VALUES[type] ?? 0.4)) * event.freebieConfidence * AVAILABILITY[event.freebieAvailability] : 0; }
function completeness(event: EventRecord) {
  const checks = [Boolean(event.description && event.description.length >= 80), Boolean(event.shortSummary), Boolean(event.imageUrl), Boolean(event.venueName), Boolean(event.address || event.attendanceFormat === "online"), Boolean(event.organizerName), Boolean(event.endDateTime), Boolean(event.registrationUrl || !event.registrationRequired), event.eventCategories.length > 0, event.evidence.length > 0];
  return checks.filter(Boolean).length / checks.length;
}
function recency(value: string, now: Date) {
  const seen = parseEventDate(value); if (!seen) return 0; const days = Math.max(0, (now.getTime() - seen.getTime()) / 86_400_000);
  return days <= 1 ? 1 : days <= 3 ? 0.85 : days <= 7 ? 0.65 : days <= 14 ? 0.4 : days <= 30 ? 0.2 : 0.08;
}

export function rankEvent(event: EventRecord, context: RankingContext = {}): RankingResult {
  const now = context.now ?? new Date();
  const distance = context.userLocation && event.latitude !== null && event.longitude !== null ? haversineMiles(context.userLocation, { latitude: event.latitude, longitude: event.longitude }) : undefined;
  const factors = { freeConfidence: event.isFree ? event.freeConfidence : 0, notableRelevance: notable(event), companyInvolvement: company(event), freebieValue: freebie(event), sourceReliability: event.sourceReliability, uniqueness: event.uniquenessScore, descriptionCompleteness: completeness(event), proximity: distance === undefined ? event.locationQuality === "confirmed" ? 0.5 : 0 : proximity(distance), discoveryRecency: recency(event.firstSeenAt, now) };
  const components = {
    freeConfidence: factors.freeConfidence * scoringConfig.weights.freeConfidence,
    notableRelevance: factors.notableRelevance * scoringConfig.weights.notableRelevance,
    companyInvolvement: factors.companyInvolvement * scoringConfig.weights.companyInvolvement,
    freebieValue: factors.freebieValue * scoringConfig.weights.freebieValue,
    sourceReliability: factors.sourceReliability * scoringConfig.weights.sourceReliability,
    uniqueness: factors.uniqueness * scoringConfig.weights.uniqueness,
    descriptionCompleteness: factors.descriptionCompleteness * scoringConfig.weights.descriptionCompleteness,
    proximity: factors.proximity * scoringConfig.weights.proximity,
    discoveryRecency: factors.discoveryRecency * scoringConfig.weights.discoveryRecency,
  };
  const bonuses: RankingAdjustment[] = []; const penalties: RankingAdjustment[] = [];
  if (event.freebieAvailability === "guaranteed" && event.freebieType.some((type) => VALUES[type] >= 0.72)) bonuses.push({ label: "Guaranteed free food, product, or service", points: scoringConfig.bonuses.guaranteedValuableFreebie });
  if (event.capacityLimited) bonuses.push({ label: "Limited-capacity event", points: scoringConfig.bonuses.limitedCapacity });
  if (event.celebrityLabel === "confirmed_appearance" || (event.celebrityLabel === "listed_speaker_or_performer" && event.celebrityConfidence >= 0.85)) bonuses.push({ label: "Recognizable speaker or performer", points: scoringConfig.bonuses.recognizablePerson });
  if (event.eventCategories.some((category) => /\b(?:launch|pop[- ]?up|activation)\b/i.test(category))) bonuses.push({ label: "Launch or pop-up", points: scoringConfig.bonuses.majorLaunchOrPopup });
  if (event.sourceReliability >= 0.9 && event.freeConfidence >= 0.9) bonuses.push({ label: "Strong official-source confirmation", points: scoringConfig.bonuses.officialSourceConfirmation });
  if (!event.isFree && event.freeConfidence >= 0.35 && event.freeConfidence < 0.78) penalties.push({ label: "Ambiguous pricing", points: -scoringConfig.penalties.ambiguousPricing });
  if (event.attendanceFormat !== "online" && !event.address && !event.venueName) penalties.push({ label: "Missing address", points: -scoringConfig.penalties.missingAddress });
  if (!parseEventDate(event.startDateTime)) penalties.push({ label: "Missing or invalid date", points: -scoringConfig.penalties.missingDate });
  if (context.isDuplicate) penalties.push({ label: "Probable duplicate", points: -scoringConfig.penalties.duplicate });
  if (event.sourceReliability < 0.45) penalties.push({ label: "Low-reliability source", points: -scoringConfig.penalties.lowQualitySource });
  if (event.freebieAvailability === "raffle" && /guaranteed/i.test(event.freebieDescription ?? "")) penalties.push({ label: "Sweepstakes described as guaranteed", points: -scoringConfig.penalties.misleadingSweepstakes });
  if (context.outsideChicagoArea) penalties.push({ label: "Far outside the Chicago area", points: -scoringConfig.penalties.outsideChicagoArea });
  const base = Object.values(components).reduce((sum, value) => sum + value, 0);
  const score = round(clamp(base + bonuses.reduce((s, v) => s + v.points, 0) + penalties.reduce((s, v) => s + v.points, 0), scoringConfig.minScore, scoringConfig.maxScore));
  const candidates: Array<{ points: number; text: string }> = [];
  const add = (points: number, text: string) => { if (points > 0.7) candidates.push({ points, text: `${text} (+${round(points)} pts)` }); };
  add(components.freeConfidence, event.freeExplanation); add(components.freebieValue, event.freebieDescription ?? "Free attendee benefit");
  add(components.notableRelevance, event.celebrityNames.length ? `Features ${event.celebrityNames.join(", ")}` : "Notable guest");
  add(components.companyInvolvement, event.companyNames.length ? `Major organization involvement: ${event.companyNames.join(", ")}` : "Major organization involvement");
  add(components.sourceReliability, "Reliable source"); if (distance !== undefined) add(components.proximity, `${round(distance)} miles away`);
  const explanation = [...candidates.sort((a, b) => b.points - a.points).slice(0, 3).map((v) => v.text), ...bonuses.slice(0, 2).map((v) => `${v.label} (+${v.points} pts)`), ...penalties.slice(0, 2).map((v) => `${v.label} (${v.points} pts)`)];
  return { score, components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value)])) as RankingResult["components"], bonuses, penalties, explanation, ...(distance === undefined ? {} : { distanceMiles: round(distance, 2) }) };
}
export function applyEventRanking(event: EventRecord, context: RankingContext = {}): EventRecord { const ranking = rankEvent(event, context); return { ...event, overallScore: ranking.score, rankingExplanation: ranking.explanation }; }
export const calculateOverallScore = rankEvent;
