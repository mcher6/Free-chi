export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type EventStatus = "draft" | "review" | "published" | "rejected" | "cancelled" | "expired";
export type OrganizerType = "government" | "nonprofit" | "company" | "university" | "cultural_institution" | "community" | "individual" | "unknown";
export type AttendanceFormat = "in_person" | "online" | "hybrid" | "unknown";
export type EventEnvironment = "indoor" | "outdoor" | "mixed" | "unknown";
export type LocationQuality = "confirmed" | "questionable" | "missing" | "online";
export type FreebieType = "food" | "drinks" | "alcohol_samples" | "beauty_products" | "clothing" | "merchandise" | "gift_bag" | "technology_products" | "product_samples" | "fitness_class" | "professional_headshots" | "health_screening" | "museum_admission" | "tickets" | "transportation" | "parking" | "services" | "discounts" | "sweepstakes_or_raffle" | "unknown";
export type FreebieAvailability = "guaranteed" | "limited" | "raffle" | "vague" | "none";
export type NotableLabel = "confirmed_appearance" | "listed_speaker_or_performer" | "possible_notable_guest" | "unverified_mention" | "none";
export type CompanyRelationship = "hosted_by" | "sponsored_by" | "featuring" | "exhibiting" | "giveaway_provider" | "mentioned_only";
export type EventSort = "best" | "soonest" | "closest" | "most_notable" | "best_freebies" | "newly_discovered";

export interface EventEvidence {
  type: "free" | "freebie" | "notable" | "company" | "location" | "source" | "ranking";
  label: string;
  excerpt: string;
  sourceField?: string;
  sourceUrl?: string;
  confidence: number;
  metadata?: JsonObject;
}

export interface EventSourceLink {
  sourceName: string;
  url: string;
  isPrimary: boolean;
  reliability: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export interface CompanyInvolvement { name: string; relationship: CompanyRelationship; confidence: number; evidence: string; }
export interface NotablePersonInvolvement { name: string; role: string; label: NotableLabel; confidence: number; evidence: string; }

export interface RawEvent {
  externalId?: string | null;
  title: string;
  description?: string | null;
  shortSummary?: string | null;
  sourceName: string;
  sourceUrl: string;
  originalEventUrl?: string | null;
  canonicalUrl?: string | null;
  imageUrl?: string | null;
  startDateTime: string | Date;
  endDateTime?: string | Date | null;
  timezone?: string | null;
  venueName?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  organizerName?: string | null;
  organizerType?: OrganizerType | null;
  registrationRequired?: boolean | null;
  registrationUrl?: string | null;
  priceText?: string | null;
  officialFreeCategory?: boolean;
  ticketPrices?: number[];
  freebieText?: string | null;
  speakerNames?: string[];
  performerNames?: string[];
  hostNames?: string[];
  sponsorNames?: string[];
  exhibitorNames?: string[];
  giveawayProviders?: string[];
  eventCategories?: string[];
  ageRestriction?: string | null;
  attendanceFormat?: AttendanceFormat | null;
  environment?: EventEnvironment | null;
  familyFriendly?: boolean | null;
  capacityLimited?: boolean;
  sourceReliability?: number;
  rawMetadata?: JsonObject;
  seedLabel?: string | null;
}

export interface EventRecord {
  id: string;
  title: string;
  normalizedTitle: string;
  description: string | null;
  shortSummary: string | null;
  sourceName: string;
  sourceUrl: string;
  originalEventUrl: string;
  canonicalUrl: string | null;
  sourceLinks: EventSourceLink[];
  imageUrl: string | null;
  startDateTime: string;
  endDateTime: string | null;
  timezone: string;
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  locationQuality: LocationQuality;
  organizerName: string | null;
  organizerType: OrganizerType;
  registrationRequired: boolean;
  registrationUrl: string | null;
  priceText: string | null;
  isFree: boolean;
  freeConfidence: number;
  freeExplanation: string;
  freebieType: FreebieType[];
  freebieDescription: string | null;
  freebieAvailability: FreebieAvailability;
  freebieConfidence: number;
  celebrityNames: string[];
  celebrityConfidence: number;
  celebrityLabel: NotableLabel;
  notablePeople: NotablePersonInvolvement[];
  companyNames: string[];
  companyConfidence: number;
  companyInvolvement: CompanyInvolvement[];
  eventCategories: string[];
  ageRestriction: string | null;
  attendanceFormat: AttendanceFormat;
  environment: EventEnvironment;
  familyFriendly: boolean | null;
  capacityLimited: boolean;
  status: EventStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  scrapedAt: string;
  sourceReliability: number;
  uniquenessScore: number;
  overallScore: number;
  rankingExplanation: string[];
  deduplicationKey: string;
  evidence: EventEvidence[];
  rawMetadata: JsonObject;
  seedLabel: string | null;
}

export type NormalizedEvent = EventRecord;

export interface EventQuery {
  search?: string;
  datePreset?: "today" | "tomorrow" | "weekend" | "next_7_days";
  dateFrom?: string;
  dateTo?: string;
  neighborhoods?: string[];
  latitude?: number;
  longitude?: number;
  distanceMiles?: number;
  categories?: string[];
  freeOnly?: boolean;
  hasFreebie?: boolean;
  hasNotable?: boolean;
  hasCompany?: boolean;
  registrationRequired?: boolean;
  ageRestriction?: string;
  environment?: EventEnvironment;
  familyFriendly?: boolean;
  sources?: string[];
  minimumConfidence?: number;
  sort?: EventSort;
  page?: number;
  pageSize?: number;
}

export interface EventCardDto {
  id: string; title: string; shortSummary: string | null; imageUrl: string | null;
  startDateTime: string; endDateTime: string | null; venueName: string | null;
  neighborhood: string | null; latitude: number | null; longitude: number | null;
  distanceMiles?: number; isFree: boolean; freeConfidence: number;
  freeExplanation: string; freebieType: FreebieType[]; freebieDescription: string | null;
  freebieAvailability: FreebieAvailability; celebrityNames: string[]; companyNames: string[];
  registrationRequired: boolean; registrationUrl: string | null; overallScore: number;
  rankingExplanation: string[]; sourceName: string; originalEventUrl: string;
}

export interface ValidationResult { valid: boolean; errors: string[]; warnings: string[]; }
export interface PaginatedEvents<T = EventRecord> { items: T[]; total: number; page: number; pageSize: number; totalPages: number; }
