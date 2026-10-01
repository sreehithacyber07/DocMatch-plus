import { BODY_REGIONS } from './regions.ts';
import type { BodyDomainDefinition, BodyLayerDefinition } from './types.ts';
import { BODY_DOMAIN_VERSION } from './version.ts';

export const BODY_LAYERS: readonly BodyLayerDefinition[] = [
  { id: 'hologram', label: 'Hologram', purpose: 'Semantic body-region and pain-location selection.' },
  { id: 'systems', label: 'Systems', purpose: 'Source-backed body-system context for a selected region.' },
  { id: 'structures', label: 'Organs / Structures', purpose: 'Source-backed organ or structure context for a selected region.' },
];

const FRONT_KEYBOARD_ORDER = [
  'head', 'face', 'neck',
  'left-shoulder', 'right-shoulder', 'chest',
  'left-upper-arm', 'right-upper-arm', 'left-elbow', 'right-elbow',
  'left-forearm', 'right-forearm', 'left-wrist', 'right-wrist', 'left-hand', 'right-hand',
  'upper-abdomen', 'lower-abdomen', 'pelvis',
  'left-hip', 'right-hip', 'left-thigh', 'right-thigh', 'left-knee', 'right-knee',
  'left-lower-leg', 'right-lower-leg', 'left-ankle', 'right-ankle', 'left-foot', 'right-foot',
] as const;

const BACK_KEYBOARD_ORDER = [
  'head', 'neck',
  'left-shoulder', 'right-shoulder', 'upper-back',
  'left-upper-arm', 'right-upper-arm', 'left-elbow', 'right-elbow',
  'left-forearm', 'right-forearm', 'left-wrist', 'right-wrist', 'left-hand', 'right-hand',
  'lower-back',
  'left-hip', 'right-hip', 'left-thigh', 'right-thigh', 'left-knee', 'right-knee',
  'left-lower-leg', 'right-lower-leg', 'left-ankle', 'right-ankle', 'left-foot', 'right-foot',
] as const;

export const BODY_DOMAIN: BodyDomainDefinition = {
  bodyDomainVersion: BODY_DOMAIN_VERSION,
  regions: BODY_REGIONS,
  layers: BODY_LAYERS,
  systems: [],
  structures: [],
  provenanceSources: [],
  systemMembershipStatus: {
    status: 'blocked',
    reason: 'No authoritative anatomical region-to-system membership set is approved for this phase.',
    requiredEvidence: 'Reviewed institutional anatomy sources with explicit support for each materialized relationship.',
  },
  structureMembershipStatus: {
    status: 'blocked',
    reason: 'No authoritative anatomical region-to-structure membership set is approved for this phase.',
    requiredEvidence: 'Reviewed institutional anatomy sources with explicit support for each materialized relationship.',
  },
  keyboardOrder: {
    front: FRONT_KEYBOARD_ORDER,
    back: BACK_KEYBOARD_ORDER,
  },
};
