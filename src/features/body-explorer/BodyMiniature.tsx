import type { BodyRegionId, BodyView } from '../../body/index.ts';
import {
  ARTWORK_VIEWBOX_HEIGHT,
  ARTWORK_VIEWBOX_WIDTH,
  hitMapFor,
  type BodyVariantId,
  type HitShape,
} from './artwork/hitmap-geometry.ts';
import { resolveArtwork } from './artwork/registry.ts';

function Shape({ shape }: { shape: HitShape }) {
  if (shape.kind === 'ellipse') return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
  if (shape.kind === 'rect') {
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.cornerRadius} />;
  }
  return <path d={shape.d} />;
}

export interface BodyMiniatureProps {
  variantId: BodyVariantId;
  view: BodyView;
  highlighted: readonly BodyRegionId[];
  /** Marks the highlight as the confirmed pain location rather than a preview. */
  tone?: 'preview' | 'selected';
  label?: string;
}

/**
 * A small real-artwork silhouette with a region highlighted. It reuses the
 * approved hologram asset, which the browser already has cached, so no
 * substitute body is drawn anywhere in the interface.
 */
export function BodyMiniature({
  variantId,
  view,
  highlighted,
  tone = 'preview',
  label,
}: BodyMiniatureProps) {
  const artwork = resolveArtwork(variantId, view, 'hologram');
  const hitMap = hitMapFor(variantId, view);
  const marked = new Set(highlighted);
  const shapes = hitMap.regions.filter((region) => marked.has(region.regionId));

  return (
    <span className="miniature" data-tone={tone} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {artwork.entry.assetRef ? (
        <img className="miniature__art" src={artwork.entry.assetRef} alt="" draggable={false} />
      ) : null}
      <svg
        className="miniature__marks"
        viewBox={`0 0 ${ARTWORK_VIEWBOX_WIDTH} ${ARTWORK_VIEWBOX_HEIGHT}`}
        aria-hidden="true"
      >
        {shapes.map((region) => (
          <g key={region.regionId}>
            <Shape shape={region.shape} />
          </g>
        ))}
      </svg>
    </span>
  );
}
