export const BODY_VIEW_IDS = ['front', 'back'] as const;
export type BodyView = (typeof BODY_VIEW_IDS)[number];

export const BODY_LAYER_IDS = ['hologram', 'systems', 'structures'] as const;
export type BodyLayerId = (typeof BODY_LAYER_IDS)[number];

export const BODY_LATERALITY_IDS = ['left', 'right', 'midline'] as const;
export type BodyLaterality = (typeof BODY_LATERALITY_IDS)[number];

export const BODY_REGION_GROUP_IDS = ['head-neck', 'torso', 'upper-limb', 'lower-limb'] as const;
export type BodyRegionGroupId = (typeof BODY_REGION_GROUP_IDS)[number];

export const BODY_REGION_IDS = [
  'head',
  'face',
  'neck',
  'chest',
  'upper-abdomen',
  'lower-abdomen',
  'pelvis',
  'upper-back',
  'lower-back',
  'left-shoulder',
  'right-shoulder',
  'left-upper-arm',
  'right-upper-arm',
  'left-elbow',
  'right-elbow',
  'left-forearm',
  'right-forearm',
  'left-wrist',
  'right-wrist',
  'left-hand',
  'right-hand',
  'left-hip',
  'right-hip',
  'left-thigh',
  'right-thigh',
  'left-knee',
  'right-knee',
  'left-lower-leg',
  'right-lower-leg',
  'left-ankle',
  'right-ankle',
  'left-foot',
  'right-foot',
] as const;

export type BodyRegionId = (typeof BODY_REGION_IDS)[number];
