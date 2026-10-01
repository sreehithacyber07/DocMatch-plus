import type { R3HandoffItem } from '../types.ts';
import {
  AHA_CHEST_PAIN_SOURCE_ID,
  NHS_ARTHRITIS_SOURCE_ID,
  NHS_BREATHLESSNESS_SOURCE_ID,
  NHS_SPRAINS_SOURCE_ID,
  NICE_HEADACHE_SOURCE_ID,
  NICE_JOINT_PAIN_SOURCE_ID,
} from './sources.ts';

export const R3_HANDOFF_ITEMS: readonly R3HandoffItem[] = [
  {
    id: 'r3-review-upper-abdominal-exertion-sweating',
    complaintId: 'upper-abdominal-pain',
    concept: 'Upper-abdominal discomfort associated with exertion, unexpected sweating, or breathlessness',
    provenanceIds: [AHA_CHEST_PAIN_SOURCE_ID],
    reviewReason: 'The source treats these as potentially important cardiovascular assessment features; R3 must define any urgent handling.',
  },
  {
    id: 'r3-review-severe-breathing-difficulty',
    complaintId: 'shortness-of-breath',
    concept: 'Severe or rapidly worsening breathing difficulty and associated urgent features',
    provenanceIds: [NHS_BREATHLESSNESS_SOURCE_ID],
    reviewReason: 'The source separates emergency, urgent, and routine advice; R3 must review exact predicates and localization.',
  },
  {
    id: 'r3-review-headache-neurological-features',
    complaintId: 'headache',
    concept: 'Sudden-onset headache, new neurological deficit, fever, impaired consciousness, or recent head trauma',
    provenanceIds: [NICE_HEADACHE_SOURCE_ID],
    reviewReason: 'NICE recommends further evaluation or referral for these features; no preemption rule belongs in R2B.',
  },
  {
    id: 'r3-review-serious-injury-features',
    complaintId: 'joint-musculoskeletal-pain',
    concept: 'Deformity, numbness or tingling, color change, cold skin, or inability to bear weight after injury',
    provenanceIds: [NHS_SPRAINS_SOURCE_ID],
    reviewReason: 'The source assigns urgent or immediate action to some of these findings; R3 must define safe handling.',
  },
  {
    id: 'r3-review-hot-swollen-joint',
    complaintId: 'joint-musculoskeletal-pain',
    concept: 'A suddenly painful, hot, red, or swollen joint',
    provenanceIds: [NICE_JOINT_PAIN_SOURCE_ID, NHS_ARTHRITIS_SOURCE_ID],
    reviewReason: 'The sources identify this as needing additional or urgent assessment; it is outside R2B routing logic.',
  },
];
