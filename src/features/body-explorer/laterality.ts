import type { BodyLaterality } from '../../body/index.ts';

/**
 * Patient-facing side chip in the Body Explorer. Deliberately empty: the
 * region's own name already says the side ("Left knee"), so the explorer does
 * not repeat it as a separate label.
 */
export function lateralityLabel(laterality: BodyLaterality): string | null {
  void laterality;
  return null;
}

/**
 * The patient-relative side for clinical records (the SOAP handoff and the
 * staff workspace). Patient-relative wording comes from the body domain, never
 * screen position, and a sided region is never recorded as midline.
 */
export function patientRelativeSide(laterality: BodyLaterality): string | null {
  if (laterality === 'left') return 'Your left side';
  if (laterality === 'right') return 'Your right side';
  return null;
}
