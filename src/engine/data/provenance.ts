import type { ProvenanceSource } from './types.ts';

export const R2_REQUIREMENT_SOURCE_ID = 'docmatch-r2-founder-requirement';

export const R2_REQUIREMENT_SOURCE: ProvenanceSource = {
  id: R2_REQUIREMENT_SOURCE_ID,
  organization: 'DocMatch+',
  title: 'R2 Clinical Knowledge Layer implementation specification',
  sourceType: 'product_requirement',
  reference: 'Founder-supplied R2 implementation brief',
  accessedAt: '2026-09-09',
  locator: 'Sections 7–18 and 24–26',
  scope: 'Product routing expectations and architecture requirements only; not clinical evidence.',
  notes: 'Requires independent clinical review and quantitative evidence before production parameterization.',
  reviewStatus: 'pending',
  evidenceStatus: 'product_requirement_only',
  version: 'r2-brief-1',
};
