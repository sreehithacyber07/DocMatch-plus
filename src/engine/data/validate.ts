/// <reference types="node" />

import { R2_PRODUCTION_KNOWLEDGE } from './knowledge.ts';
import { validateKnowledgeBase } from './validation.ts';

const report = validateKnowledgeBase(R2_PRODUCTION_KNOWLEDGE);

if (!report.structureValid) {
  console.error('R2 KNOWLEDGE INVALID');
  for (const issue of report.errors) console.error(`${issue.code} at ${issue.path}: ${issue.message}`);
  process.exitCode = 1;
} else if (!report.engineReady) {
  console.log('R2 KNOWLEDGE STRUCTURE VALID');
  console.log('R2 PRODUCTION READINESS BLOCKED: CLINICAL PARAMETERIZATION REQUIRED');
  for (const issue of report.blockers) console.log(`${issue.code} at ${issue.path}: ${issue.message}`);
} else {
  console.log('R2 KNOWLEDGE VALID');
}
