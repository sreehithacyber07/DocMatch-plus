import { ENGINE_VERSION } from '../../config.ts';
import type { KnowledgeBase } from '../types.ts';
import { KNOWLEDGE_VERSION } from '../version.ts';
import { R2B_DEMONSTRATION_COMPLAINTS } from './complaints.ts';
import { R2B_DEMONSTRATION_QUESTIONS } from './questions.ts';
import { DEMONSTRATION_SOURCES } from './sources.ts';

export const R2B_DEMONSTRATION_KNOWLEDGE: KnowledgeBase = {
  mode: 'demonstration',
  knowledgeVersion: KNOWLEDGE_VERSION,
  compatibleEngineVersion: ENGINE_VERSION,
  sources: DEMONSTRATION_SOURCES,
  complaints: R2B_DEMONSTRATION_COMPLAINTS,
  questions: R2B_DEMONSTRATION_QUESTIONS,
};
