import type { SafetyPayload } from './types.ts';
import { INDIA_ERSS_SOURCE_ID } from './sources.ts';

export const INDIA_EMERGENCY_PAYLOAD_ID = 'india-emergency-medical-assessment';
export const URGENT_ASSESSMENT_PAYLOAD_ID = 'urgent-medical-assessment';

export const R3_SAFETY_PAYLOADS: readonly SafetyPayload[] = [
  {
    id: INDIA_EMERGENCY_PAYLOAD_ID,
    severity: 'emergency',
    headline: 'Get emergency medical help now',
    guidance:
      'Your answers include warning signs that need immediate medical assessment. Call 112 now, or ask someone with you to call. Do not drive yourself.',
    primaryAction: {
      kind: 'call_emergency_number',
      label: 'Call 112',
      number: '112',
      countryCode: 'IN',
    },
    continuationPolicy: 'must_stop',
    provenanceIds: [INDIA_ERSS_SOURCE_ID],
  },
  {
    id: URGENT_ASSESSMENT_PAYLOAD_ID,
    severity: 'urgent',
    headline: 'Urgent clinical review advised',
    guidance:
      'Your answers include warning signs that need urgent medical assessment. Contact a local urgent medical service now. If the situation becomes an emergency, call 112.',
    primaryAction: {
      kind: 'seek_urgent_assessment',
      label: 'Get urgent medical help',
    },
    secondaryAction: {
      kind: 'call_emergency_number',
      label: 'Call 112 in an emergency',
      number: '112',
      countryCode: 'IN',
    },
    continuationPolicy: 'may_continue_after_acknowledgement',
    provenanceIds: [INDIA_ERSS_SOURCE_ID],
  },
];
