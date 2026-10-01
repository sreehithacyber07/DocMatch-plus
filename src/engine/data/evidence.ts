export type EvidenceCategory = 'A' | 'B' | 'C' | 'D' | 'E';

export interface EvidenceRequirementClassification {
  id: string;
  category: EvidenceCategory;
  subject: string;
  disposition: string;
}

export const R2_EVIDENCE_CLASSIFICATION: readonly EvidenceRequirementClassification[] = [
  {
    id: 'r1-specialty-universe',
    category: 'A',
    subject: 'Six-specialty routing universe and stable identifiers',
    disposition: 'Supported directly by the frozen R1 contract and founder-supplied R2 specification.',
  },
  {
    id: 'upper-abdominal-pain-clinical-content',
    category: 'B',
    subject: 'Clinical suitability and wording of the upper-abdominal-pain complaint and questions',
    disposition: 'Requires clinical review; current provenance is a product requirement only.',
  },
  {
    id: 'remaining-complaint-scope',
    category: 'B',
    subject: 'Selection of approximately three additional presenting complaints',
    disposition: 'Requires founder and clinical scope approval before production inclusion.',
  },
  {
    id: 'complaint-routing-priors',
    category: 'C',
    subject: 'Normalized P(routing specialty | presenting complaint) priors',
    disposition: 'Requires reviewed quantitative evidence that was not supplied.',
  },
  {
    id: 'answer-specialty-likelihoods',
    category: 'C',
    subject: 'P(answer | routing specialty) for every question option and specialty',
    disposition: 'Requires reviewed direct parameterization; qualitative associations are insufficient.',
  },
  {
    id: 'urgent-assessment-rules',
    category: 'D',
    subject: 'Urgent or emergency handling for potentially concerning answer combinations',
    disposition: 'Belongs to R3 and is deliberately absent from R2.',
  },
  {
    id: 'synthetic-validation-fixtures',
    category: 'E',
    subject: 'Deterministic probability data used to test R2 loading and applicability',
    disposition: 'Safe only inside explicitly synthetic fixtures and excluded from production knowledge.',
  },
];
