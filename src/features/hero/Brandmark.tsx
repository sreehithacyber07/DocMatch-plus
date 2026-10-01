import './brandmark.css';

const LOGO_SRC = '/logo.png';
/**
 * The same artwork downscaled to 512 x 171, the exact 2048 x 684 ratio. Compact marks render at most
 * 140 px wide, so this covers 3x displays at a fraction of the original's
 * transfer and decode cost. Larger sizes keep the full-resolution file.
 */
const COMPACT_SRC_SET = '/logo-512.png 512w, /logo.png 2048w';
const COMPACT_SIZES = '140px';

export type BrandmarkSize = 'compact' | 'full' | 'hero';

/**
 * The approved DocMatch identity.
 *
 * The supplied artwork already contains the wordmark, the "Precision in every
 * connection" line and the medical mark, so nothing is added beside it. It is
 * transparent, so it composites straight onto the surface with no plate behind
 * it, and it is only ever scaled by width to preserve its aspect ratio.
 */
export function Brandmark({ size = 'full' }: { size?: BrandmarkSize }) {
  const compact = size === 'compact';
  return (
    <img
      className="brandmark-image"
      data-size={size}
      src={LOGO_SRC}
      srcSet={compact ? COMPACT_SRC_SET : undefined}
      sizes={compact ? COMPACT_SIZES : undefined}
      alt="DocMatch, precision in every connection"
      draggable={false}
    />
  );
}
