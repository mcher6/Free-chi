import type { EventEvidence, EventRecord } from "./types";

export const seedDisclaimer = "Demo seed — verify before attending";

function futureIso(days: number, chicagoHour: number, minute = 0): string {
  const now = new Date();
  const date = new Date(now);
  date.setUTCDate(now.getUTCDate() + days);
  const offset = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10 ? 5 : 6;
  date.setUTCHours(chicagoHour + offset, minute, 0, 0);
  return date.toISOString();
}

function addHours(value: string, hours: number): string {
  return new Date(new Date(value).getTime() + hours * 3_600_000).toISOString();
}

function proof(
  type: EventEvidence["type"],
  label: string,
  excerpt: string,
  confidence: number,
): EventEvidence {
  return { type, label, excerpt, confidence, sourceField: "seed" };
}

type SeedSpec = Partial<EventRecord> &
  Pick<EventRecord, "id" | "title" | "description">;

function makeSeed(spec: SeedSpec): EventRecord {
  const now = new Date().toISOString();
  const start = spec.startDateTime ?? futureIso(7, 18);
  const sourceName = spec.sourceName ?? "ChiFree Radar demo";
  const sourceUrl = spec.sourceUrl ?? "https://github.com/mcher6/Free-chi";
  const eventUrl = spec.originalEventUrl ?? sourceUrl;
  const description = spec.description ?? "Demo event details.";

  return {
    id: spec.id,
    title: spec.title,
    normalizedTitle:
      spec.normalizedTitle ??
      spec.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    description,
    shortSummary:
      spec.shortSummary ??
      `${description.slice(0, 176).replace(/\s+\S*$/, "")}…`,
    sourceName,
    sourceUrl,
    originalEventUrl: eventUrl,
    canonicalUrl: spec.canonicalUrl ?? eventUrl,
    sourceLinks:
      spec.sourceLinks ??
      [{ sourceName, url: eventUrl, isPrimary: true, reliability: 0.9 }],
    imageUrl: spec.imageUrl ?? null,
    startDateTime: start,
    endDateTime: spec.endDateTime ?? addHours(start, 2),
    timezone: "America/Chicago",
    venueName: spec.venueName ?? null,
    address: spec.address ?? null,
    neighborhood: spec.neighborhood ?? null,
    city: "Chicago",
    state: "IL",
    postalCode: spec.postalCode ?? null,
    latitude: spec.latitude ?? null,
    longitude: spec.longitude ?? null,
    locationQuality:
      spec.locationQuality ??
      (spec.latitude === null || spec.latitude === undefined
        ? "missing"
        : "confirmed"),
    organizerName: spec.organizerName ?? null,
    organizerType: spec.organizerType ?? "unknown",
    registrationRequired: spec.registrationRequired ?? false,
    registrationUrl: spec.registrationUrl ?? eventUrl,
    priceText: spec.priceText ?? "Free",
    isFree: spec.isFree ?? true,
    freeConfidence: spec.freeConfidence ?? 0.96,
    freeExplanation:
      spec.freeExplanation ?? "Demo listing explicitly states free admission.",
    freebieType: spec.freebieType ?? [],
    freebieDescription: spec.freebieDescription ?? null,
    freebieAvailability: spec.freebieAvailability ?? "none",
    freebieConfidence: spec.freebieConfidence ?? 0,
    celebrityNames: spec.celebrityNames ?? [],
    celebrityConfidence: spec.celebrityConfidence ?? 0,
    celebrityLabel: spec.celebrityLabel ?? "none",
    notablePeople: spec.notablePeople ?? [],
    companyNames: spec.companyNames ?? [],
    companyConfidence: spec.companyConfidence ?? 0,
    companyInvolvement: spec.companyInvolvement ?? [],
    eventCategories: spec.eventCategories ?? ["community"],
    ageRestriction: spec.ageRestriction ?? null,
    attendanceFormat: spec.attendanceFormat ?? "in_person",
    environment: spec.environment ?? "unknown",
    familyFriendly: spec.familyFriendly ?? true,
    capacityLimited: spec.capacityLimited ?? false,
    status: spec.status ?? "published",
    firstSeenAt: now,
    lastSeenAt: now,
    scrapedAt: now,
    sourceReliability: spec.sourceReliability ?? 0.9,
    uniquenessScore: spec.uniquenessScore ?? 0.8,
    overallScore: spec.overallScore ?? 80,
    rankingExplanation:
      spec.rankingExplanation ??
      ["Strong free-admission evidence", "Reliable source"],
    deduplicationKey: spec.deduplicationKey ?? `seed:${spec.id}`,
    evidence:
      spec.evidence ??
      [proof("free", "Free admission", "The demo price is $0.", 0.96)],
    rawMetadata: {
      seed: true,
      disclaimer: seedDisclaimer,
      ...(spec.rawMetadata ?? {}),
    },
    seedLabel: seedDisclaimer,
  };
}

export function getSeedEvents(): EventRecord[] {
  const concert = futureIso(4, 18, 30);
  return [
    makeSeed({
      id: "seed-millennium-concert",
      title: "Millennium Park Summer Sounds",
      description:
        "A free open-air concert featuring Chicago artists. Seating is first come, first served.",
      startDateTime: concert,
      endDateTime: addHours(concert, 2.5),
      sourceName: "Chicago DCASE",
      sourceUrl: "https://www.chicago.gov/city/en/depts/dca.html",
      originalEventUrl: "https://www.chicago.gov/city/en/depts/dca.html",
      venueName: "Jay Pritzker Pavilion",
      address: "201 E Randolph St",
      neighborhood: "Loop",
      postalCode: "60601",
      latitude: 41.8826,
      longitude: -87.6226,
      organizerName: "Chicago DCASE",
      organizerType: "government",
      eventCategories: ["concert", "music", "outdoor"],
      environment: "outdoor",
      capacityLimited: true,
      overallScore: 94,
      rankingExplanation: [
        "Official source confirms free admission",
        "High-interest outdoor performance",
        "Central transit-friendly location",
      ],
      deduplicationKey: `millennium-sounds:${concert.slice(0, 10)}:pritzker`,
      sourceLinks: [
        {
          sourceName: "Chicago DCASE",
          url: "https://www.chicago.gov/city/en/depts/dca.html",
          isPrimary: true,
          reliability: 0.99,
        },
        {
          sourceName: "Choose Chicago",
          url: "https://www.choosechicago.com/events/",
          isPrimary: false,
          reliability: 0.88,
        },
      ],
      evidence: [
        proof("free", "Official listing says free admission", "Admission is free.", 0.99),
        proof("source", "Duplicate listings merged", "DCASE and Choose Chicago seed listings match on date and venue.", 0.95),
      ],
      rawMetadata: { mergedSeedListings: ["dcase-001", "choose-chi-001"] },
    }),
    makeSeed({
      id: "seed-library-workshop",
      title: "Build Your First Website Workshop",
      description:
        "Library staff lead a free beginner-friendly workshop. Laptops are available in limited quantities.",
      startDateTime: futureIso(5, 10),
      sourceName: "Chicago Public Library",
      sourceUrl: "https://chipublib.bibliocommons.com/events",
      originalEventUrl: "https://chipublib.bibliocommons.com/events",
      venueName: "Logan Square Branch",
      address: "3030 W Fullerton Ave",
      neighborhood: "Logan Square",
      postalCode: "60647",
      latitude: 41.9244,
      longitude: -87.7036,
      organizerName: "Chicago Public Library",
      organizerType: "government",
      registrationRequired: true,
      priceText: "Free with registration",
      freeConfidence: 0.98,
      freeExplanation: "Free with advance registration; capacity is limited.",
      eventCategories: ["workshop", "technology", "education"],
      environment: "indoor",
      capacityLimited: true,
      overallScore: 84,
    }),
    makeSeed({
      id: "seed-company-popup",
      title: "Future Pace Product Pop-up",
      description:
        "A fictional demo launch with hands-on demos, a DJ, and complimentary merchandise for the first 150 attendees.",
      startDateTime: futureIso(5, 12),
      sourceName: "Brand event page",
      sourceUrl: "https://www.nike.com/",
      originalEventUrl: "https://www.nike.com/chicago",
      venueName: "Morgan Manufacturing",
      address: "401 N Morgan St",
      neighborhood: "West Loop",
      postalCode: "60642",
      latitude: 41.8894,
      longitude: -87.6516,
      organizerName: "Nike",
      organizerType: "company",
      freebieType: ["merchandise", "product_samples"],
      freebieDescription: "Limited merchandise for the first 150 attendees.",
      freebieAvailability: "limited",
      freebieConfidence: 0.96,
      companyNames: ["Nike"],
      companyConfidence: 0.99,
      companyInvolvement: [{ name: "Nike", relationship: "hosted_by", confidence: 0.99, evidence: "Listed organizer" }],
      eventCategories: ["pop-up", "product launch", "music"],
      environment: "indoor",
      capacityLimited: true,
      overallScore: 92,
      rankingExplanation: ["Free major-brand launch", "High-confidence limited merchandise", "Limited capacity"],
    }),
    makeSeed({
      id: "seed-food-samples",
      title: "Chicago Makers Taste Lab",
      description:
        "Meet local makers and sample complimentary coffee, ice cream, snacks, and zero-proof drinks while supplies last.",
      startDateTime: futureIso(6, 11),
      sourceName: "Chicago Makers Collective",
      venueName: "Time Out Market Chicago",
      address: "916 W Fulton Market",
      neighborhood: "West Loop",
      postalCode: "60607",
      latitude: 41.8866,
      longitude: -87.6507,
      freebieType: ["food", "drinks", "product_samples"],
      freebieDescription: "Complimentary food and drink samples while supplies last.",
      freebieAvailability: "limited",
      freebieConfidence: 0.95,
      eventCategories: ["food", "pop-up", "community"],
      environment: "indoor",
      overallScore: 90,
    }),
    makeSeed({
      id: "seed-athlete-appearance",
      title: "Chicago Hoops Community Q&A",
      description:
        "A fictional demo community conversation listing WNBA star Angel Reese as featured guest. Reservation required.",
      startDateTime: futureIso(3, 17, 30),
      sourceName: "Community partner page",
      sourceUrl: "https://www.mccormickplace.com/events/",
      venueName: "Wintrust Arena",
      address: "200 E Cermak Rd",
      neighborhood: "South Loop",
      postalCode: "60616",
      latitude: 41.8537,
      longitude: -87.6217,
      registrationRequired: true,
      celebrityNames: ["Angel Reese"],
      celebrityConfidence: 0.96,
      celebrityLabel: "confirmed_appearance",
      notablePeople: [{ name: "Angel Reese", role: "featured guest", label: "confirmed_appearance", confidence: 0.96, evidence: "Explicitly listed in the demo guest field" }],
      eventCategories: ["sports", "panel", "meet and greet"],
      environment: "indoor",
      capacityLimited: true,
      overallScore: 93,
      rankingExplanation: ["Recognizable athlete explicitly listed", "Free with registration", "Limited capacity"],
    }),
    makeSeed({
      id: "seed-museum-day",
      title: "Illinois Resident Free Museum Day",
      description:
        "A fictional demo free-admission day for Illinois residents. Proof of residency may be requested.",
      startDateTime: futureIso(2, 10),
      endDateTime: futureIso(2, 18),
      sourceName: "Museum of Contemporary Art Chicago",
      sourceUrl: "https://visit.mcachicago.org/",
      venueName: "Museum of Contemporary Art Chicago",
      address: "220 E Chicago Ave",
      neighborhood: "Streeterville",
      postalCode: "60611",
      latitude: 41.8972,
      longitude: -87.6215,
      organizerType: "cultural_institution",
      priceText: "Free for Illinois residents",
      freeConfidence: 0.9,
      freeExplanation: "Free general admission for Illinois residents; restrictions apply.",
      freebieType: ["museum_admission"],
      freebieDescription: "General museum admission for eligible residents.",
      freebieAvailability: "guaranteed",
      freebieConfidence: 0.92,
      eventCategories: ["museum", "exhibition", "art"],
      environment: "indoor",
      overallScore: 86,
    }),
    makeSeed({
      id: "seed-park-movie",
      title: "Movies in the Parks: Family Night",
      description: "A free outdoor movie night. Bring a blanket or low chair.",
      startDateTime: futureIso(7, 20),
      sourceName: "Chicago Park District",
      sourceUrl: "https://www.chicagoparkdistrict.com/events",
      venueName: "Harrison Park",
      address: "1824 S Wood St",
      neighborhood: "Pilsen",
      postalCode: "60608",
      latitude: 41.8565,
      longitude: -87.6716,
      organizerType: "government",
      eventCategories: ["screening", "outdoor", "family"],
      environment: "outdoor",
      overallScore: 81,
    }),
    makeSeed({
      id: "seed-ambiguous-mixer",
      title: "Summer Rooftop Creative Mixer",
      description:
        "A fictional listing that says ‘free vibes’ but asks for a suggested donation and does not confirm ticket price.",
      startDateTime: futureIso(8, 19),
      sourceName: "Community calendar",
      sourceUrl: "https://www.eventbrite.com/d/il--chicago/free--events/",
      venueName: "Venue shared after RSVP",
      neighborhood: "West Town",
      registrationRequired: true,
      priceText: "Suggested donation; price unclear",
      isFree: false,
      freeConfidence: 0.42,
      freeExplanation: "Possibly free; promotional language and pricing are ambiguous.",
      eventCategories: ["networking", "rooftop"],
      familyFriendly: false,
      status: "review",
      sourceReliability: 0.58,
      overallScore: 39,
      rankingExplanation: ["Interesting format, but pricing is ambiguous", "Location needs confirmation"],
      evidence: [
        proof("free", "Ambiguous language", "‘Free vibes’ does not establish free admission.", 0.42),
        proof("location", "Location needs confirmation", "Address is withheld until RSVP.", 0.3),
      ],
    }),
  ];
}
