import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BODY_DOMAIN, type BodyRegionGroupId, type BodyRegionId } from '../../body/index.ts';
import { R2B_DEMONSTRATION_COMPLAINTS } from '../../engine/data/demonstration/complaints.ts';
import { Pictogram } from '../../components/pictograms';
import { lateralityLabel, type BodyExplorerActions, type BodyExplorerState } from './useBodyExplorer.ts';

const GROUP_LABEL: Record<BodyRegionGroupId, string> = {
  'head-neck': 'Head and neck',
  torso: 'Torso',
  'upper-limb': 'Arms and hands',
  'lower-limb': 'Legs and feet',
};

const GROUP_ORDER: readonly BodyRegionGroupId[] = ['head-neck', 'torso', 'upper-limb', 'lower-limb'];

function complaintLabel(complaintId: string): string {
  return R2B_DEMONSTRATION_COMPLAINTS.find((candidate) => candidate.id === complaintId)?.label ?? complaintId;
}

export type RegionPanelProps = BodyExplorerState &
  Pick<BodyExplorerActions, 'chooseRegion' | 'setHovered'> & {
    onConfirm: (complaintId: string) => void;
  };

/**
 * The region list is a first-class input, not an accessibility fallback. It is
 * often faster than precise tapping and is the primary path on small screens.
 */
export function RegionPanel(props: RegionPanelProps) {
  const {
    orderedRegions,
    selection,
    selectedRegion,
    candidateComplaintIds,
    hoveredRegionId,
    chooseRegion,
    setHovered,
    onConfirm,
  } = props;
  const reduceMotion = useReducedMotion();

  const available = new Set(orderedRegions.map((region) => region.regionId));
  const grouped = GROUP_ORDER.map((groupId) => ({
    groupId,
    regions: BODY_DOMAIN.regions.filter(
      (region) => region.groupId === groupId && available.has(region.id),
    ),
  })).filter((group) => group.regions.length > 0);

  const laterality = selectedRegion ? lateralityLabel(selectedRegion.laterality) : null;

  return (
    <div className="region-panel">
      <section className="region-panel__selection" aria-live="polite">
        {selectedRegion ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedRegion.id}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.2, 0, 0, 1] }}
            >
              <p className="type-caption region-panel__eyebrow">Selected area</p>
              <h2 className="type-heading-2">{selectedRegion.label}</h2>
              <dl className="region-panel__facts">
                {laterality ? (
                  <div>
                    <dt className="type-caption">Side</dt>
                    <dd className="type-data">{laterality}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="type-caption">View</dt>
                  <dd className="type-data">{selection.view === 'front' ? 'Front' : 'Back'}</dd>
                </div>
                <div>
                  <dt className="type-caption">Pain location</dt>
                  <dd className="type-data">
                    {selection.painPrecision === 'exact-point' ? 'Exact point' : 'General area'}
                  </dd>
                </div>
              </dl>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div>
            <p className="type-caption region-panel__eyebrow">Selected area</p>
            <p className="type-body-small region-panel__empty">
              Choose the area that brought you here, on the body or from the list.
            </p>
          </div>
        )}
      </section>

      {selectedRegion ? (
        <section className="region-panel__complaints" aria-label="Presenting complaint">
          <p className="type-caption region-panel__eyebrow">What brings you here</p>
          {candidateComplaintIds.length > 0 ? (
            <ul className="region-panel__complaint-list">
              {candidateComplaintIds.map((complaintId) => (
                <li key={complaintId}>
                  <button className="control control--wide" type="button" onClick={() => onConfirm(complaintId)}>
                    <Pictogram name="routing" size={20} />
                    <span className="type-control">{complaintLabel(complaintId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-body-small region-panel__empty">
              This area is not covered by the current question set. Choose another area to continue.
            </p>
          )}
        </section>
      ) : null}

      <section className="region-panel__list" aria-label="Body region list">
        <p className="type-caption region-panel__eyebrow">All areas</p>
        {grouped.map((group) => (
          <div className="region-panel__group" key={group.groupId}>
            <h3 className="type-caption region-panel__group-title">{GROUP_LABEL[group.groupId]}</h3>
            <ul>
              {group.regions.map((region) => (
                <li key={region.id}>
                  <button
                    className="region-chip"
                    type="button"
                    aria-pressed={selection.selectedRegionId === region.id}
                    data-hovered={hoveredRegionId === region.id ? 'true' : undefined}
                    onClick={() => chooseRegion(region.id as BodyRegionId)}
                    onPointerEnter={() => setHovered(region.id as BodyRegionId)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <span className="type-control">{region.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
