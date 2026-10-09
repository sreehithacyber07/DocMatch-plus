import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BODY_DOMAIN,
  bodyRegionById,
  changeBodyLayer,
  changeBodyView,
  clearRegion,
  createBodySelectionState,
  getAdjacentKeyboardRegion,
  painLocationFromSelection,
  selectRegion,
  setPainPrecision,
  type BodyLayerId,
  type BodyRegionId,
  type BodySelectionState,
  type BodyView,
  type NormalizedPoint,
  type PainPrecision,
} from '../../body/index.ts';
import { candidateComplaintIdsForRegion } from '../../body/bridge/index.ts';
import { resolveArtwork, type ResolvedArtwork } from './artwork/registry.ts';
import { shapeBounds, type BodyVariantId, type HitRegion } from './artwork/hitmap-geometry.ts';

export type ZoomLevel = 'whole-body' | 'region';

export { lateralityLabel } from './laterality.ts';

export interface BodyExplorerState {
  variantId: BodyVariantId;
  selection: BodySelectionState;
  zoom: ZoomLevel;
  hoveredRegionId: BodyRegionId | null;
  artwork: ResolvedArtwork;
  /** Hit regions available in the current view, in keyboard traversal order. */
  orderedRegions: HitRegion[];
  selectedRegion: ReturnType<typeof bodyRegionById>;
  candidateComplaintIds: string[];
  painLocation: ReturnType<typeof painLocationFromSelection>;
  zoomBounds: { x: number; y: number; width: number; height: number } | null;
}

export interface BodyExplorerActions {
  setVariant: (variantId: BodyVariantId) => void;
  setView: (view: BodyView) => void;
  setLayer: (layer: BodyLayerId) => void;
  chooseRegion: (regionId: BodyRegionId) => void;
  clearSelection: () => void;
  setHovered: (regionId: BodyRegionId | null) => void;
  setPrecision: (precision: PainPrecision, point?: NormalizedPoint) => void;
  movePoint: (point: NormalizedPoint) => void;
  setZoom: (zoom: ZoomLevel) => void;
  stepRegion: (direction: 'next' | 'previous') => BodyRegionId | null;
}

export function useBodyExplorer(
  initialVariant: BodyVariantId,
  /** The same patient's earlier selection, when the explorer is remounted. */
  restored?: { selection: BodySelectionState; zoom: ZoomLevel },
): BodyExplorerState & BodyExplorerActions {
  const [variantId, setVariantId] = useState<BodyVariantId>(initialVariant);
  const [selection, setSelection] = useState<BodySelectionState>(() => restored?.selection ?? createBodySelectionState('front'));
  const [zoom, setZoomLevel] = useState<ZoomLevel>(() => restored?.zoom ?? 'whole-body');
  const [hoveredRegionId, setHoveredRegionId] = useState<BodyRegionId | null>(null);

  const artwork = useMemo(
    () => resolveArtwork(variantId, selection.view, selection.layer),
    [variantId, selection.view, selection.layer],
  );

  useEffect(() => {
    const adjacent = [
      resolveArtwork(variantId, selection.view === 'front' ? 'back' : 'front', selection.layer),
      resolveArtwork(variantId, selection.view, selection.layer === 'hologram' ? 'systems' : 'hologram'),
    ];
    for (const candidate of adjacent) {
      if (candidate.entry.assetRef) {
        const image = new Image();
        image.src = candidate.entry.assetRef;
      }
    }
  }, [variantId, selection.view, selection.layer]);

  // Traversal order comes from the frozen domain, intersected with the geometry
  // actually present in this hit map.
  const orderedRegions = useMemo(() => {
    const byId = new Map(artwork.hitMap.regions.map((region) => [region.regionId, region]));
    return BODY_DOMAIN.keyboardOrder[selection.view]
      .map((regionId) => byId.get(regionId))
      .filter((region): region is HitRegion => region !== undefined);
  }, [artwork, selection.view]);

  const selectedRegion = useMemo(
    () => (selection.selectedRegionId ? bodyRegionById(selection.selectedRegionId) : undefined),
    [selection.selectedRegionId],
  );

  const candidateComplaintIds = useMemo(
    () => (selection.selectedRegionId ? candidateComplaintIdsForRegion(selection.selectedRegionId) : []),
    [selection.selectedRegionId],
  );

  const painLocation = useMemo(() => painLocationFromSelection(selection), [selection]);

  const zoomBounds = useMemo(() => {
    if (zoom !== 'region' || !selection.selectedRegionId) return null;
    const region = orderedRegions.find((candidate) => candidate.regionId === selection.selectedRegionId);
    if (!region) return null;
    const bounds = shapeBounds(region.shape);
    // Breathing room so the region is inspected in context, not isolated.
    const padX = bounds.width * 0.55;
    const padY = bounds.height * 0.35;
    return {
      x: bounds.x - padX,
      y: bounds.y - padY,
      width: bounds.width + padX * 2,
      height: bounds.height + padY * 2,
    };
  }, [zoom, selection.selectedRegionId, orderedRegions]);

  const setView = useCallback((view: BodyView) => {
    setSelection((current) => changeBodyView(current, view));
    setZoomLevel('whole-body');
    setHoveredRegionId(null);
  }, []);

  const setLayer = useCallback((layer: BodyLayerId) => {
    setSelection((current) => changeBodyLayer(current, layer));
  }, []);

  const setVariant = useCallback((next: BodyVariantId) => {
    // Variant changes artwork only. Region semantics are identical across
    // variants, so a selection that exists in the new hit map is preserved.
    setVariantId(next);
    setHoveredRegionId(null);
  }, []);

  const chooseRegion = useCallback((regionId: BodyRegionId) => {
    setSelection((current) => selectRegion(current, regionId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelection((current) => clearRegion(current));
    setZoomLevel('whole-body');
  }, []);

  const setPrecision = useCallback((precision: PainPrecision, point?: NormalizedPoint) => {
    setSelection((current) => setPainPrecision(current, precision, point));
  }, []);

  const movePoint = useCallback((point: NormalizedPoint) => {
    setSelection((current) => setPainPrecision(current, 'exact-point', point));
  }, []);

  const stepRegion = useCallback(
    (direction: 'next' | 'previous') => {
      const available = new Set(orderedRegions.map((region) => region.regionId));
      let candidate = getAdjacentKeyboardRegion(selection.view, selection.selectedRegionId, direction);
      for (let guard = 0; guard < BODY_DOMAIN.regions.length && candidate; guard += 1) {
        if (available.has(candidate)) {
          setSelection((current) => selectRegion(current, candidate as BodyRegionId));
          return candidate;
        }
        candidate = getAdjacentKeyboardRegion(selection.view, candidate, direction);
      }
      return null;
    },
    [orderedRegions, selection.view, selection.selectedRegionId],
  );

  return {
    variantId,
    selection,
    zoom,
    hoveredRegionId,
    artwork,
    orderedRegions,
    selectedRegion,
    candidateComplaintIds,
    painLocation,
    zoomBounds,
    setVariant,
    setView,
    setLayer,
    chooseRegion,
    clearSelection,
    setHovered: setHoveredRegionId,
    setPrecision,
    movePoint,
    setZoom: setZoomLevel,
    stepRegion,
  };
}
