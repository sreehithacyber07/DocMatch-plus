/**
 * The five intensity marks.
 *
 * Hand drawn on the same 24-unit grid as the rest of the pictogram set, so they
 * belong to this product rather than borrowing a platform emoji font. Each step
 * changes three things at once, which is what makes the ramp readable at a
 * glance and still legible to anyone who cannot distinguish the colours:
 *
 *   brow      level       relaxed, then progressively drawn in
 *   eyes      level       open, then squeezed shut at the top of the scale
 *   mouth     level       eased, flat, then drawn down and open
 *
 * Colour is the fourth signal, never the only one.
 */
export type PainExpressionLevel = 1 | 2 | 3 | 4 | 5;

const BROW: Record<PainExpressionLevel, string> = {
  1: 'M6.6 9h3.2M14.2 9h3.2',
  2: 'M6.6 9h3.2M14.2 9h3.2',
  3: 'M6.6 9.2 9.8 8.6M14.2 8.6l3.2 0.6',
  4: 'M6.6 9.8 9.9 8.1M14.1 8.1l3.3 1.7',
  5: 'M6.3 10.4 9.9 7.9M14.1 7.9l3.6 2.5',
};

const EYES: Record<PainExpressionLevel, string> = {
  1: 'M8.4 11.4v1.2M15.6 11.4v1.2',
  2: 'M8.4 11.4v1.2M15.6 11.4v1.2',
  3: 'M8.4 11.5v1.1M15.6 11.5v1.1',
  4: 'M7.1 12.2c0.9-1 1.9-1 2.8 0M14.1 12.2c0.9-1 1.9-1 2.8 0',
  5: 'm7.2 11.2 2.4 2.2m0-2.2-2.4 2.2m7.2-2.2 2.4 2.2m0-2.2-2.4 2.2',
};

const MOUTH: Record<PainExpressionLevel, string> = {
  1: 'M7.6 15.4c2.6 2.4 6.2 2.4 8.8 0',
  2: 'M8.2 15.8c2.2 1.4 5.4 1.4 7.6 0',
  3: 'M8.2 16.4h7.6',
  4: 'M7.8 17.6c2.4-2.2 5.9-2.2 8.4 0',
  5: 'M8 18.6c0-2.6 8-2.6 8 0 0 1.6-8 1.6-8 0Z',
};

export function PainExpression({ level }: { level: PainExpressionLevel }) {
  return (
    <svg className="pain-face" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="pain-face__head" cx="12" cy="12" r="10.2" />
      <path className="pain-face__brow" d={BROW[level]} />
      <path className="pain-face__eyes" d={EYES[level]} />
      <path className="pain-face__mouth" d={MOUTH[level]} data-filled={level === 5 ? 'true' : undefined} />
      {level >= 4 ? <path className="pain-face__tension" d="M3.4 13.4h1.8M18.8 13.4h1.8" /> : null}
    </svg>
  );
}
