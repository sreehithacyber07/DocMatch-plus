import { ENGINE_VERSION } from '../config.ts';
import { KNOWLEDGE_VERSION } from '../data/version.ts';
import type { SafetyKnowledgeBase } from './types.ts';
import { R3_SAFETY_PAYLOADS } from './payloads.ts';
import { R3_SAFETY_QUESTIONS } from './questions.ts';
import { R3_RED_FLAG_RULES } from './rules.ts';
import { R3_SAFETY_SOURCES } from './sources.ts';
import { SAFETY_VERSION } from './version.ts';

export const R3_SAFETY_KNOWLEDGE: SafetyKnowledgeBase = {
  safetyVersion: SAFETY_VERSION,
  compatibleEngineVersion: ENGINE_VERSION,
  compatibleKnowledgeVersion: KNOWLEDGE_VERSION,
  readiness: 'evidence_grounded_demonstration',
  sources: R3_SAFETY_SOURCES,
  questions: R3_SAFETY_QUESTIONS,
  rules: R3_RED_FLAG_RULES,
  payloads: R3_SAFETY_PAYLOADS,
};
