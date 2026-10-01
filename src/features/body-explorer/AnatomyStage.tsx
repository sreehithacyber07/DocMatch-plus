import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { BodyRegionId, NormalizedPoint } from '../../body/index.ts';
import {
  ARTWORK_VIEWBOX_HEIGHT,
  ARTWORK_VIEWBOX_WIDTH,
  shapeBounds,
  type HitRegion,
  type HitShape,
} from './artwork/hitmap-geometry.ts';
import type { BodyExplorerActions, BodyExplorerState } from './useBodyExplorer.ts';
import { faceArtwork } from './artwork/registry.ts';
import { FaceDetailStage } from './FaceDetailStage.tsx';
import type { FaceRegionId } from './faceHitMap.ts';

const MAX_ZOOM = 2.4;
const NUDGE = 0.02;

function Shape({ shape }: { shape: HitShape }) {
  if (shape.kind === 'ellipse') return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
  if (shape.kind === 'rect') {
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.cornerRadius} />;
  }
  return <path d={shape.d} />;
}

export type AnatomyStageProps = BodyExplorerState &
  Pick<
    BodyExplorerActions,
    'chooseRegion' | 'setHovered' | 'movePoint' | 'stepRegion' | 'clearSelection'
  > & {
    regionLabel: (regionId: BodyRegionId) => string;
    faceSubregionId: FaceRegionId | null;
    hoveredFaceSubregionId: FaceRegionId | null;
    facePrecision: 'general-area' | 'exact-point';
    facePoint: NormalizedPoint | null;
    onFaceSelect: (regionId: FaceRegionId) => void;
    onFaceHover: (regionId: FaceRegionId | null) => void;
    onFacePoint: (point: NormalizedPoint) => void;
  };

export function AnatomyStage(props: AnatomyStageProps) {
  const {
    artwork,
    orderedRegions,
    selection,
    hoveredRegionId,
    zoomBounds,
    chooseRegion,
    setHovered,
    movePoint,
    stepRegion,
    clearSelection,
    regionLabel,
    faceSubregionId,
    hoveredFaceSubregionId,
    facePrecision,
    facePoint,
    onFaceSelect,
    onFaceHover,
    onFacePoint,
  } = props;
  const reduceMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [readyFace, setReadyFace] = useState<string | null>(null);
  const faceSource = faceArtwork(props.variantId);

  useEffect(() => {
    if (!faceSource) return;
    let active = true;
    const image = new Image();
    image.src = faceSource;
    image.decode().then(() => { if (active) setReadyFace(faceSource); }).catch(() => { if (active) setReadyFace(null); });
    return () => { active = false; };
  }, [faceSource]);

  const assetKey = artwork.entry.assetId;
  const artworkReady = artwork.hasAsset && !failed[assetKey];
  const selectedId = selection.selectedRegionId;
  const faceRequested = selectedId === 'face' && selection.view === 'front';
  const showFace = faceRequested && readyFace === faceSource;
  const placingPoint = selection.painPrecision === 'exact-point';

  const selectedShape = orderedRegions.find((region) => region.regionId === selectedId)?.shape;
  const selectedBounds = selectedShape ? shapeBounds(selectedShape) : null;

  const zoomScale = zoomBounds
    ? Math.min(
        MAX_ZOOM,
        Math.min(ARTWORK_VIEWBOX_WIDTH / zoomBounds.width, ARTWORK_VIEWBOX_HEIGHT / zoomBounds.height),
      )
    : 1;
  const originX = zoomBounds ? ((zoomBounds.x + zoomBounds.width / 2) / ARTWORK_VIEWBOX_WIDTH) * 100 : 50;
  const originY = zoomBounds ? ((zoomBounds.y + zoomBounds.height / 2) / ARTWORK_VIEWBOX_HEIGHT) * 100 : 50;

  function pointFromEvent(event: PointerEvent<SVGElement>) {
    const svg = svgRef.current;
    if (!svg || !selectedBounds) return null;
    const rect = svg.getBoundingClientRect();
    const artX = ((event.clientX - rect.left) / rect.width) * ARTWORK_VIEWBOX_WIDTH;
    const artY = ((event.clientY - rect.top) / rect.height) * ARTWORK_VIEWBOX_HEIGHT;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return {
      x: clamp((artX - selectedBounds.x) / selectedBounds.width),
      y: clamp((artY - selectedBounds.y) / selectedBounds.height),
    };
  }

  function handleActivate(region: HitRegion, event: PointerEvent<SVGElement>) {
    if (placingPoint && region.regionId === selectedId) {
      const point = pointFromEvent(event);
      if (point) movePoint(point);
      return;
    }
    chooseRegion(region.regionId);
  }

  function handleKeyDown(event: KeyboardEvent<SVGElement>, region: HitRegion) {
    const isSelected = region.regionId === selectedId;
    if (placingPoint && isSelected && event.key.startsWith('Arrow')) {
      event.preventDefault();
      const current = selection.exactPoint ?? { x: 0.5, y: 0.5 };
      const dx = event.key === 'ArrowLeft' ? -NUDGE : event.key === 'ArrowRight' ? NUDGE : 0;
      const dy = event.key === 'ArrowUp' ? -NUDGE : event.key === 'ArrowDown' ? NUDGE : 0;
      movePoint({ x: Math.min(1, Math.max(0, current.x + dx)), y: Math.min(1, Math.max(0, current.y + dy)) });
      return;
    }
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        chooseRegion(region.regionId);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        stepRegion('next');
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        stepRegion('previous');
        break;
      case 'Escape':
        event.preventDefault();
        clearSelection();
        break;
      default:
        break;
    }
  }

  const markerPoint =
    selection.exactPoint && selectedBounds
      ? {
          x: selectedBounds.x + selection.exactPoint.x * selectedBounds.width,
          y: selectedBounds.y + selection.exactPoint.y * selectedBounds.height,
        }
      : null;

  return (
    <div className="stage">
      <span className="stage__light" aria-hidden="true" />

      <AnimatePresence initial={false} mode="wait">
        {showFace ? (
          <FaceDetailStage
            key={faceSource}
            variantId={props.variantId}
            selected={faceSubregionId}
            hovered={hoveredFaceSubregionId}
            precision={facePrecision}
            point={facePoint}
            onSelect={onFaceSelect}
            onHover={onFaceHover}
            onPoint={onFacePoint}
          />
        ) : (
          <motion.div
            key="body"
            className="stage__frame"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ scale: zoomScale, opacity: 1 }}
            exit={reduceMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, scale: 1.16, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            style={{ transformOrigin: faceRequested ? '50% 9%' : `${originX}% ${originY}%`, pointerEvents: faceRequested ? 'none' : 'auto' }}
          >
        {/*
          Layer artwork crossfades in place. Every asset shares one coordinate
          space and one frame, so the body never jumps between layers.
        */}
        <AnimatePresence initial={false}>
          {artworkReady ? (
            <motion.img
              className="stage__artwork"
              data-variant={artwork.entry.variantId}
              data-layer={artwork.entry.layer}
              key={assetKey}
              src={artwork.entry.assetRef}
              alt=""
              draggable={false}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
              onError={() => setFailed((current) => ({ ...current, [assetKey]: true }))}
            />
          ) : null}
        </AnimatePresence>

        <svg
          className="stage__hitmap"
          ref={svgRef}
          viewBox={`0 0 ${ARTWORK_VIEWBOX_WIDTH} ${ARTWORK_VIEWBOX_HEIGHT}`}
          role="listbox"
          aria-label="Body regions"
        >
          <g className="stage__regions">
            {orderedRegions.map((region, index) => {
              const isSelected = region.regionId === selectedId;
              const state = isSelected ? 'selected' : hoveredRegionId === region.regionId ? 'hover' : 'idle';
              return (
                <g
                  className="stage__region"
                  key={region.regionId}
                  data-state={state}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={regionLabel(region.regionId)}
                  tabIndex={isSelected || (selectedId === null && index === 0) ? 0 : -1}
                  onPointerDown={(event) => handleActivate(region, event)}
                  onPointerEnter={() => setHovered(region.regionId)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(region.regionId)}
                  onBlur={() => setHovered(null)}
                  onKeyDown={(event) => handleKeyDown(event, region)}
                >
                  <Shape shape={region.shape} />
                </g>
              );
            })}
          </g>

          {markerPoint ? (
            <g className="stage__marker" aria-hidden="true">
              <circle className="stage__marker-halo" cx={markerPoint.x} cy={markerPoint.y} r={30} />
              <line x1={markerPoint.x - 24} y1={markerPoint.y} x2={markerPoint.x - 10} y2={markerPoint.y} />
              <line x1={markerPoint.x + 10} y1={markerPoint.y} x2={markerPoint.x + 24} y2={markerPoint.y} />
              <line x1={markerPoint.x} y1={markerPoint.y - 24} x2={markerPoint.x} y2={markerPoint.y - 10} />
              <line x1={markerPoint.x} y1={markerPoint.y + 10} x2={markerPoint.x} y2={markerPoint.y + 24} />
              <circle className="stage__marker-core" cx={markerPoint.x} cy={markerPoint.y} r={7} />
            </g>
          ) : null}
        </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {!artworkReady ? (
        <div className="stage__pending">
          <p className="type-label">Artwork pending</p>
          <p className="type-body-small">
            Approved artwork for this combination has not been supplied yet. Region selection stays
            available.
          </p>
        </div>
      ) : null}
    </div>
  );
}
