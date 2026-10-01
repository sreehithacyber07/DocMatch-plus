import type { BodyRegionId } from '../../body/index.ts';

/**
 * Presentation groupings only.
 *
 * These bundle frozen semantic region ids into the broad choices a person
 * actually thinks in, so the selector is not a wall of 33 controls. Grouping is
 * a UI decision and carries no clinical claim; every selection still resolves to
 * a single frozen region id before it reaches the bridge.
 */
export interface RegionGroup {
  id: string;
  label: string;
  /** Region shown highlighted on the group's miniature. */
  emblemRegionId: BodyRegionId;
  regionIds: readonly BodyRegionId[];
}

export const REGION_GROUPS: readonly RegionGroup[] = [
  {
    id: 'head-neck',
    label: 'Head and neck',
    emblemRegionId: 'head',
    regionIds: ['head', 'face', 'neck'],
  },
  {
    id: 'chest',
    label: 'Chest',
    emblemRegionId: 'chest',
    regionIds: ['chest'],
  },
  {
    id: 'upper-abdomen',
    label: 'Upper abdomen',
    emblemRegionId: 'upper-abdomen',
    regionIds: ['upper-abdomen'],
  },
  {
    id: 'lower-abdomen-pelvis',
    label: 'Lower abdomen and pelvis',
    emblemRegionId: 'lower-abdomen',
    regionIds: ['lower-abdomen', 'pelvis'],
  },
  {
    id: 'back',
    label: 'Back',
    emblemRegionId: 'upper-back',
    regionIds: ['upper-back', 'lower-back'],
  },
  {
    id: 'shoulder-arm',
    label: 'Shoulder and arm',
    emblemRegionId: 'left-shoulder',
    regionIds: [
      'left-shoulder',
      'right-shoulder',
      'left-upper-arm',
      'right-upper-arm',
      'left-elbow',
      'right-elbow',
      'left-forearm',
      'right-forearm',
    ],
  },
  {
    id: 'hand-wrist',
    label: 'Hand and wrist',
    emblemRegionId: 'left-hand',
    regionIds: ['left-wrist', 'right-wrist', 'left-hand', 'right-hand'],
  },
  {
    id: 'leg',
    label: 'Leg',
    emblemRegionId: 'left-thigh',
    regionIds: [
      'left-hip',
      'right-hip',
      'left-thigh',
      'right-thigh',
      'left-knee',
      'right-knee',
      'left-lower-leg',
      'right-lower-leg',
    ],
  },
  {
    id: 'foot-ankle',
    label: 'Foot and ankle',
    emblemRegionId: 'left-foot',
    regionIds: ['left-ankle', 'right-ankle', 'left-foot', 'right-foot'],
  },
];

export function groupForRegion(regionId: BodyRegionId): RegionGroup | undefined {
  return REGION_GROUPS.find((group) => group.regionIds.includes(regionId));
}

/** Groups that have at least one region available in the current view. */
export function groupsForView(available: ReadonlySet<BodyRegionId>): RegionGroup[] {
  return REGION_GROUPS.map((group) => ({
    ...group,
    regionIds: group.regionIds.filter((regionId) => available.has(regionId)),
  })).filter((group) => group.regionIds.length > 0);
}
