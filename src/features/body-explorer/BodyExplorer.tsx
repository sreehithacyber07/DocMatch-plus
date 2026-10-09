import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bodyRegionById,
  type BodyRegionId,
  type BodySelectionState,
  type BodyView,
  type NormalizedPoint,
  type PainLocation,
} from '../../body/index.ts';
import { Pictogram } from '../../components/pictograms';
import type { PatientContext } from '../intake/patient-context.ts';
import { AnatomyStage } from './AnatomyStage.tsx';
import { StageTitle, Stepper, TopBar } from './Chrome.tsx';
import {
  ConfirmSelection,
  FaceContextPanel,
  FaceRegionRail,
  HowToUse,
  SelectedArea,
  SelectedAreaSummary,
  SessionNote,
  StructuresRightPanels,
  SystemsNextAction,
  SystemsRightPanels,
} from './ContextPanels.tsx';
import { RegionSelector } from './RegionSelector.tsx';
import { LayerSwitcher, ViewControls } from './StageControls.tsx';
import type { ComplaintSource } from './unmapped-regions.ts';
import { lateralityLabel, useBodyExplorer, type ZoomLevel } from './useBodyExplorer.ts';
import type { BodyVariantId } from './artwork/hitmap-geometry.ts';
import type { FaceRegionId } from './faceHitMap.ts';
import type { RegionAssessmentContext } from './clinical-coverage.ts';
import { RegionConcernEntry } from './RegionConcernEntry.tsx';
import './body-explorer.css';

/**
 * The patient's place on the body map, so the route screen can keep it in page
 * memory (never browser storage) and restore it if the explorer is remounted
 * for the same patient. Presentation state only.
 */
export interface BodySnapshot {
  explicitVariant: BodyVariantId | null;
  variant: BodyVariantId;
  selection: BodySelectionState;
  zoom: ZoomLevel;
  faceSubregionId: FaceRegionId | null;
  facePrecision: 'general-area' | 'exact-point';
  facePoint: NormalizedPoint | null;
  returnView: BodyView;
  concernEntryOpen: boolean;
}

export interface BodyExplorerProps {
  presentationVariant: BodyVariantId | null;
  deploymentLabel: string;
  patientContext: PatientContext;
  onNewPatient: () => void;
  /** The same patient's earlier place on the body map, when remounted. */
  snapshot?: BodySnapshot;
  /** Receives the explorer's place whenever it changes. */
  onSnapshot?: (snapshot: BodySnapshot) => void;
  /**
   * The body never selects a specialty. It resolves a complaint through the
   * frozen bridge, or carries a complaint the patient stated at a region the
   * bridge does not map, and hands off to the routing flow. Which of the two
   * happened travels with the complaint so the handoff can say so.
   */
  onComplaintConfirmed: (
    complaintId: string,
    painLocation: unknown,
    source: ComplaintSource,
    view: BodyView,
    clinicalContext: RegionAssessmentContext,
    /** The artwork shown, for the associated location step. Presentation only. */
    variantId: BodyVariantId,
  ) => void;
}

export function BodyExplorer({ presentationVariant, deploymentLabel, patientContext, onNewPatient, onComplaintConfirmed, snapshot, onSnapshot }: BodyExplorerProps) {
  const [explicitVariant, setExplicitVariant] = useState<BodyVariantId | null>(() => snapshot?.explicitVariant ?? null);
  const chosenVariant = presentationVariant ?? explicitVariant;
  if (!chosenVariant) {
    return (
      <div className="explorer explorer--presentation-choice">
        <TopBar view="front" deploymentLabel={deploymentLabel} onNewPatient={onNewPatient} />
        <main className="explorer__presentation-choice">
          <p className="type-label">Body diagram preference</p>
          <h1>Choose a diagram to locate your concern.</h1>
          <p>This changes only the artwork you see. It does not change questions, safety checks or routing.</p>
          <div className="explorer__presentation-options">
            <button type="button" className="ghost-button" onClick={() => setExplicitVariant('female')}>Female diagram</button>
            <button type="button" className="ghost-button" onClick={() => setExplicitVariant('male')}>Male diagram</button>
          </div>
          <p className="type-caption">BODY_PRESENTATION_FOR_VARIATION_NOT_YET_SPECIFIED</p>
        </main>
      </div>
    );
  }
  return (
    <BodyExplorerStage
      key={chosenVariant}
      variant={chosenVariant}
      deploymentLabel={deploymentLabel}
      patientContext={patientContext}
      onNewPatient={onNewPatient}
      onComplaintConfirmed={onComplaintConfirmed}
      explicitVariant={explicitVariant}
      snapshot={snapshot?.variant === chosenVariant ? snapshot : undefined}
      onSnapshot={onSnapshot}
    />
  );
}

function BodyExplorerStage({
  variant,
  deploymentLabel,
  patientContext,
  onNewPatient,
  onComplaintConfirmed,
  explicitVariant,
  snapshot,
  onSnapshot,
}: Omit<BodyExplorerProps, 'presentationVariant'> & { variant: BodyVariantId; explicitVariant: BodyVariantId | null }) {
  const explorer = useBodyExplorer(variant, snapshot);
  const { selection, selectedRegion, zoom } = explorer;
  const [faceSubregionId, setFaceSubregionId] = useState<FaceRegionId | null>(() => snapshot?.faceSubregionId ?? null);
  const [hoveredFaceSubregionId, setHoveredFaceSubregionId] = useState<FaceRegionId | null>(null);
  const [facePrecision, setFacePrecision] = useState<'general-area' | 'exact-point'>(() => snapshot?.facePrecision ?? 'general-area');
  const [facePoint, setFacePoint] = useState<NormalizedPoint | null>(() => snapshot?.facePoint ?? null);
  const [returnView, setReturnView] = useState<BodyView>(() => snapshot?.returnView ?? 'front');
  const [concernEntryOpen, setConcernEntryOpen] = useState(() => snapshot?.concernEntryOpen ?? false);
  const transitionTimer = useRef<number | null>(null);
  const isFace = selection.selectedRegionId === 'face';

  useEffect(() => {
    onSnapshot?.({ explicitVariant, variant, selection, zoom, faceSubregionId, facePrecision, facePoint, returnView, concernEntryOpen });
  }, [onSnapshot, explicitVariant, variant, selection, zoom, faceSubregionId, facePrecision, facePoint, returnView, concernEntryOpen]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  const enterFace = () => {
    setReturnView(selection.view);
    setFaceSubregionId(null);
    setHoveredFaceSubregionId(null);
    setFacePrecision('general-area');
    setFacePoint(null);
    if (selection.view === 'back') {
      explorer.setView('front');
      transitionTimer.current = window.setTimeout(() => explorer.chooseRegion('face'), 260);
    } else {
      explorer.chooseRegion('face');
    }
  };

  const chooseRegion = (regionId: BodyRegionId) => {
    if (regionId === 'face') {
      enterFace();
      return;
    }
    setFaceSubregionId(null);
    setHoveredFaceSubregionId(null);
    setFacePoint(null);
    explorer.chooseRegion(regionId);
  };

  const changeArea = () => {
    setFaceSubregionId(null);
    setHoveredFaceSubregionId(null);
    setFacePrecision('general-area');
    setFacePoint(null);
    setConcernEntryOpen(false);
    explorer.clearSelection();
    if (isFace && returnView === 'back') {
      transitionTimer.current = window.setTimeout(() => explorer.setView('back'), 300);
    }
  };

  const regionLabel = useCallback((regionId: BodyRegionId) => {
    const region = bodyRegionById(regionId);
    if (!region) return regionId;
    const side = lateralityLabel(region.laterality);
    return side ? `${region.label}, ${side.toLowerCase()}` : region.label;
  }, []);

  const isHologram = selection.layer === 'hologram';
  const openConcernEntry = useCallback(() => {
    if (!selectedRegion || (isFace && !faceSubregionId)) return;
    setConcernEntryOpen(true);
  }, [faceSubregionId, isFace, selectedRegion]);

  const confirmConcern = useCallback((clinicalContext: RegionAssessmentContext) => {
    const painLocation: PainLocation | null = isFace
      ? facePrecision === 'exact-point' && facePoint
        ? { regionId: 'face', precision: 'exact-point', point: facePoint }
        : { regionId: 'face', precision: 'general-area' }
      : explorer.painLocation;
    onComplaintConfirmed(
      clinicalContext.complaintId,
      painLocation,
      'patient-stated',
      selection.view,
      clinicalContext,
      variant,
    );
  }, [explorer.painLocation, facePoint, facePrecision, isFace, onComplaintConfirmed, selection.view, variant]);

  if (concernEntryOpen && selectedRegion) {
    return (
      <div className="explorer explorer--concern-entry">
        <TopBar view={selection.view} deploymentLabel={deploymentLabel} onNewPatient={onNewPatient} />
        <RegionConcernEntry
          regionId={selectedRegion.id}
          regionLabel={selectedRegion.label}
          faceSubregionId={isFace ? faceSubregionId : null}
          patient={patientContext}
          onBack={() => setConcernEntryOpen(false)}
          onContinue={confirmConcern}
        />
      </div>
    );
  }

  return (
    <div className="explorer" data-layer={selection.layer} data-face-mode={isFace}>
      <TopBar view={selection.view} deploymentLabel={deploymentLabel} onNewPatient={onNewPatient} />

      <div className="explorer__body">
        <main className="explorer__center">
          <StageTitle layer={selection.layer} faceMode={isFace} />
          <AnatomyStage {...explorer} chooseRegion={chooseRegion} regionLabel={regionLabel}
            faceSubregionId={faceSubregionId} hoveredFaceSubregionId={hoveredFaceSubregionId}
            facePrecision={facePrecision} facePoint={facePoint}
            onFaceSelect={(regionId) => { setFaceSubregionId(regionId); setFacePoint(null); }}
            onFaceHover={setHoveredFaceSubregionId}
            onFacePoint={setFacePoint} />
        </main>

        <aside className="explorer__rail explorer__rail--left">
          <div className="explorer__rail-scroll explorer__rail-scroll--regions">
            {isHologram && !isFace ? (
              <RegionSelector {...explorer} chooseRegion={chooseRegion} />
            ) : isFace ? (
              <FaceRegionRail
                selected={faceSubregionId}
                hovered={hoveredFaceSubregionId}
                onSelect={(regionId) => { setFaceSubregionId(regionId); setFacePoint(null); }}
                onHover={setHoveredFaceSubregionId}
              />
            ) : (
              <SelectedAreaSummary
                variantId={explorer.variantId}
                selection={selection}
                selectedRegion={selectedRegion}
                clearSelection={changeArea}
                showChangeArea={!isFace}
              />
            )}
          </div>
          {!isFace ? <ViewControls {...explorer} onEnterFace={enterFace} /> : null}
          {!isFace ? <LayerSwitcher {...explorer} /> : null}
        </aside>

        <aside className="explorer__rail explorer__rail--right">
          <div className="explorer__rail-scroll explorer__rail-scroll--context">
            {isFace ? (
              <FaceContextPanel selected={faceSubregionId} precision={facePrecision} point={facePoint}
                onPrecision={(precision) => { setFacePrecision(precision); setFacePoint(null); }} />
            ) : isHologram ? (
              <>
                <SelectedArea {...explorer} chooseRegion={chooseRegion} clearSelection={changeArea} />
                <HowToUse />
              </>
            ) : selection.layer === 'systems' ? (
              <SystemsRightPanels selectedRegion={selectedRegion} />
            ) : (
              <StructuresRightPanels {...explorer} />
            )}
          </div>

          {isFace ? (
            <div className="explorer__rail-actions" aria-label="Face selection actions">
              <button className="cta" type="button" disabled={!faceSubregionId} onClick={openConcernEntry}>
                <span className="type-control">Confirm location</span>
                <span className="cta__mark" aria-hidden="true"><Pictogram name="routing" size={20} /></span>
              </button>
              <button className="ghost-button" type="button" onClick={changeArea}>Change location</button>
            </div>
          ) : selection.layer === 'systems' ? (
            <SystemsNextAction
              setLayer={explorer.setLayer}
              selectedRegion={selectedRegion}
              onConfirm={openConcernEntry}
            />
          ) : (
            <ConfirmSelection
              selectedRegion={selectedRegion}
              clearSelection={changeArea}
              onConfirm={openConcernEntry}
              showChangeArea={isHologram}
            />
          )}

          <SessionNote />
        </aside>
      </div>

      <Stepper hasRegion={selection.selectedRegionId !== null} />
      {selectedRegion && (!isFace || faceSubregionId) ? (
        <div className="explorer__floating-action">
          <button className="cta" type="button" onClick={openConcernEntry}>
            <span className="type-control">
              Confirm location
            </span>
            <span className="cta__mark" aria-hidden="true"><Pictogram name="routing" size={20} /></span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
