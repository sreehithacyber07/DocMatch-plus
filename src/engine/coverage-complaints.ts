/**
 * Complaint-family identifiers shared by the presentation, routing-data and
 * safety layers. These identifiers describe evidence domains, not specialties.
 *
 * The name GENERIC_ADULT_COMPLAINT_IDS is historical. Since paediatric runs keep
 * their anatomy and concern instead of collapsing into an age band, these
 * families are asked of adults and children alike; age changes the wording,
 * the safety population and route eligibility, never the family.
 */
export const GENERIC_ADULT_COMPLAINT_IDS = [
  'lower-abdominal-pelvic-concern',
  'lower-abdominal-reproductive-concern',
  'chest-concern',
  'neck-concern',
  'throat-concern',
  'face-eye-concern',
  'face-ear-concern',
  'face-nose-concern',
  'face-oral-jaw-concern',
  'face-neurologic-concern',
  'face-general-concern',
  'regional-neurologic-concern',
  'regional-skin-concern',
  'general-region-concern',
  /*
    Coverage twins of the four weighted demonstration complaints. The weighted
    likelihoods and their R1 questions were written for adults, in adult
    wording, so an under-18 run with the same anatomy and concern uses these
    instead: the same clinical area, questioned through branch discriminators
    rather than adult Bayesian weights.
  */
  'head-concern',
  'chest-breathing-concern',
  'upper-abdominal-concern',
  'musculoskeletal-concern',
] as const;

/**
 * Legacy age-band families. New interviews never produce them; they stay
 * registered so earlier persisted assessments still validate and replay.
 */
export const PEDIATRIC_COMPLAINT_IDS = [
  'pediatric-under-five-region-concern',
  'pediatric-school-age-region-concern',
  'pediatric-adolescent-region-concern',
] as const;

/** Every fallback-only family, whatever the patient's age. */
export const ALL_COVERAGE_COMPLAINT_IDS = [...GENERIC_ADULT_COMPLAINT_IDS, ...PEDIATRIC_COMPLAINT_IDS] as const;

export const WEIGHTED_DEMONSTRATION_COMPLAINT_IDS = [
  'upper-abdominal-pain',
  'shortness-of-breath',
  'headache',
  'joint-musculoskeletal-pain',
] as const;
