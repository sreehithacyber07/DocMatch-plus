import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from './faceHitMap.ts';
import { groupForRegion } from './regionGroups.ts';

export interface RegionIntakeContract {
  regionId: BodyRegionId;
  parentRegionId: string;
  patientLabel: string;
  laterality: 'left' | 'right' | 'midline';
  supportsGeneralArea: true;
  supportsExactPoint: true;
  complaintEntryAvailable: boolean;
  faceMode: boolean;
  pendingClinicalReason?: string;
}

/** Location metadata only. This registry never chooses a complaint or specialty. */
export const REGION_INTAKE_CONTRACTS = Object.fromEntries(BODY_DOMAIN.regions.map((region) => {
  const group = groupForRegion(region.id);
  if (!group) throw new Error(`Missing presentation group for ${region.id}`);
  const contract: RegionIntakeContract = {
    regionId: region.id,
    parentRegionId: group.id,
    patientLabel: region.label,
    laterality: region.laterality,
    supportsGeneralArea: true,
    supportsExactPoint: true,
    complaintEntryAvailable: true,
    faceMode: region.id === 'face',
  };
  return [region.id, contract];
})) as Record<BodyRegionId, RegionIntakeContract>;

export interface FaceSubregionContract {
  regionId: FaceRegionId;
  parentRegionId: 'face';
  patientLabel: string;
  laterality: 'left' | 'right' | 'midline';
  supportsGeneralArea: true;
  supportsExactPoint: true;
  complaintEntryAvailable: true;
  faceMode: true;
  pendingClinicalReason?: string;
}

export const FACE_SUBREGION_CONTRACTS = Object.fromEntries(FACE_HIT_REGIONS.map((region) => [
  region.id,
  {
    regionId: region.id,
    parentRegionId: 'face',
    patientLabel: region.label,
    laterality: region.id.startsWith('patient-right-') ? 'right'
      : region.id.startsWith('patient-left-') ? 'left' : 'midline',
    supportsGeneralArea: true,
    supportsExactPoint: true,
    complaintEntryAvailable: true,
    faceMode: true,
  },
])) as Record<FaceRegionId, FaceSubregionContract>;
