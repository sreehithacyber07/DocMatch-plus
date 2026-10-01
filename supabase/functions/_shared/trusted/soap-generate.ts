import { buildSoapHandoff } from '../../../../src/features/routing-flow/soap-handoff.ts';
import { intakeQuestionsFor } from '../../../../src/features/routing-flow/intake-questions.ts';
import { GENERAL_MEDICINE, SPECIALTY_REGISTRY } from '../../../../src/features/routing-flow/specialty-registry.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from '../../../../src/engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../../../src/engine/safety/index.ts';
import type { PainLocation } from '../../../../src/body/index.ts';
import type { TimelineEntry } from '../../../../src/features/routing-flow/timeline-types.ts';
import { TrustedError } from './contract.ts';
import { validateSoapSections, type SoapSectionsRecord, type TrustedSoapInputs } from './soap-boundary.ts';

/** Render only accepted server-loaded answer IDs through the pinned catalogs. */
export function generateTrustedSoap(input: TrustedSoapInputs): SoapSectionsRecord {
  const complaint = R2B_DEMONSTRATION_KNOWLEDGE.complaints.find((item) => item.id === input.complaintId);
  const direction = SPECIALTY_REGISTRY.find((item) => item.id === input.routing.selectedSpecialtyRegistryId);
  if (!complaint || !direction || !direction.routingEnabled) throw new TrustedError('INVALID_EVIDENCE');

  const timeline: TimelineEntry[] = [];
  for (const answer of input.routingAnswers) {
    const question = R2B_DEMONSTRATION_KNOWLEDGE.questions.find((item) => item.id === answer.questionId);
    const option = question?.options.find((item) => item.id === answer.optionId);
    if (!question || !option) throw new TrustedError('INVALID_EVIDENCE');
    timeline.push({ kind: 'routing', questionId: answer.questionId, text: question.text,
      label: option.label, answeredAt: '', changeable: false });
  }
  for (const answer of input.safetyAnswers) {
    const question = R3_SAFETY_KNOWLEDGE.questions.find((item) => item.kind === 'safety_owned' && item.id === answer.questionId);
    if (!question || question.kind !== 'safety_owned') throw new TrustedError('INVALID_EVIDENCE');
    const option = question.options.find((item) => item.id === answer.optionId);
    if (!option) throw new TrustedError('INVALID_EVIDENCE');
    timeline.push({ kind: 'safety', questionId: answer.questionId, text: question.text,
      label: option.label, answeredAt: '', changeable: false });
  }

  const location: PainLocation | null = input.body?.precision === 'exact-point'
    ? { regionId: input.body.regionId, precision: 'exact-point', point: input.body.point! }
    : input.body
      ? { regionId: input.body.regionId, precision: 'general-area' }
      : null;
  const sections = buildSoapHandoff({
    complaintLabel: complaint.label,
    complaintSource: input.complaintSource,
    capture: { painLocation: location, view: input.body?.view ?? null },
    intakePlan: intakeQuestionsFor(input.complaintId),
    intakeAnswers: input.intakeAnswers.map((answer) => ({ ...answer, answeredAt: '' })),
    timeline,
    converged: input.routing.converged,
    directionLabel: direction.patientFacingName || GENERAL_MEDICINE.patientFacingName,
  });
  return validateSoapSections(Object.fromEntries(sections.map((section) => [section.key, section.lines])));
}
