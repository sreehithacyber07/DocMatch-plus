/// <reference types="node" />

import { R2B_DEMONSTRATION_KNOWLEDGE } from './demonstration/knowledge.ts';
import { validateDemonstrationReadiness } from './validation.ts';

const report = validateDemonstrationReadiness(R2B_DEMONSTRATION_KNOWLEDGE);
if (report.structureValid && report.engineReady) {
  console.log('R2B DEMONSTRATION KNOWLEDGE VALID');
  console.log('FOR DEMONSTRATION ONLY — NOT CLINICALLY VALIDATED');
} else {
  console.error('R2B DEMONSTRATION KNOWLEDGE INVALID');
  for (const issue of [...report.errors, ...report.blockers]) {
    console.error(`${issue.code} at ${issue.path}: ${issue.message}`);
  }
  process.exitCode = 1;
}
