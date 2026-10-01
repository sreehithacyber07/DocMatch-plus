import { R2B_DEMONSTRATION_KNOWLEDGE } from '../data/demonstration/knowledge.ts';
import { R3_SAFETY_KNOWLEDGE } from './knowledge.ts';
import { validateSafetyKnowledge } from './validation.ts';

const report = validateSafetyKnowledge(R3_SAFETY_KNOWLEDGE, R2B_DEMONSTRATION_KNOWLEDGE);
if (!report.structureValid || !report.evidenceGrounded) {
  process.stderr.write(`${report.errors.map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('R3 SAFETY KNOWLEDGE STRUCTURALLY VALID\n');
  process.stdout.write('R3 SAFETY KNOWLEDGE EVIDENCE-GROUNDED\n');
  process.stdout.write('R3 CLINICAL REVIEW / PRODUCTION READINESS BLOCKED\n');
  for (const blocker of report.productionBlockers) {
    process.stdout.write(`${blocker.code}: ${blocker.message}\n`);
  }
}
