import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { bodyRegionById, type BodyRegionId } from '../../body/index.ts';
import { BodyMiniature } from './BodyMiniature.tsx';
import { groupForRegion, groupsForView, type RegionGroup } from './regionGroups.ts';
import { lateralityLabel, type BodyExplorerActions, type BodyExplorerState } from './useBodyExplorer.ts';

export type RegionSelectorProps = Pick<
  BodyExplorerState,
  'variantId' | 'selection' | 'orderedRegions' | 'hoveredRegionId'
> &
  Pick<BodyExplorerActions, 'chooseRegion' | 'setHovered'>;

/**
 * Broad groups are the visible choice. Precise regions are revealed only for the
 * open group, so the selector never becomes a wall of 33 controls.
 */
export function RegionSelector({
  variantId,
  selection,
  orderedRegions,
  hoveredRegionId,
  chooseRegion,
  setHovered,
}: RegionSelectorProps) {
  const reduceMotion = useReducedMotion();
  const available = new Set(orderedRegions.map((region) => region.regionId));
  const groups = groupsForView(available);
  const selectedGroup = selection.selectedRegionId ? groupForRegion(selection.selectedRegionId) : undefined;
  const [openGroupId, setOpenGroupId] = useState<string | null>(selectedGroup?.id ?? null);
  const [trackedGroupId, setTrackedGroupId] = useState<string | null>(selectedGroup?.id ?? null);

  // Selecting a region on the body opens its group. Derived during render rather
  // than synced in an effect, which would cascade an extra render.
  if (selectedGroup && selectedGroup.id !== trackedGroupId) {
    setTrackedGroupId(selectedGroup.id);
    setOpenGroupId(selectedGroup.id);
  }

  function activate(group: RegionGroup) {
    if (group.regionIds.length === 1) {
      setOpenGroupId(group.id);
      chooseRegion(group.regionIds[0]);
      return;
    }
    setOpenGroupId((current) => (current === group.id ? null : group.id));
  }

  return (
    <section className="module module--selector" aria-label="Body region selector">
      <header className="module__head">
        <h2 className="module__title type-label">Body region selector</h2>
        <p className="module__hint type-caption">
          Choose an area on the body, or pick one here.
        </p>
      </header>

      <ul className="group-list">
        {groups.map((group) => {
          const isOpen = openGroupId === group.id;
          const isActive = selectedGroup?.id === group.id;
          return (
            <li className="group-list__item" key={group.id}>
              <button
                className="group-tile"
                type="button"
                aria-expanded={group.regionIds.length > 1 ? isOpen : undefined}
                aria-pressed={group.regionIds.length === 1 ? isActive : undefined}
                data-active={isActive ? 'true' : undefined}
                onClick={() => activate(group)}
                onPointerEnter={() => setHovered(group.emblemRegionId)}
                onPointerLeave={() => setHovered(null)}
              >
                <BodyMiniature
                  variantId={variantId}
                  view={selection.view}
                  highlighted={group.regionIds}
                  tone={isActive ? 'selected' : 'preview'}
                />
                <span className="group-tile__label type-control">{group.label}</span>
                {group.regionIds.length > 1 ? (
                  <span className="group-tile__count type-caption">{group.regionIds.length}</span>
                ) : null}
              </button>

              <AnimatePresence initial={false}>
                {isOpen && group.regionIds.length > 1 ? (
                  <motion.ul
                    className="subregion-list"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.2, 0, 0, 1] }}
                  >
                    {group.regionIds.map((regionId) => {
                      const region = bodyRegionById(regionId);
                      const side = region ? lateralityLabel(region.laterality) : null;
                      return (
                        <li key={regionId}>
                          <button
                            className="subregion"
                            type="button"
                            aria-pressed={selection.selectedRegionId === regionId}
                            data-hovered={hoveredRegionId === regionId ? 'true' : undefined}
                            onClick={() => chooseRegion(regionId as BodyRegionId)}
                            onPointerEnter={() => setHovered(regionId as BodyRegionId)}
                            onPointerLeave={() => setHovered(null)}
                          >
                            <span className="subregion__dot" aria-hidden="true" />
                            <span className="type-control">{region?.label ?? regionId}</span>
                            {side ? <span className="subregion__side type-caption">{side}</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <p className="module__legend type-caption">
        <span className="legend-key legend-key--selectable" aria-hidden="true" /> Selectable area
        <span className="legend-key legend-key--group" aria-hidden="true" /> Sub-areas available
      </p>
    </section>
  );
}
