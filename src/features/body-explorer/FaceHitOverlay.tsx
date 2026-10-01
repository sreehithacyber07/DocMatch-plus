import type { CSSProperties } from 'react';
import { FACE_HITMAP_VIEWBOX, FACE_HIT_REGIONS, type FaceRegionId } from './faceHitMap.ts';

export interface FaceHitOverlayProps {
  selected: FaceRegionId | null;
  hovered?: FaceRegionId | null;
  onSelect: (region: FaceRegionId) => void;
  onHover?: (region: FaceRegionId | null) => void;
  style?: CSSProperties;
}

/** The same semantic hit regions sit over either approved face asset. */
export function FaceHitOverlay({ selected, hovered = null, onSelect, onHover, style }: FaceHitOverlayProps) {
  const ordered = [...FACE_HIT_REGIONS].sort((a, b) => b.priority - a.priority);
  return (
    <svg className="face-hit-overlay" style={style} viewBox={`0 0 ${FACE_HITMAP_VIEWBOX.width} ${FACE_HITMAP_VIEWBOX.height}`} role="group" aria-label="Detailed face areas">
      {ordered.map((region) => (
        <path
          key={region.id}
          d={region.path}
          className="face-hit-overlay__region"
          data-region={region.id}
          data-selected={selected === region.id}
          data-hovered={hovered === region.id}
          role="button"
          aria-label={region.label}
          aria-pressed={selected === region.id}
          tabIndex={0}
          onClick={() => onSelect(region.id)}
          onPointerEnter={() => onHover?.(region.id)}
          onPointerLeave={() => onHover?.(null)}
          onFocus={() => onHover?.(region.id)}
          onBlur={() => onHover?.(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(region.id);
            }
          }}
        />
      ))}
    </svg>
  );
}
