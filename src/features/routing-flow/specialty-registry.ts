/**
 * The canonical specialty registry.
 *
 * Taxonomy source: the National Board of Examinations in Medical Sciences
 * (NBEMS), the Indian body that awards DNB (broad specialty) and DrNB (super
 * specialty) qualifications. Canonical names below are copied from the NBEMS
 * discipline lists, verified 2026-09-15:
 *
 *   broad specialties   https://natboard.edu.in/dnbbroad
 *   super specialties   https://natboard.edu.in/dnbsuper
 *
 * Only patient-facing clinical disciplines relevant to hospital routing are
 * registered. Laboratory, basic-science and administrative disciplines on the
 * same lists (Anatomy, Biochemistry, Pathology, Hospital Administration, and so
 * on) are omitted on purpose: a patient is never routed to them.
 *
 * TAXONOMY IS NOT ROUTING.
 *
 * Being in this registry says a specialty exists. It says nothing about whether
 * DocMatch+ can send a patient there. General Medicine and Paediatrics are
 * parent-service endpoints for adult and under-18 runs that reach neither of
 * the two evidence routes below; neither is a scored Bayesian candidate.
 *
 * THERE ARE TWO WAYS A ROUTE CAN BE ENABLED, AND THEY ARE DIFFERENT CLAIMS.
 *
 *   active-demonstration
 *     The R1 belief vector scores it, from approved likelihoods for an approved
 *     complaint. Six such candidates exist and no more can be added without
 *     calibration.
 *
 *   rule-gated-referral-criteria
 *     No probability exists for it at all, and none is invented. It is reached
 *     only when the deterministic criteria in direction-gate.ts are satisfied
 *     by patient-reported answers, and every criterion there cites the
 *     published clinical page that states it. This is how ENT, Obstetrics and
 *     Gynaecology, Urology and Ophthalmology became reachable without anyone
 *     inventing a likelihood for them.
 *
 * Everything else is registered and disabled, with the missing evidence named
 * in `evidenceStatus`. Flipping a flag here without either an approved
 * likelihood or a published criterion would manufacture medical accuracy.
 */
import type { SpecialtyId } from '../../engine/index.ts';

export type SpecialtyCategory = 'broad' | 'super';

export type EvidenceStatus =
  | 'active-demonstration'
  | 'fallback-endpoint'
  | 'rule-gated-referral-criteria'
  | 'proposed-needs-review'
  | 'not-modelled';

/**
 * What the registry can honestly say about a service. A record can carry more
 * than one: Orthopaedics is weighted for adults AND gated for children.
 *
 *   ROUTABLE_SOURCE_BACKED           reached through published criteria
 *   ROUTABLE_WEIGHTED_DEMONSTRATION  reached through the R1 demonstration weights
 *   SHARED_SERVICE                   children reach it with adults
 *   PARENT_SERVICE                   General Medicine or Paediatrics
 *   FACILITY_DEPENDENT               whether it exists depends on the hospital
 *   REGISTRY_ONLY                    exists in NBEMS; no route in this model
 *   NEEDS_CLINICAL_EVIDENCE          a route was considered and the evidence or
 *                                    calibration is not there yet
 *   DISABLED                         never presentable
 */
export type RegistryState =
  | 'ROUTABLE_SOURCE_BACKED'
  | 'ROUTABLE_WEIGHTED_DEMONSTRATION'
  | 'SHARED_SERVICE'
  | 'PARENT_SERVICE'
  | 'FACILITY_DEPENDENT'
  | 'REGISTRY_ONLY'
  | 'NEEDS_CLINICAL_EVIDENCE'
  | 'DISABLED';

export interface SpecialtyRecord {
  id: string;
  registryStates: readonly RegistryState[];
  /** Why a disabled or registry-only record is not routable, in one sentence. */
  notRoutableReason?: string;
  /** Exact NBEMS discipline name. */
  canonicalName: string;
  /** What a patient reads. */
  patientFacingName: string;
  category: SpecialtyCategory;
  routingEnabled: boolean;
  /**
   * True when this route can be reached by the deterministic source-backed
   * criteria in direction-gate.ts. No probability is computed on that path.
   * A record may ALSO be weighted (Gastroenterology, Orthopaedics); whether a
   * belief may select it is `weightedRoutingEnabled`, never this flag.
   */
  directionGated?: boolean;
  /** The R1 candidate this record renders, when it is one. */
  engineSpecialtyId?: SpecialtyId;
  /**
   * Whether the R1 belief vector may select this record. Separate from
   * `routingEnabled`: Dermatology is routable through published skin criteria
   * but has no directional likelihoods, so a belief tie must never present it.
   */
  weightedRoutingEnabled?: boolean;
  /** Approved complaints that can produce this outcome today. */
  supportedComplaints: readonly string[];
  evidenceStatus: EvidenceStatus;
  source: string;
}

const BROAD = 'https://natboard.edu.in/dnbbroad';
const SUPER = 'https://natboard.edu.in/dnbsuper';

const ALL_COMPLAINTS = [
  'upper-abdominal-pain',
  'shortness-of-breath',
  'headache',
  'joint-musculoskeletal-pain',
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
  'regional-skin-concern',
  'general-region-concern',
] as const;

const PEDIATRIC_COMPLAINTS = [
  'pediatric-under-five-region-concern',
  'pediatric-school-age-region-concern',
  'pediatric-adolescent-region-concern',
] as const;

function disabled(
  id: string,
  canonicalName: string,
  patientFacingName: string,
  category: SpecialtyCategory,
  evidenceStatus: EvidenceStatus = 'not-modelled',
  notRoutableReason = 'Registered from the NBEMS taxonomy; no symptom-led referral criteria are modelled for it.',
  registryStates: readonly RegistryState[] = ['REGISTRY_ONLY'],
): SpecialtyRecord {
  return {
    id,
    registryStates,
    notRoutableReason,
    canonicalName,
    patientFacingName,
    category,
    routingEnabled: false,
    supportedComplaints: [],
    evidenceStatus,
    source: category === 'broad' ? BROAD : SUPER,
  };
}

const CHILD_FAMILIES = [
  'head-concern',
  'chest-breathing-concern',
  'upper-abdominal-concern',
  'musculoskeletal-concern',
] as const;

export const SPECIALTY_REGISTRY: readonly SpecialtyRecord[] = [
  /* --- Parent services ---------------------------------------------------- */
  {
    id: 'general-medicine',
    registryStates: ['PARENT_SERVICE'],
    canonicalName: 'General Medicine',
    patientFacingName: 'General Medicine',
    category: 'broad',
    routingEnabled: true,
    supportedComplaints: ALL_COMPLAINTS,
    evidenceStatus: 'fallback-endpoint',
    source: BROAD,
  },
  {
    /*
      A parent service that is also source-backed. Where NICE or NHS guidance
      names paediatric expertise for a child's pattern (recurrent urinary
      infection, constipation not responding to treatment, regular headaches,
      a child's joint problem, a child's breathing problem), the direction
      gate reaches Paediatrics through those criteria and the result says
      why. Otherwise it is the named fallback for an under-18 run.
    */
    id: 'paediatrics',
    registryStates: ['PARENT_SERVICE', 'ROUTABLE_SOURCE_BACKED'],
    canonicalName: 'Paediatrics',
    patientFacingName: 'Paediatrics',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: [...PEDIATRIC_COMPLAINTS, ...ALL_COMPLAINTS, ...CHILD_FAMILIES],
    evidenceStatus: 'fallback-endpoint',
    source: BROAD,
  },

  /* --- Weighted demonstration routes (adults) ----------------------------- */
  {
    /*
      Reachable both ways. The weighted breathing and upper abdominal complaints
      rarely converge on it (the demonstration likelihoods need calibration);
      adult chest pain and palpitations reach it through the direction gate on
      NICE CG95, NHS Angina and NHS Heart palpitations criteria, computing no
      probability.
    */
    id: 'cardiology',
    registryStates: ['ROUTABLE_WEIGHTED_DEMONSTRATION', 'ROUTABLE_SOURCE_BACKED', 'NEEDS_CLINICAL_EVIDENCE'],
    notRoutableReason: 'The weighted path needs clinical calibration (SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED); the source-backed chest pain and palpitations criteria are adult-only.',
    canonicalName: 'Cardiology',
    patientFacingName: 'Cardiology',
    category: 'super',
    routingEnabled: true,
    directionGated: true,
    engineSpecialtyId: 'cardiology',
    weightedRoutingEnabled: true,
    supportedComplaints: ['upper-abdominal-pain', 'shortness-of-breath', 'chest-concern'],
    evidenceStatus: 'active-demonstration',
    source: SUPER,
  },
  {
    id: 'respiratory-medicine',
    registryStates: ['ROUTABLE_WEIGHTED_DEMONSTRATION', 'ROUTABLE_SOURCE_BACKED'],
    canonicalName: 'Respiratory Medicine',
    patientFacingName: 'Respiratory Medicine',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    engineSpecialtyId: 'pulmonology',
    weightedRoutingEnabled: true,
    supportedComplaints: ['shortness-of-breath'],
    evidenceStatus: 'active-demonstration',
    source: BROAD,
  },
  {
    /*
      Source-gated only. NICE NG127 names neurological assessment for slowly
      progressive limb or neck weakness (1.7.5) and for one-sided facial pain
      set off by touch and not helped by treatment (1.3.2); the direction gate
      reaches Neurology on exactly those. Headache can also reach it through
      the separate NICE CG150 source-backed criteria; the headache belief still
      never presents it, so `weightedRoutingEnabled` stays off. Adults only;
      there is no paediatric neurology route.
    */
    id: 'neurology',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'NEEDS_CLINICAL_EVIDENCE'],
    notRoutableReason:
      'The weighted headache path remains uncalibrated; adult source-backed NICE CG150 and NG127 criteria are routable without changing its likelihoods.',
    canonicalName: 'Neurology',
    patientFacingName: 'Neurology',
    category: 'super',
    routingEnabled: true,
    directionGated: true,
    engineSpecialtyId: 'neurology',
    weightedRoutingEnabled: false,
    supportedComplaints: ['headache', 'regional-neurologic-concern', 'neck-concern', 'face-general-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: SUPER,
  },
  {
    /*
      Reachable both ways. `upper-abdominal-pain` scores it through the R1
      belief vector from approved likelihoods. The adult bowel-change families
      reach it only through the direction gate, on the NHS constipation
      criteria, and compute no probability.
    */
    id: 'medical-gastroenterology',
    registryStates: ['ROUTABLE_WEIGHTED_DEMONSTRATION', 'ROUTABLE_SOURCE_BACKED'],
    canonicalName: 'Medical Gastroenterology',
    patientFacingName: 'Gastroenterology',
    category: 'super',
    routingEnabled: true,
    directionGated: true,
    engineSpecialtyId: 'gastroenterology',
    weightedRoutingEnabled: true,
    supportedComplaints: ['upper-abdominal-pain', 'lower-abdominal-pelvic-concern', 'general-region-concern', 'chest-concern'],
    evidenceStatus: 'active-demonstration',
    source: SUPER,
  },
  {
    /*
      Weighted for adults with joint or muscle pain; gated, on NHS joint, knee
      and sprain criteria with NICE NG38 orthopaedic follow-up, for a child's
      injury and an adult's persisting limb swelling. Children reach it as a
      shared service.
    */
    id: 'orthopaedics',
    registryStates: ['ROUTABLE_WEIGHTED_DEMONSTRATION', 'ROUTABLE_SOURCE_BACKED', 'SHARED_SERVICE'],
    canonicalName: 'Orthopaedics',
    patientFacingName: 'Orthopaedics',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    engineSpecialtyId: 'orthopedics',
    weightedRoutingEnabled: true,
    supportedComplaints: ['joint-musculoskeletal-pain', 'musculoskeletal-concern', 'general-region-concern'],
    evidenceStatus: 'active-demonstration',
    source: BROAD,
  },
  {
    /*
      A frozen R1 belief key with no directional likelihoods, so it can never
      win on weights. It is now reachable only through the source-backed skin
      criteria (NICE CG153, CG57, NG12 and NHS Moles). The R1 key stays in the
      vector for compatibility; route-eligibility.ts never presents it from a
      belief.
    */
    id: 'dermatology',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'SHARED_SERVICE'],
    canonicalName: 'Dermatology, Venereology and Leprosy',
    patientFacingName: 'Dermatology',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    engineSpecialtyId: 'dermatology',
    supportedComplaints: ['regional-skin-concern', 'face-general-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: BROAD,
  },

  /* --- Routable through the source-backed direction gate ------------------
     These have no calibrated R1 likelihoods and are NOT Bayesian candidates.
     They are reachable only when the deterministic criteria in
     direction-gate.ts are satisfied by patient-reported answers, and each
     criterion there cites the published page that states it.
     --------------------------------------------------------------------- */
  {
    id: 'otorhinolaryngology',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'SHARED_SERVICE'],
    canonicalName: 'Otorhinolaryngology (ENT)',
    patientFacingName: 'ENT',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['headache', 'face-ear-concern', 'face-nose-concern', 'throat-concern', 'neck-concern', 'face-general-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: BROAD,
  },
  {
    id: 'obstetrics-gynaecology',
    registryStates: ['ROUTABLE_SOURCE_BACKED'],
    canonicalName: 'Obstetrics and Gynaecology',
    patientFacingName: 'Obstetrics and Gynaecology',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['lower-abdominal-reproductive-concern', 'lower-abdominal-pelvic-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: BROAD,
  },
  {
    id: 'urology',
    registryStates: ['ROUTABLE_SOURCE_BACKED'],
    canonicalName: 'Urology',
    patientFacingName: 'Urology',
    category: 'super',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['lower-abdominal-pelvic-concern', 'general-region-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: SUPER,
  },
  {
    id: 'ophthalmology',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'SHARED_SERVICE'],
    canonicalName: 'Ophthalmology',
    patientFacingName: 'Eye care',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['face-eye-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: BROAD,
  },
  {
    /*
      PENDING CLINICAL REVIEW. The one record outside the NBEMS medical
      taxonomy: dentistry is regulated by the Dental Council of India (BDS
      and MDS), not NBEMS. It is registered because NHS Toothache, Dental
      abscess and Gum disease send tooth and gum problems to a dentist and say
      a GP surgery cannot provide dental care, so a medical parent service is
      the wrong destination for them. Whether the hospital has a dental
      department is facility dependent.
    */
    id: 'dentistry',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'SHARED_SERVICE', 'FACILITY_DEPENDENT', 'NEEDS_CLINICAL_EVIDENCE'],
    canonicalName: 'Dentistry (Dental Council of India)',
    patientFacingName: 'Dental care',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['face-oral-jaw-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: 'https://dciindia.gov.in/',
  },
  {
    /*
      PENDING CLINICAL REVIEW. Previously registry-only ("inflammatory joint
      patterns need examination and tests"). Now reachable only through the
      NICE NG100 criteria in direction-gate.ts: a reported swollen joint not
      after an injury plus a further NG100 or NHS feature. It is never a
      Bayesian candidate.
    */
    id: 'clinical-immunology-rheumatology',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'NEEDS_CLINICAL_EVIDENCE'],
    canonicalName: 'Clinical Immunology and Rheumatology',
    patientFacingName: 'Rheumatology',
    category: 'super',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['joint-musculoskeletal-pain'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: SUPER,
  },
  {
    /*
      PENDING CLINICAL REVIEW. Previously registry-only ("an acute surgical
      abdomen is an R3 escalation; no elective criteria"). The acute abdomen
      stays with R3. Elective routes now exist through two sourced gates: a
      hernia (NHS Hernia) and a breast change (NHS Breast lumps, NICE NG12
      1.4). Adults only; a child's lump goes to Paediatrics.
    */
    id: 'general-surgery',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'NEEDS_CLINICAL_EVIDENCE'],
    canonicalName: 'General Surgery',
    patientFacingName: 'General Surgery',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['general-region-concern', 'lower-abdominal-pelvic-concern', 'upper-abdominal-concern', 'chest-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: BROAD,
  },
  {
    /*
      PENDING CLINICAL REVIEW. Previously registry-only. Reachable only
      through the NICE CG168 1.2 criteria: symptomatic varicose veins, a
      bleeding varicose vein, a leg ulcer not healed in 2 weeks, or a hard
      painful vein with varicose veins. A one-leg clot pattern is excluded and
      handled by the urgent R3 check. Adults only.
    */
    id: 'vascular-surgery',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'NEEDS_CLINICAL_EVIDENCE', 'FACILITY_DEPENDENT'],
    canonicalName: 'Vascular Surgery',
    patientFacingName: 'Vascular Surgery',
    category: 'super',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['joint-musculoskeletal-pain', 'musculoskeletal-concern', 'regional-skin-concern', 'general-region-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: SUPER,
  },
  {
    /*
      Phase 4, PENDING CLINICAL REVIEW. Previously registry-only. Reachable
      only through the NICE NG249 1.1.3 falls criteria, for people aged 65 and
      over injured in a fall: the fall plus 2 or more falls in the last year,
      or being unable to get up independently afterwards. NHS Falls says a GP
      may refer to a specialist falls service. Adults 65 and over only.
    */
    id: 'geriatric-medicine',
    registryStates: ['ROUTABLE_SOURCE_BACKED', 'NEEDS_CLINICAL_EVIDENCE', 'FACILITY_DEPENDENT'],
    canonicalName: 'Geriatric Medicine',
    patientFacingName: 'Geriatric Medicine',
    category: 'broad',
    routingEnabled: true,
    directionGated: true,
    supportedComplaints: ['musculoskeletal-concern', 'general-region-concern', 'face-general-concern', 'face-oral-jaw-concern', 'face-nose-concern', 'head-concern'],
    evidenceStatus: 'rule-gated-referral-criteria',
    source: BROAD,
  },

  /* --- Registered, not routable ------------------------------------------- */
  disabled('family-medicine', 'Family Medicine', 'Family Medicine', 'broad', 'not-modelled',
    'Overlaps the General Medicine parent service in this kiosk; no separate criteria.', ['REGISTRY_ONLY', 'FACILITY_DEPENDENT']),
  disabled('emergency-medicine', 'Emergency Medicine', 'Emergency Medicine', 'broad', 'not-modelled',
    'Emergencies are handled by the R3 safety escalation, never by ordinary specialty routing.', ['DISABLED']),
  disabled('psychiatry', 'Psychiatry', 'Psychiatry', 'broad'),
  disabled('physical-medicine-rehabilitation', 'Physical Medicine and Rehabilitation', 'Physical Medicine and Rehabilitation', 'broad'),
  disabled('nephrology', 'Nephrology', 'Nephrology', 'super', 'proposed-needs-review',
    'No symptom-led kiosk criterion separates a renal referral; upper urinary features stay with the parent service.', ['NEEDS_CLINICAL_EVIDENCE']),
  disabled('critical-care-medicine', 'Critical Care Medicine', 'Critical Care Medicine', 'super', 'not-modelled',
    'Reached through emergency escalation, never ordinary routing.', ['DISABLED']),
  disabled('endocrinology', 'Endocrinology', 'Endocrinology', 'super', 'not-modelled',
    'No symptom-led kiosk criterion; endocrine referral depends on tests.', ['NEEDS_CLINICAL_EVIDENCE']),
  disabled('neurosurgery', 'Neuro Surgery', 'Neurosurgery', 'super'),
  disabled('surgical-gastroenterology', 'Surgical Gastroenterology', 'Surgical Gastroenterology', 'super'),
  disabled('cardiovascular-thoracic-surgery', 'Cardio Vascular & Thoracic Surgery', 'Cardiothoracic Surgery', 'super'),
  disabled('clinical-haematology', 'Clinical Haematology', 'Haematology', 'super'),
  /*
    NBEMS paediatric super-specialties. NBEMS establishes that they exist; it
    does not establish symptom X to specialty Y. No symptom-led referral
    criterion that a kiosk can ask was found for them in this pass, so each is
    registry-only and a child with those presentations is questioned and then
    sent to Paediatrics with a named reason.
  */
  disabled('paediatric-cardiology', 'Paediatric Cardiology', 'Paediatric Cardiology', 'super', 'not-modelled',
    'No symptom-led referral criterion was found; cardiac assessment of a child starts in Paediatrics.', ['REGISTRY_ONLY', 'NEEDS_CLINICAL_EVIDENCE', 'FACILITY_DEPENDENT']),
  disabled('paediatric-neurology', 'Paediatric Neurology', 'Paediatric Neurology', 'super', 'not-modelled',
    'NHS Headaches in children names no specialist referral; acute neurological danger is an R3 escalation.', ['REGISTRY_ONLY', 'NEEDS_CLINICAL_EVIDENCE', 'FACILITY_DEPENDENT']),
  disabled('paediatric-surgery', 'Paediatric Surgery', 'Paediatric Surgery', 'super', 'not-modelled',
    'NICE CG99 names paediatric surgery only after failed optimum management; an acute surgical abdomen is an R3 escalation.', ['REGISTRY_ONLY', 'NEEDS_CLINICAL_EVIDENCE', 'FACILITY_DEPENDENT']),
  disabled('paediatric-critical-care', 'Paediatric Critical Care', 'Paediatric Critical Care', 'super', 'not-modelled',
    'Reached through emergency escalation, never ordinary routing.', ['DISABLED']),
  disabled('neonatology', 'Neonatology', 'Neonatology', 'super', 'not-modelled',
    'The kiosk holds age in completed years and cannot identify a neonate; young-infant danger signs are an R3 escalation.', ['REGISTRY_ONLY', 'FACILITY_DEPENDENT']),
];

/** The endpoint for a run that did not converge. */
export const GENERAL_MEDICINE = SPECIALTY_REGISTRY.find((record) => record.id === 'general-medicine')!;
export const PAEDIATRICS = SPECIALTY_REGISTRY.find((record) => record.id === 'paediatrics')!;

export function specialtyForEngineId(specialtyId: SpecialtyId): SpecialtyRecord {
  const record = SPECIALTY_REGISTRY.find((candidate) => candidate.engineSpecialtyId === specialtyId);
  if (!record) throw new TypeError(`No registry record renders engine specialty ${specialtyId}.`);
  return record;
}

/** Whether the belief vector may present this record at all. */
export function isWeightedRoutable(record: SpecialtyRecord): boolean {
  return record.routingEnabled && record.weightedRoutingEnabled === true && record.engineSpecialtyId !== undefined;
}

export function routableSpecialties(): SpecialtyRecord[] {
  return SPECIALTY_REGISTRY.filter((record) => record.routingEnabled);
}

/** Routes reached by the deterministic direction gate rather than by belief. */
export function directionGatedSpecialties(): SpecialtyRecord[] {
  return SPECIALTY_REGISTRY.filter((record) => record.routingEnabled && record.directionGated === true);
}

/**
 * The record a satisfied direction gate renders.
 *
 * Throws rather than falling back, because a gate that names a direction the
 * registry cannot render is a wiring bug and must not be hidden behind a
 * parent service.
 */
export function specialtyForDirectionId(directionId: string): SpecialtyRecord {
  const record = SPECIALTY_REGISTRY.find((candidate) => candidate.id === directionId);
  if (!record) throw new TypeError(`No registry record for direction ${directionId}.`);
  if (!record.routingEnabled) throw new TypeError(`Direction ${directionId} is registered but not routable.`);
  return record;
}
