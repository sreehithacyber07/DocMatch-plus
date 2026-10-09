import type { KnowledgeQuestion } from '../types.ts';
import { demonstrationBinaryQuestion, directionalStrengths } from './policy.ts';
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

export const UPPER_ABDOMINAL_PAIN_DEMONSTRATION_QUESTIONS: readonly KnowledgeQuestion[] = [
  demonstrationBinaryQuestion({
    id: 'upper-abdominal-pain-exertional',
    evidenceDimension: 'trigger',
    text: 'Does the discomfort get worse with physical activity?',
    evidenceIds: [AHA_CHEST_PAIN_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'upper-abdominal-pain-sweating',
    evidenceDimension: 'associated',
    text: 'Have you also been sweating unexpectedly?',
    evidenceIds: [AHA_CHEST_PAIN_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'strong' }),
    applicability: { kind: 'answer_equals', questionId: 'upper-abdominal-pain-exertional', optionId: 'yes' },
  }),
  demonstrationBinaryQuestion({
    id: 'upper-abdominal-pain-meal-relation',
    evidenceDimension: 'trigger',
    text: 'Does the discomfort seem related to eating?',
    evidenceIds: [NHS_INDIGESTION_SOURCE_ID, NICE_DYSPEPSIA_SOURCE_ID],
    yesStrengths: directionalStrengths({ gastroenterology: 'strong' }),
    applicability: { kind: 'answer_equals', questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
  }),
  demonstrationBinaryQuestion({
    id: 'upper-abdominal-pain-breathlessness',
    evidenceDimension: 'associated',
    text: 'Are you short of breath when the discomfort happens?',
    evidenceIds: [AHA_CHEST_PAIN_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'upper-abdominal-pain-burning',
    evidenceDimension: 'character',
    text: 'Do you also have a burning feeling behind your breastbone?',
    evidenceIds: [NHS_INDIGESTION_SOURCE_ID, NICE_DYSPEPSIA_SOURCE_ID],
    yesStrengths: directionalStrengths({ gastroenterology: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'upper-abdominal-pain-nausea-vomiting',
    evidenceDimension: 'associated',
    text: 'Have you felt sick or vomited with the discomfort?',
    evidenceIds: [AHA_CHEST_PAIN_SOURCE_ID, NICE_DYSPEPSIA_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'mild', gastroenterology: 'moderate' }),
  }),
];

export const SHORTNESS_OF_BREATH_DEMONSTRATION_QUESTIONS: readonly KnowledgeQuestion[] = [
  demonstrationBinaryQuestion({
    id: 'shortness-of-breath-ankle-swelling',
    evidenceDimension: 'sign',
    text: 'Have your ankles or lower legs been swollen?',
    evidenceIds: [NICE_HEART_FAILURE_SOURCE_ID, NHS_BREATHLESSNESS_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'shortness-of-breath-cough',
    evidenceDimension: 'associated',
    text: 'Have you also had a persistent cough?',
    evidenceIds: [NICE_ASTHMA_SOURCE_ID, NHS_BREATHLESSNESS_SOURCE_ID],
    yesStrengths: directionalStrengths({ pulmonology: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'shortness-of-breath-night-variation',
    evidenceDimension: 'timing',
    text: 'Is the breathing problem worse at night or early in the morning?',
    evidenceIds: [NICE_ASTHMA_SOURCE_ID],
    yesStrengths: directionalStrengths({ pulmonology: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'shortness-of-breath-palpitations',
    evidenceDimension: 'associated',
    text: 'Have you noticed your heartbeat racing, slowing, or fluttering?',
    evidenceIds: [NHS_BREATHLESSNESS_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'shortness-of-breath-lying-flat',
    evidenceDimension: 'trigger',
    text: 'Does the breathing problem get worse when you lie flat?',
    evidenceIds: [NICE_HEART_FAILURE_SOURCE_ID, NHS_BREATHLESSNESS_SOURCE_ID],
    yesStrengths: directionalStrengths({ cardiology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'shortness-of-breath-wheeze',
    evidenceDimension: 'character',
    text: 'Do you hear a wheezing or whistling sound when you breathe?',
    evidenceIds: [NICE_ASTHMA_SOURCE_ID],
    yesStrengths: directionalStrengths({ pulmonology: 'strong' }),
  }),
];

export const HEADACHE_DEMONSTRATION_QUESTIONS: readonly KnowledgeQuestion[] = [
  demonstrationBinaryQuestion({
    id: 'headache-activity-worsening',
    evidenceDimension: 'trigger',
    text: 'Does normal physical activity make the headache worse?',
    evidenceIds: [WHO_HEADACHE_SOURCE_ID],
    yesStrengths: directionalStrengths({ neurology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'headache-light-sound-sensitivity',
    evidenceDimension: 'associated',
    text: 'Are you more sensitive to light or sound during the headache?',
    evidenceIds: [WHO_HEADACHE_SOURCE_ID],
    yesStrengths: directionalStrengths({ neurology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'headache-nausea-vomiting',
    evidenceDimension: 'associated',
    text: 'Do you feel sick or vomit during the headache?',
    evidenceIds: [WHO_HEADACHE_SOURCE_ID],
    yesStrengths: directionalStrengths({ neurology: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'headache-one-sided',
    evidenceDimension: 'location',
    text: 'Is the headache mainly on one side of your head?',
    evidenceIds: [WHO_HEADACHE_SOURCE_ID],
    yesStrengths: directionalStrengths({ neurology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'headache-pulsating',
    evidenceDimension: 'character',
    text: 'Does the pain feel pulsating or throbbing?',
    evidenceIds: [WHO_HEADACHE_SOURCE_ID],
    yesStrengths: directionalStrengths({ neurology: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'headache-same-side-eye-nose',
    evidenceDimension: 'associated',
    text: 'Does the headache come with a watery or red eye, or a blocked or runny nose, on the same side?',
    evidenceIds: [WHO_HEADACHE_SOURCE_ID, NICE_HEADACHE_SOURCE_ID],
    yesStrengths: directionalStrengths({ neurology: 'moderate' }),
  }),
];

export const JOINT_MUSCULOSKELETAL_PAIN_DEMONSTRATION_QUESTIONS: readonly KnowledgeQuestion[] = [
  demonstrationBinaryQuestion({
    id: 'joint-musculoskeletal-pain-activity-related',
    evidenceDimension: 'trigger',
    text: 'Does movement or activity make the pain worse?',
    evidenceIds: [NICE_JOINT_PAIN_SOURCE_ID, NHS_ARTHRITIS_SOURCE_ID, AAOS_STRESS_FRACTURES_SOURCE_ID],
    yesStrengths: directionalStrengths({ orthopedics: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'joint-musculoskeletal-pain-injury',
    evidenceDimension: 'mechanism',
    text: 'Did the pain begin after a twist, fall, impact, or other injury?',
    evidenceIds: [NHS_SPRAINS_SOURCE_ID, AAOS_STRESS_FRACTURES_SOURCE_ID],
    yesStrengths: directionalStrengths({ orthopedics: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'joint-musculoskeletal-pain-morning-stiffness',
    evidenceDimension: 'timing',
    text: 'If the area is stiff after waking, does it ease within about 30 minutes?',
    evidenceIds: [NICE_JOINT_PAIN_SOURCE_ID],
    yesStrengths: directionalStrengths({ orthopedics: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'joint-musculoskeletal-pain-spasm',
    evidenceDimension: 'character',
    text: 'Have you had muscle spasms or cramping in the painful area?',
    evidenceIds: [NHS_SPRAINS_SOURCE_ID],
    yesStrengths: directionalStrengths({ orthopedics: 'moderate' }),
  }),
  demonstrationBinaryQuestion({
    id: 'joint-musculoskeletal-pain-swelling-bruising',
    evidenceDimension: 'sign',
    text: 'Is the painful area swollen or bruised?',
    evidenceIds: [NHS_SPRAINS_SOURCE_ID, NHS_ARTHRITIS_SOURCE_ID, AAOS_STRESS_FRACTURES_SOURCE_ID],
    yesStrengths: directionalStrengths({ orthopedics: 'strong' }),
  }),
  demonstrationBinaryQuestion({
    id: 'joint-musculoskeletal-pain-use-weight',
    evidenceDimension: 'function',
    text: 'Is it difficult to use the area normally or put weight on it?',
    evidenceIds: [NHS_SPRAINS_SOURCE_ID, AAOS_STRESS_FRACTURES_SOURCE_ID],
    yesStrengths: directionalStrengths({ orthopedics: 'strong' }),
  }),
];

export const R2B_DEMONSTRATION_QUESTIONS: readonly KnowledgeQuestion[] = [
  ...UPPER_ABDOMINAL_PAIN_DEMONSTRATION_QUESTIONS,
  ...SHORTNESS_OF_BREATH_DEMONSTRATION_QUESTIONS,
  ...HEADACHE_DEMONSTRATION_QUESTIONS,
  ...JOINT_MUSCULOSKELETAL_PAIN_DEMONSTRATION_QUESTIONS,
];
