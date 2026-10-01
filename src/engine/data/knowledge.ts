import { ENGINE_VERSION } from '../config.ts';
import { UPPER_ABDOMINAL_PAIN_COMPLAINT } from './complaints.ts';
import { R2_REQUIREMENT_SOURCE } from './provenance.ts';
import { UPPER_ABDOMINAL_PAIN_QUESTIONS } from './questions.ts';
import type { KnowledgeBase } from './types.ts';
import { R2A_ARCHITECTURE_VERSION } from './version.ts';

export const R2_PRODUCTION_KNOWLEDGE: KnowledgeBase = {
  mode: 'production',
  knowledgeVersion: R2A_ARCHITECTURE_VERSION,
  compatibleEngineVersion: ENGINE_VERSION,
  sources: [R2_REQUIREMENT_SOURCE],
  complaints: [UPPER_ABDOMINAL_PAIN_COMPLAINT],
  questions: UPPER_ABDOMINAL_PAIN_QUESTIONS,
};
