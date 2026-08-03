function confidenceThreshold(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : fallback;
}

/** Explainable score configuration. Component maximums total 100. */
export const scoringConfig = {
  weights: {
    freeConfidence: 20,
    notableRelevance: 18,
    companyInvolvement: 12,
    freebieValue: 18,
    sourceReliability: 10,
    uniqueness: 7,
    descriptionCompleteness: 5,
    proximity: 5,
    discoveryRecency: 5,
  },
  bonuses: {
    guaranteedValuableFreebie: 4,
    limitedCapacity: 2,
    recognizablePerson: 3,
    majorLaunchOrPopup: 2,
    officialSourceConfirmation: 2,
  },
  penalties: {
    ambiguousPricing: 8,
    missingAddress: 4,
    missingDate: 25,
    duplicate: 12,
    lowQualitySource: 5,
    misleadingSweepstakes: 6,
    outsideChicagoArea: 10,
  },
  publicationThresholds: {
    freeConfidence: confidenceThreshold(
      process.env.SCRAPER_PUBLISH_THRESHOLD,
      0.78,
    ),
    classificationReviewFloor: 0.42,
  },
  duplicateThreshold: 0.72,
  maxScore: 100,
  minScore: 0,
} as const;

export type ScoringConfig = typeof scoringConfig;
