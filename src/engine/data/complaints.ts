import { R2_REQUIREMENT_SOURCE_ID } from './provenance.ts';
import type { PresentingComplaint, ProposedComplaint } from './types.ts';
import { R2A_ARCHITECTURE_VERSION } from './version.ts';

export const UPPER_ABDOMINAL_PAIN_COMPLAINT: PresentingComplaint = {
  id: 'upper-abdominal-pain',
  label: 'Upper abdominal pain',
  prior: {
    status: 'blocked',
    reason: 'No supported complaint-specific routing prior has been supplied.',
    requiredEvidence: 'A reviewed normalized routing prior over all six specialties.',
    provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
  },
  questionIds: [
    'upper-abdominal-pain-exertional',
    'upper-abdominal-pain-sweating',
    'upper-abdominal-pain-meal-relation',
  ],
  provenanceIds: [R2_REQUIREMENT_SOURCE_ID],
  knowledgeVersion: R2A_ARCHITECTURE_VERSION,
};

export const PROPOSED_COMPLAINT_SCOPE: readonly ProposedComplaint[] = [
  {
    id: 'shortness-of-breath',
    label: 'Shortness of breath',
    status: 'founder_clinical_selection_required',
    intendedCoverage: ['pulmonology', 'cardiology'],
  },
  {
    id: 'headache',
    label: 'Headache',
    status: 'founder_clinical_selection_required',
    intendedCoverage: ['neurology'],
  },
  {
    id: 'joint-pain',
    label: 'Joint pain',
    status: 'founder_clinical_selection_required',
    intendedCoverage: ['orthopedics'],
  },
  {
    id: 'skin-concern',
    label: 'Skin concern',
    status: 'founder_clinical_selection_required',
    intendedCoverage: ['dermatology'],
  },
];
