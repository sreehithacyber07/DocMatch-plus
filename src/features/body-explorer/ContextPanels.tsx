import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import type { NormalizedPoint } from '../../body/index.ts';
import { Pictogram } from '../../components/pictograms';
import { SESSION_NOTICE } from '../persistence/runtime.ts';
import { Disclose, DiscloseItem } from '../../components/layout';
import {
  accordionChild,
  accordionChildren,
  accordionReveal,
  crossfade,
  fadeLift,
} from '../../styles/motion-variants.ts';
import { BodyMiniature } from './BodyMiniature.tsx';
import { FocusView } from './FocusView.tsx';
import { FACE_HIT_REGIONS, FACE_REGION_BY_ID, type FaceRegionId } from './faceHitMap.ts';
import { lateralityLabel, type BodyExplorerActions, type BodyExplorerState } from './useBodyExplorer.ts';

/* --- Shared small parts --------------------------------------------------- */

/* --- How to use ----------------------------------------------------------- */

export function HowToUse() {
  return (
    <Disclose title="How this works" mark="assistance" preview="Tap where it hurts">
      <DiscloseItem>
        <p className="type-body-small">
          Tap the area where you feel the problem. Left and right are your own left and right, not the
          figure's.
        </p>
      </DiscloseItem>
      <DiscloseItem>
        <p className="type-body-small">
          Switch to Systems or Organs when a deeper view helps you describe the area. Neither is required to
          continue.
        </p>
      </DiscloseItem>
    </Disclose>
  );
}

/* --- Selected area -------------------------------------------------------- */

export type SelectedAreaProps = BodyExplorerState &
  Pick<BodyExplorerActions, 'setPrecision' | 'clearSelection' | 'chooseRegion'>;

/**
 * The selection, compactly.
 *
 * Region, side and precision on three short lines instead of a block; the
 * precision choice is one two-stop control rather than two stacked options with
 * a hint each. What used to be a tall permanent panel is now short enough that
 * the action beneath it is on screen at every viewport height.
 */
export function SelectedArea(props: SelectedAreaProps) {
  const { variantId, selection, selectedRegion, setPrecision } = props;
  const reduced = Boolean(useReducedMotion());

  if (!selectedRegion) {
    return (
      <section className="pick" aria-live="polite" aria-label="Selected area">
        <p className="type-label pick__title">Selected area</p>
        <div className="pick__awaiting">
          <span className="pick__awaiting-mark" aria-hidden="true">
            <Pictogram name="location" size={20} state="unavailable" />
          </span>
          <p className="type-body-small">Nothing selected. Tap the body, or pick an area from the list.</p>
        </div>
      </section>
    );
  }

  const side = lateralityLabel(selectedRegion.laterality);
  const exact = selection.painPrecision === 'exact-point';

  return (
    <section className="pick" data-active="true" aria-live="polite" aria-label="Selected area">
      <p className="type-label pick__title">Selected area</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div className="pick__identity" key={selectedRegion.id} {...fadeLift(reduced, 0, 6)}>
          <span className="pick__dot" aria-hidden="true" />
          <span className="pick__naming">
            <strong className="type-heading-2 pick__name">{selectedRegion.label}</strong>
            <span className="type-caption pick__meta">
              {[side, exact ? 'Exact point' : 'General area'].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="pick__figures" aria-hidden="true">
            <BodyMiniature variantId={variantId} view={selection.view} highlighted={[selectedRegion.id]} tone="selected" />
          </span>
        </motion.div>
      </AnimatePresence>

      <fieldset className="precision">
        <legend className="type-caption precision__legend">Pain location</legend>
        <div className="precision__track" role="radiogroup" aria-label="Pain location precision">
          <span className="precision__rule" aria-hidden="true" />
          {(
            [
              { id: 'exact-point', label: 'Exact point' },
              { id: 'general-area', label: 'General area' },
            ] as const
          ).map((option) => (
            <button
              className="precision__stop"
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selection.painPrecision === option.id}
              onClick={() =>
                setPrecision(
                  option.id,
                  option.id === 'exact-point' ? selection.exactPoint ?? { x: 0.5, y: 0.5 } : undefined,
                )
              }
            >
              <span className="precision__node" aria-hidden="true" />
              <span className="type-control precision__label">{option.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

export function SelectedAreaSummary({
  variantId,
  selection,
  selectedRegion,
  clearSelection,
  showChangeArea = true,
}: Pick<BodyExplorerState, 'variantId' | 'selectedRegion' | 'selection'> &
  Pick<BodyExplorerActions, 'clearSelection'> & { showChangeArea?: boolean }) {
  const reduced = Boolean(useReducedMotion());
  if (!selectedRegion) {
    return (
      <section className="pick" aria-live="polite" aria-label="Selected area">
        <p className="type-label pick__title">Selected area</p>
        <div className="pick__awaiting">
          <span className="pick__awaiting-mark" aria-hidden="true">
            <Pictogram name="location" size={20} state="unavailable" />
          </span>
          <p className="type-body-small">Nothing selected.</p>
        </div>
      </section>
    );
  }
  const side = lateralityLabel(selectedRegion.laterality);
  return (
    <section className="pick" data-active="true" aria-live="polite" aria-label="Selected area">
      <p className="type-label pick__title">Selected area</p>
      <motion.div className="pick__identity" {...fadeLift(reduced, 0, 6)}>
        <span className="pick__dot" aria-hidden="true" />
        <span className="pick__naming">
          <strong className="type-heading-2 pick__name">{selectedRegion.label}</strong>
          {side ? <span className="type-caption pick__meta">{side}</span> : null}
        </span>
        <span className="pick__figures" aria-hidden="true">
          <BodyMiniature variantId={variantId} view={selection.view} highlighted={[selectedRegion.id]} tone="selected" />
        </span>
      </motion.div>
      {showChangeArea ? <button className="ghost-button" type="button" onClick={clearSelection}>
        <Pictogram name="back" size={20} />
        <span className="type-control">Change location</span>
      </button> : null}
    </section>
  );
}

export function FaceContextPanel({
  selected,
  precision,
  point,
  onPrecision,
}: {
  selected: FaceRegionId | null;
  precision: 'general-area' | 'exact-point';
  point: NormalizedPoint | null;
  onPrecision: (precision: 'general-area' | 'exact-point') => void;
}) {
  return (
    <section className="pick pick--face" aria-label="Selected area" aria-live="polite">
      <nav className="face-breadcrumb type-caption" aria-label="Anatomy location">
        <span>Body</span><span aria-hidden="true">/</span><span>Face</span>
        {selected ? <><span aria-hidden="true">/</span><strong>{FACE_REGION_BY_ID[selected].label}</strong></> : null}
      </nav>
      <p className="type-label pick__title">Selected area</p>
      <h2 className="type-heading-2 pick__name">{selected ? FACE_REGION_BY_ID[selected].label : 'Face'}</h2>
      <p className="type-body-small">{selected
        ? 'Choose how precisely to record this location.'
        : 'Choose where on the face the concern is.'}</p>
      {selected ? (
        <fieldset className="precision precision--flush">
          <legend className="type-caption precision__legend">Pain location</legend>
          <div className="precision__track" role="radiogroup" aria-label="Face location precision">
            <span className="precision__rule" aria-hidden="true" />
            {(['exact-point', 'general-area'] as const).map((option) => (
              <button
                className="precision__stop"
                key={option}
                type="button"
                role="radio"
                aria-checked={precision === option}
                onClick={() => onPrecision(option)}
              >
                <span className="precision__node" aria-hidden="true" />
                <span className="type-control precision__label">{option === 'exact-point' ? 'Exact point' : 'General area'}</span>
              </button>
            ))}
          </div>
          {precision === 'exact-point' ? <p className="type-caption">{point
            ? 'Point recorded on the face.' : 'Tap within the selected area to place one marker.'}</p> : null}
        </fieldset>
      ) : null}
    </section>
  );
}

const FACE_RAIL_GROUPS: readonly { label: string; regionIds: readonly FaceRegionId[] }[] = [
  { label: 'General face', regionIds: ['face-general'] },
  { label: 'Forehead', regionIds: ['forehead'] },
  { label: 'Temples', regionIds: ['patient-right-temple', 'patient-left-temple'] },
  { label: 'Eyes', regionIds: ['patient-right-eye', 'patient-left-eye'] },
  { label: 'Nose', regionIds: ['nose'] },
  { label: 'Cheeks', regionIds: ['patient-right-cheek', 'patient-left-cheek'] },
  { label: 'Ears', regionIds: ['patient-right-ear', 'patient-left-ear'] },
  { label: 'Mouth', regionIds: ['mouth'] },
  { label: 'Jaw', regionIds: ['patient-right-jaw', 'patient-left-jaw'] },
  { label: 'Chin', regionIds: ['chin'] },
  { label: 'Upper neck', regionIds: ['upper-neck'] },
];

/** "Patient's right temple" -> "Right temple". Presentation only: the region's canonical `label` (used for aria-label and elsewhere) is untouched. */
function bilateralDisplayLabel(label: string): string {
  const stripped = label.replace("Patient's ", '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export function FaceRegionRail({
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  selected: FaceRegionId | null;
  hovered: FaceRegionId | null;
  onSelect: (regionId: FaceRegionId) => void;
  onHover: (regionId: FaceRegionId | null) => void;
}) {
  const knownIds = new Set(FACE_HIT_REGIONS.map((region) => region.id));
  return (
    <section className="face-region-rail" aria-labelledby="face-detail-rail-title">
      <div className="face-region-rail__head">
        <p className="type-label">Face areas</p>
        <p className="type-body-small face-region-rail__instruction" id="face-detail-rail-title">Choose the exact area of concern.</p>
      </div>
      <div className="face-region-rail__list" aria-label="Face regions">
        {FACE_RAIL_GROUPS.map((group) => (
          <div className="face-region-rail__group" key={group.label}>
            <span className="type-caption face-region-rail__group-label">{group.label}</span>
            <div className="face-region-rail__choices" data-count={group.regionIds.length}>
              {group.regionIds.filter((regionId) => knownIds.has(regionId)).map((regionId) => {
                const region = FACE_REGION_BY_ID[regionId];
                const active = selected === regionId;
                const highlighted = active || hovered === regionId;
                const bilateral = group.regionIds.length > 1;
                return (
                  <button
                    className="face-region-rail__choice"
                    type="button"
                    key={regionId}
                    aria-pressed={active}
                    data-active={active}
                    data-hovered={highlighted}
                    aria-label={`Select ${region.label}`}
                    onClick={() => onSelect(regionId)}
                    onPointerEnter={() => onHover(regionId)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(regionId)}
                    onBlur={() => onHover(null)}
                  >
                    <span className="face-region-rail__dot" aria-hidden="true" />
                    <span className="face-region-rail__choice-label">{bilateral ? bilateralDisplayLabel(region.label) : group.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="type-caption face-region-rail__note">
        Selecting an area helps tailor the questions that follow.
      </p>
    </section>
  );
}

export function PinpointPain(props: SelectedAreaProps) {
  const { selection, selectedRegion, setPrecision } = props;
  if (!selectedRegion) return null;
  return (
    <fieldset className="precision precision--flush">
      <legend className="type-caption precision__legend">Pain location</legend>
      <div className="precision__track" role="radiogroup" aria-label="Pain location precision">
        <span className="precision__rule" aria-hidden="true" />
        {(
          [
            { id: 'exact-point', label: 'Exact point' },
            { id: 'general-area', label: 'General area' },
          ] as const
        ).map((option) => (
          <button
            className="precision__stop"
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selection.painPrecision === option.id}
            onClick={() =>
              setPrecision(
                option.id,
                option.id === 'exact-point' ? selection.exactPoint ?? { x: 0.5, y: 0.5 } : undefined,
              )
            }
          >
            <span className="precision__node" aria-hidden="true" />
            <span className="type-control precision__label">{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/* --- Systems layer -------------------------------------------------------- */

/**
 * One layout contract for the Systems layer.
 *
 * Every panel is the same component with the same head, the same body slot and
 * the same minimum height, so switching region or layer cannot change the
 * rail's vertical rhythm. The uneven Systems spacing came from four panels each
 * inventing their own head and each collapsing to a different height when its
 * data was unavailable.
 */
function RailPanel({
  title,
  mark,
  children,
}: {
  title: string;
  mark?: 'question' | 'systems' | 'structure' | 'pulse';
  children: React.ReactNode;
}) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel__head">
        {mark ? (
          <span className="panel__mark" aria-hidden="true">
            <Pictogram name={mark} size={20} />
          </span>
        ) : null}
        <h2 className="type-label panel__title">{title}</h2>
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function SystemsListPanel({ selectedRegion }: Pick<BodyExplorerState, 'selectedRegion'>) {
  return (
    <RailPanel title="Systems in this region" mark="systems">
      <p className="type-body-small">{selectedRegion ? selectedRegion.label : 'Choose an area to explore.'}</p>
    </RailPanel>
  );
}

export function SystemsRightPanels({ selectedRegion }: Pick<BodyExplorerState, 'selectedRegion'>) {
  return (
    <>
      <RailPanel title="What this means" mark="question">
        <p className="type-body-small">
          {selectedRegion
            ? `Selecting ${selectedRegion.label.toLowerCase()} tells DocMatch where the problem is. It does not identify a cause.`
            : 'Selecting an area tells DocMatch where the problem is. It does not identify a cause.'}
        </p>
      </RailPanel>
    </>
  );
}

/**
 * One button, always the same label.
 *
 * This used to branch on whether the bridge had a resolved complaint id for
 * the region, whether an unmapped region had a patient-statable offer, and
 * specifically on Chest, each combination naming its own guessed complaint in
 * the button label and a Chest-only escape hatch for anything else.
 * All of them called the same handler underneath: `onConfirm` only ever opens
 * the concern-type step, never a specific complaint. Location and concern are
 * two different questions, so the button that finishes the location step
 * asks about location, whatever region is selected.
 */
export function SystemsNextAction({
  setLayer,
  selectedRegion,
  onConfirm,
}: Pick<BodyExplorerActions, 'setLayer'> &
  Pick<BodyExplorerState, 'selectedRegion'> & {
    onConfirm: () => void;
  }) {
  return (
    <div className="explorer__rail-actions">
      {selectedRegion ? (
        <button className="cta" type="button" onClick={onConfirm}>
          <span className="type-control">Confirm location</span>
          <span className="cta__mark" aria-hidden="true"><Pictogram name="routing" size={20} /></span>
        </button>
      ) : null}
      <button className="cta cta--quiet" type="button" onClick={() => setLayer('structures')}>
        <span className="type-control">Explore organ layer</span>
        <span className="cta__mark" aria-hidden="true">
          <Pictogram name="routing" size={20} />
        </span>
      </button>
    </div>
  );
}

/* --- The action ----------------------------------------------------------- */

/**
 * Confirm location.
 *
 * Lives in the rail's sticky action area, outside the scrolling content, so it
 * cannot be pushed below the fold by a long rail, a short viewport or the focus
 * view. This step answers exactly one question, where the concern is; it never
 * guesses what the concern is from the region alone, and the button always
 * says so. What brings the patient here is asked next, on its own step, with
 * every region-appropriate option offered equally.
 */
export function ConfirmSelection({
  selectedRegion,
  clearSelection,
  onConfirm,
  showChangeArea = true,
}: Pick<BodyExplorerState, 'selectedRegion'> &
  Pick<BodyExplorerActions, 'clearSelection'> & {
    onConfirm: () => void;
    showChangeArea?: boolean;
  }) {
  const reduced = Boolean(useReducedMotion());
  if (!selectedRegion) return null;
  return (
    <motion.div className={`explorer__rail-actions${showChangeArea ? '' : ' explorer__rail-actions--single'}`} aria-label="Selection actions" {...crossfade(reduced)}>
      <button className="cta" type="button" onClick={onConfirm}>
        <span className="type-control">Confirm location</span>
        <span className="cta__mark" aria-hidden="true">
          <Pictogram name="routing" size={20} />
        </span>
      </button>
      {showChangeArea ? (
        <button className="ghost-button" type="button" onClick={clearSelection}>
          <Pictogram name="back" size={20} />
          <span className="type-control">Change location</span>
        </button>
      ) : null}
    </motion.div>
  );
}

/* --- Organs layer --------------------------------------------------------- */

export function StructuresListPanel() {
  return (
    <RailPanel title="Structures in this region" mark="structure">
      <p className="type-body-small">Choose an area to continue.</p>
    </RailPanel>
  );
}

export function StructuresRightPanels(props: SelectedAreaProps) {
  return (
    <>
      <FocusView key={`${props.variantId}-${props.selection.view}-${props.selection.selectedRegionId ?? 'none'}`} {...props} />
      <PinpointPain {...props} />
      <HowToUse />
    </>
  );
}

/* --- Session note --------------------------------------------------------- */

/**
 * What the session keeps.
 *
 * A disclosure in the rail footer rather than the block it used to occupy. The
 * note is true and worth stating once; it was never worth the height of the
 * selection it sat beside.
 */
export function SessionNote() {
  const reduced = Boolean(useReducedMotion());
  const [open, setOpen] = useState(false);
  return (
    <div className="session-note" data-open={open}>
      <button
        className="session-note__trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Pictogram name="history" size={20} />
        <span className="type-caption">{SESSION_NOTICE.label}</span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.p className="type-caption session-note__body" {...accordionReveal(reduced)}>
            <span>{SESSION_NOTICE.notice}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* --- Region context ------------------------------------------------------- */

export function AboutRegion({ selectedRegion }: Pick<BodyExplorerState, 'selectedRegion'>) {
  const reduced = Boolean(useReducedMotion());
  return (
    <RailPanel title="About this region" mark="question">
      <motion.div variants={accordionChildren(reduced)} initial="hidden" animate="shown">
        <motion.p className="type-body-small" variants={accordionChild(reduced)}>
          {selectedRegion
            ? `${selectedRegion.label} records where you feel the problem. Location alone does not identify a cause.`
            : 'Select an area to see what DocMatch can ask about it.'}
        </motion.p>
      </motion.div>
    </RailPanel>
  );
}
