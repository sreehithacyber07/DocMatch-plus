import type { PresentingComplaint } from '../types.ts';
import { KNOWLEDGE_VERSION } from '../version.ts';
import { demonstrationPrior } from './policy.ts';
import {
  AAOS_STRESS_FRACTURES_SOURCE_ID,
  AHA_CHEST_PAIN_SOURCE_ID,
  NHS_BREATHLESSNESS_SOURCE_ID,
  NHS_SPRAINS_SOURCE_ID,
  NICE_DYSPEPSIA_SOURCE_ID,
  NICE_HEADACHE_SOURCE_ID,
  NICE_JOINT_PAIN_SOURCE_ID,
  R2B_REQUIREMENT_SOURCE_ID,
  WHO_HEADACHE_SOURCE_ID,
  REGION_COVERAGE_REQUIREMENT_SOURCE_ID,
} from './sources.ts';
import { GENERIC_ADULT_COMPLAINT_IDS, PEDIATRIC_COMPLAINT_IDS } from '../../coverage-complaints.ts';

const COVERAGE_ONLY_COMPLAINTS: readonly PresentingComplaint[] = [
  ...GENERIC_ADULT_COMPLAINT_IDS,
  ...PEDIATRIC_COMPLAINT_IDS,
].map((id) => ({
  id,
  label: id.startsWith('pediatric-') ? 'Pediatric regional concern' : 'Regional symptom concern',
  routingMode: 'fallback_only' as const,
  prior: demonstrationPrior({}, [REGION_COVERAGE_REQUIREMENT_SOURCE_ID]),
  questionIds: [],
  provenanceIds: [REGION_COVERAGE_REQUIREMENT_SOURCE_ID],
  knowledgeVersion: KNOWLEDGE_VERSION,
}));

export const R2B_DEMONSTRATION_COMPLAINTS: readonly PresentingComplaint[] = [
  {
    id: 'upper-abdominal-pain',
    label: 'Upper abdominal pain',
    prior: demonstrationPrior(
      { gastroenterology: 'primary', cardiology: 'secondary' },
      [AHA_CHEST_PAIN_SOURCE_ID, NICE_DYSPEPSIA_SOURCE_ID],
    ),
    questionIds: [
      'upper-abdominal-pain-exertional',
      'upper-abdominal-pain-sweating',
      'upper-abdominal-pain-meal-relation',
      'upper-abdominal-pain-breathlessness',
      'upper-abdominal-pain-burning',
      'upper-abdominal-pain-nausea-vomiting',
    ],
    provenanceIds: [R2B_REQUIREMENT_SOURCE_ID, AHA_CHEST_PAIN_SOURCE_ID, NICE_DYSPEPSIA_SOURCE_ID],
    knowledgeVersion: KNOWLEDGE_VERSION,
  },
  {
    id: 'shortness-of-breath',
    label: 'Shortness of breath',
    prior: demonstrationPrior(
      { cardiology: 'primary', pulmonology: 'primary' },
      [NHS_BREATHLESSNESS_SOURCE_ID],
    ),
    questionIds: [
      'shortness-of-breath-ankle-swelling',
      'shortness-of-breath-cough',
      'shortness-of-breath-night-variation',
      'shortness-of-breath-palpitations',
      'shortness-of-breath-lying-flat',
      'shortness-of-breath-wheeze',
    ],
    provenanceIds: [R2B_REQUIREMENT_SOURCE_ID, NHS_BREATHLESSNESS_SOURCE_ID],
    knowledgeVersion: KNOWLEDGE_VERSION,
  },
  {
    id: 'headache',
    label: 'Headache',
    prior: demonstrationPrior(
      { neurology: 'primary' },
      [WHO_HEADACHE_SOURCE_ID, NICE_HEADACHE_SOURCE_ID],
    ),
    questionIds: [
      'headache-activity-worsening',
      'headache-light-sound-sensitivity',
      'headache-nausea-vomiting',
      'headache-one-sided',
      'headache-pulsating',
      'headache-same-side-eye-nose',
    ],
    provenanceIds: [R2B_REQUIREMENT_SOURCE_ID, WHO_HEADACHE_SOURCE_ID, NICE_HEADACHE_SOURCE_ID],
    knowledgeVersion: KNOWLEDGE_VERSION,
  },
  {
    id: 'joint-musculoskeletal-pain',
    label: 'Joint or muscle pain',
    prior: demonstrationPrior(
      { orthopedics: 'primary' },
      [NICE_JOINT_PAIN_SOURCE_ID, NHS_SPRAINS_SOURCE_ID, AAOS_STRESS_FRACTURES_SOURCE_ID],
    ),
    questionIds: [
      'joint-musculoskeletal-pain-activity-related',
      'joint-musculoskeletal-pain-injury',
      'joint-musculoskeletal-pain-morning-stiffness',
      'joint-musculoskeletal-pain-spasm',
      'joint-musculoskeletal-pain-swelling-bruising',
      'joint-musculoskeletal-pain-use-weight',
    ],
    provenanceIds: [
      R2B_REQUIREMENT_SOURCE_ID,
      NICE_JOINT_PAIN_SOURCE_ID,
      NHS_SPRAINS_SOURCE_ID,
      AAOS_STRESS_FRACTURES_SOURCE_ID,
    ],
    knowledgeVersion: KNOWLEDGE_VERSION,
  },
  ...COVERAGE_ONLY_COMPLAINTS,
];
