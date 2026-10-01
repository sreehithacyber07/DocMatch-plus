import type { EvidenceRegisterEntry } from '../types.ts';
import {
  AAOS_STRESS_FRACTURES_SOURCE_ID,
  AHA_CHEST_PAIN_SOURCE_ID,
  NHS_ARTHRITIS_SOURCE_ID,
  NHS_BREATHLESSNESS_SOURCE_ID,
  NHS_INDIGESTION_SOURCE_ID,
  NHS_SPRAINS_SOURCE_ID,
  NICE_ASTHMA_SOURCE_ID,
  NICE_DYSPEPSIA_SOURCE_ID,
  NICE_HEADACHE_SOURCE_ID,
  NICE_HEART_FAILURE_SOURCE_ID,
  NICE_JOINT_PAIN_SOURCE_ID,
  WHO_HEADACHE_SOURCE_ID,
} from './sources.ts';

const BAYESIAN_LIMITATION =
  'Supports the directional clinical relationship. It does not validate the demonstration Bayesian magnitude, a cross-specialty prior, or a stopping threshold.';

export const R2B_EVIDENCE_REGISTER: readonly EvidenceRegisterEntry[] = [
  {
    sourceId: AHA_CHEST_PAIN_SOURCE_ID,
    concepts: ['upper-abdominal discomfort', 'physical exertion', 'unexpected sweating', 'breathlessness', 'nausea', 'meal relation'],
    supports: 'These features are relevant when assessing symptoms that can have a cardiovascular origin.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NHS_INDIGESTION_SOURCE_ID,
    concepts: ['relation to eating', 'burning discomfort', 'fullness', 'bloating', 'nausea', 'regurgitation'],
    supports: 'These observable features are relevant to upper gastrointestinal symptom assessment.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NICE_DYSPEPSIA_SOURCE_ID,
    concepts: ['epigastric pain', 'heartburn', 'regurgitation', 'bloating', 'nausea', 'vomiting', 'food precipitants'],
    supports: 'These concepts belong in an assessment of dyspepsia-type presentations.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NICE_ASTHMA_SOURCE_ID,
    concepts: ['wheeze', 'cough', 'breathlessness', 'chest tightness', 'night or morning variation', 'triggers'],
    supports: 'A structured respiratory history asks about these symptoms and their variation.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NICE_HEART_FAILURE_SOURCE_ID,
    concepts: ['exertional breathlessness', 'breathlessness lying flat', 'nocturnal cough', 'ankle swelling', 'exercise tolerance'],
    supports: 'These concepts are relevant when assessing breathlessness with possible cardiac involvement.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NHS_BREATHLESSNESS_SOURCE_ID,
    concepts: ['activity pattern', 'lying-flat pattern', 'ankle swelling', 'persistent cough', 'palpitations', 'heart and lung causes'],
    supports: 'These questions are relevant to assessing shortness of breath and potential care direction.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: WHO_HEADACHE_SOURCE_ID,
    concepts: ['neurological presentation', 'one-sided pain', 'pulsating pain', 'activity worsening', 'nausea', 'light and sound sensitivity', 'eye or nasal symptoms'],
    supports: 'These are recognized observable characteristics of headache presentations.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NICE_HEADACHE_SOURCE_ID,
    concepts: ['frequency', 'duration', 'severity', 'associated symptoms', 'precipitants', 'features requiring further evaluation'],
    supports: 'These concepts are relevant to structured headache assessment and referral consideration.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NICE_JOINT_PAIN_SOURCE_ID,
    concepts: ['activity-related joint pain', 'morning stiffness duration', 'trauma', 'rapid worsening', 'hot swollen joint'],
    supports: 'These features are relevant to musculoskeletal assessment.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NHS_SPRAINS_SOURCE_ID,
    concepts: ['injury', 'pain', 'tenderness', 'weakness', 'swelling', 'bruising', 'weight-bearing', 'normal use', 'spasm'],
    supports: 'These observable features belong in an assessment of joint or muscle pain after possible injury.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: NHS_ARTHRITIS_SOURCE_ID,
    concepts: ['joint pain', 'swelling', 'stiffness', 'movement difficulty', 'hot or red joint'],
    supports: 'These observable joint features are clinically relevant assessment concepts.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
  {
    sourceId: AAOS_STRESS_FRACTURES_SOURCE_ID,
    concepts: ['activity or overuse', 'injury', 'focal pain', 'swelling', 'bruising', 'weight-bearing', 'orthopaedic evaluation'],
    supports: 'These observable injury and loading features have direct relevance to orthopaedic assessment.',
    doesNotSupport: BAYESIAN_LIMITATION,
  },
];
