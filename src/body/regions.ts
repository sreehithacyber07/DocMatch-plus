import type { BodyRegionDefinition } from './types.ts';

export const BODY_REGIONS: readonly BodyRegionDefinition[] = [
  { id: 'head', label: 'Head', laterality: 'midline', groupId: 'head-neck', viewAvailability: 'both' },
  { id: 'face', label: 'Face', laterality: 'midline', groupId: 'head-neck', viewAvailability: 'front' },
  { id: 'neck', label: 'Neck', laterality: 'midline', groupId: 'head-neck', viewAvailability: 'both' },
  { id: 'chest', label: 'Chest', laterality: 'midline', groupId: 'torso', viewAvailability: 'front' },
  { id: 'upper-abdomen', label: 'Upper abdomen', laterality: 'midline', groupId: 'torso', viewAvailability: 'front' },
  { id: 'lower-abdomen', label: 'Lower abdomen', laterality: 'midline', groupId: 'torso', viewAvailability: 'front' },
  { id: 'pelvis', label: 'Pelvis', laterality: 'midline', groupId: 'torso', viewAvailability: 'front' },
  { id: 'upper-back', label: 'Upper back', laterality: 'midline', groupId: 'torso', viewAvailability: 'back' },
  { id: 'lower-back', label: 'Lower back', laterality: 'midline', groupId: 'torso', viewAvailability: 'back' },
  { id: 'left-shoulder', label: 'Left shoulder', laterality: 'left', pairedRegionId: 'right-shoulder', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'right-shoulder', label: 'Right shoulder', laterality: 'right', pairedRegionId: 'left-shoulder', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'left-upper-arm', label: 'Left upper arm', laterality: 'left', pairedRegionId: 'right-upper-arm', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'right-upper-arm', label: 'Right upper arm', laterality: 'right', pairedRegionId: 'left-upper-arm', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'left-elbow', label: 'Left elbow', laterality: 'left', pairedRegionId: 'right-elbow', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'right-elbow', label: 'Right elbow', laterality: 'right', pairedRegionId: 'left-elbow', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'left-forearm', label: 'Left forearm', laterality: 'left', pairedRegionId: 'right-forearm', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'right-forearm', label: 'Right forearm', laterality: 'right', pairedRegionId: 'left-forearm', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'left-wrist', label: 'Left wrist', laterality: 'left', pairedRegionId: 'right-wrist', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'right-wrist', label: 'Right wrist', laterality: 'right', pairedRegionId: 'left-wrist', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'left-hand', label: 'Left hand', laterality: 'left', pairedRegionId: 'right-hand', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'right-hand', label: 'Right hand', laterality: 'right', pairedRegionId: 'left-hand', groupId: 'upper-limb', viewAvailability: 'both' },
  { id: 'left-hip', label: 'Left hip', laterality: 'left', pairedRegionId: 'right-hip', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'right-hip', label: 'Right hip', laterality: 'right', pairedRegionId: 'left-hip', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'left-thigh', label: 'Left thigh', laterality: 'left', pairedRegionId: 'right-thigh', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'right-thigh', label: 'Right thigh', laterality: 'right', pairedRegionId: 'left-thigh', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'left-knee', label: 'Left knee', laterality: 'left', pairedRegionId: 'right-knee', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'right-knee', label: 'Right knee', laterality: 'right', pairedRegionId: 'left-knee', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'left-lower-leg', label: 'Left lower leg', laterality: 'left', pairedRegionId: 'right-lower-leg', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'right-lower-leg', label: 'Right lower leg', laterality: 'right', pairedRegionId: 'left-lower-leg', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'left-ankle', label: 'Left ankle', laterality: 'left', pairedRegionId: 'right-ankle', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'right-ankle', label: 'Right ankle', laterality: 'right', pairedRegionId: 'left-ankle', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'left-foot', label: 'Left foot', laterality: 'left', pairedRegionId: 'right-foot', groupId: 'lower-limb', viewAvailability: 'both' },
  { id: 'right-foot', label: 'Right foot', laterality: 'right', pairedRegionId: 'left-foot', groupId: 'lower-limb', viewAvailability: 'both' },
];

export function regionAvailableInView(region: Readonly<BodyRegionDefinition>, view: 'front' | 'back'): boolean {
  return region.viewAvailability === 'both' || region.viewAvailability === view;
}
export function bodyRegionById(regionId: string): BodyRegionDefinition | undefined {
  return BODY_REGIONS.find((region) => region.id === regionId);
}
