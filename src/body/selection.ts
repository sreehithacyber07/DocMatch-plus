import { BODY_DOMAIN } from './domain.ts';
import { BODY_LAYER_IDS, BODY_VIEW_IDS, type BodyLayerId, type BodyRegionId, type BodyView } from './ids.ts';
import { regionAvailableInView } from './regions.ts';
import type {
  BodyDomainDefinition,
  BodySelectionState,
  BodyValidationIssue,
  ContractValidationReport,
  NormalizedPoint,
  PainPrecision,
} from './types.ts';

function selectedRegion(state: Readonly<BodySelectionState>, domain: Readonly<BodyDomainDefinition>) {
  return domain.regions.find((region) => region.id === state.selectedRegionId);
}

function systemAvailable(
  systemId: string | null,
  regionId: BodyRegionId | null,
  domain: Readonly<BodyDomainDefinition>,
): boolean {
  if (systemId === null || regionId === null) return false;
  return domain.systems.some((system) => system.id === systemId && system.regionIds.includes(regionId));
}

function structureAvailable(
  structureId: string | null,
  regionId: BodyRegionId | null,
  domain: Readonly<BodyDomainDefinition>,
): boolean {
  if (structureId === null || regionId === null) return false;
  return domain.structures.some((structure) => structure.id === structureId && structure.regionIds.includes(regionId));
}

function pointIsNormalized(point: Readonly<NormalizedPoint>): boolean {
  return Number.isFinite(point.x) && point.x >= 0 && point.x <= 1 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
}

export function createBodySelectionState(view: BodyView = 'front'): BodySelectionState {
  if (!BODY_VIEW_IDS.includes(view)) throw new TypeError(`Unknown body view ${view}.`);
  return {
    view,
    layer: 'hologram',
    selectedRegionId: null,
    selectedSystemId: null,
    selectedStructureId: null,
    painPrecision: 'general-area',
    exactPoint: null,
  };
}

export function selectRegion(
  state: Readonly<BodySelectionState>,
  regionId: BodyRegionId,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): BodySelectionState {
  const region = domain.regions.find((candidate) => candidate.id === regionId);
  if (!region) throw new TypeError(`Unknown body region ${regionId}.`);
  if (!regionAvailableInView(region, state.view)) {
    throw new TypeError(`Body region ${regionId} is not available in the ${state.view} view.`);
  }
  if (state.selectedRegionId === regionId) {
    return { ...state, exactPoint: state.exactPoint ? { ...state.exactPoint } : null };
  }
  return {
    ...state,
    selectedRegionId: regionId,
    selectedSystemId: null,
    selectedStructureId: null,
    painPrecision: 'general-area',
    exactPoint: null,
  };
}

export function clearRegion(state: Readonly<BodySelectionState>): BodySelectionState {
  return {
    ...state,
    selectedRegionId: null,
    selectedSystemId: null,
    selectedStructureId: null,
    painPrecision: 'general-area',
    exactPoint: null,
  };
}

export function changeBodyView(
  state: Readonly<BodySelectionState>,
  view: BodyView,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): BodySelectionState {
  if (!BODY_VIEW_IDS.includes(view)) throw new TypeError(`Unknown body view ${view}.`);
  const viewChanged = view !== state.view;
  const next = {
    ...state,
    view,
    painPrecision: viewChanged ? 'general-area' as const : state.painPrecision,
    exactPoint: viewChanged ? null : state.exactPoint ? { ...state.exactPoint } : null,
  };
  const region = selectedRegion(next, domain);
  return region && !regionAvailableInView(region, view) ? clearRegion(next) : next;
}

export function changeBodyLayer(
  state: Readonly<BodySelectionState>,
  layer: BodyLayerId,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): BodySelectionState {
  if (!BODY_LAYER_IDS.includes(layer)) throw new TypeError(`Unknown body layer ${layer}.`);
  const selectedSystemId = layer === 'hologram' || !systemAvailable(state.selectedSystemId, state.selectedRegionId, domain)
    ? null
    : state.selectedSystemId;
  const selectedStructureId = layer !== 'structures' || !structureAvailable(state.selectedStructureId, state.selectedRegionId, domain)
    ? null
    : state.selectedStructureId;
  return {
    ...state,
    layer,
    selectedSystemId,
    selectedStructureId,
    exactPoint: state.exactPoint ? { ...state.exactPoint } : null,
  };
}

export function selectSystem(
  state: Readonly<BodySelectionState>,
  systemId: string,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): BodySelectionState {
  if (state.layer !== 'systems' && state.layer !== 'structures') {
    throw new TypeError('A system can be selected only in the systems or structures layer.');
  }
  if (!systemAvailable(systemId, state.selectedRegionId, domain)) {
    throw new TypeError(`System ${systemId} is not available for the selected region.`);
  }
  const selectedStructure = domain.structures.find((structure) => structure.id === state.selectedStructureId);
  return {
    ...state,
    selectedSystemId: systemId,
    selectedStructureId: selectedStructure?.systemId === systemId ? state.selectedStructureId : null,
    exactPoint: state.exactPoint ? { ...state.exactPoint } : null,
  };
}

export function selectStructure(
  state: Readonly<BodySelectionState>,
  structureId: string,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): BodySelectionState {
  if (state.layer !== 'structures') throw new TypeError('A structure can be selected only in the structures layer.');
  if (!structureAvailable(structureId, state.selectedRegionId, domain)) {
    throw new TypeError(`Structure ${structureId} is not available for the selected region.`);
  }
  const structure = domain.structures.find((candidate) => candidate.id === structureId);
  return {
    ...state,
    selectedSystemId: structure?.systemId ?? state.selectedSystemId,
    selectedStructureId: structureId,
    exactPoint: state.exactPoint ? { ...state.exactPoint } : null,
  };
}

export function setPainPrecision(
  state: Readonly<BodySelectionState>,
  precision: PainPrecision,
  point?: Readonly<NormalizedPoint>,
): BodySelectionState {
  if (state.selectedRegionId === null) throw new TypeError('Pain precision requires a selected semantic region.');
  if (precision === 'general-area') {
    if (point !== undefined) throw new TypeError('A general-area location cannot include an exact point.');
    return { ...state, painPrecision: precision, exactPoint: null };
  }
  if (point === undefined || !pointIsNormalized(point)) {
    throw new RangeError('An exact pain point requires finite x and y coordinates from 0 to 1.');
  }
  return { ...state, painPrecision: precision, exactPoint: { ...point } };
}

export function painLocationFromSelection(state: Readonly<BodySelectionState>) {
  if (state.selectedRegionId === null) return null;
  if (state.painPrecision === 'exact-point') {
    if (state.exactPoint === null) throw new TypeError('Exact-point selection is missing its normalized point.');
    return { regionId: state.selectedRegionId, precision: 'exact-point' as const, point: { ...state.exactPoint } };
  }
  return { regionId: state.selectedRegionId, precision: 'general-area' as const };
}

export function validateBodySelectionState(
  state: Readonly<BodySelectionState>,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): ContractValidationReport {
  const errors: BodyValidationIssue[] = [];
  if (!BODY_VIEW_IDS.includes(state.view)) errors.push({ code: 'INVALID_VIEW', path: 'selection.view', message: 'Unknown body view.' });
  if (!BODY_LAYER_IDS.includes(state.layer)) errors.push({ code: 'INVALID_LAYER', path: 'selection.layer', message: 'Unknown body layer.' });
  const region = selectedRegion(state, domain);
  if (state.selectedRegionId !== null && !region) {
    errors.push({ code: 'UNKNOWN_REGION', path: 'selection.selectedRegionId', message: 'Selected region does not exist.' });
  } else if (region && !regionAvailableInView(region, state.view)) {
    errors.push({ code: 'REGION_UNAVAILABLE_IN_VIEW', path: 'selection.selectedRegionId', message: 'Selected region is unavailable in the current view.' });
  }
  if (state.selectedRegionId === null && (state.painPrecision === 'exact-point' || state.exactPoint !== null)) {
    errors.push({ code: 'POINT_WITHOUT_REGION', path: 'selection.exactPoint', message: 'An exact pain point requires a selected region.' });
  }
  if (state.painPrecision === 'general-area' && state.exactPoint !== null) {
    errors.push({ code: 'GENERAL_AREA_HAS_POINT', path: 'selection.exactPoint', message: 'A general-area selection cannot include a point.' });
  }
  if (state.painPrecision === 'exact-point' && (state.exactPoint === null || !pointIsNormalized(state.exactPoint))) {
    errors.push({ code: 'INVALID_EXACT_POINT', path: 'selection.exactPoint', message: 'Exact-point precision requires normalized coordinates.' });
  }
  if (state.selectedSystemId !== null) {
    if (state.layer === 'hologram') errors.push({ code: 'SYSTEM_IN_WRONG_LAYER', path: 'selection.selectedSystemId', message: 'A system cannot be selected in the hologram layer.' });
    if (!systemAvailable(state.selectedSystemId, state.selectedRegionId, domain)) errors.push({ code: 'SYSTEM_UNAVAILABLE', path: 'selection.selectedSystemId', message: 'Selected system is unavailable for the selected region.' });
  }
  if (state.selectedStructureId !== null) {
    if (state.layer !== 'structures') errors.push({ code: 'STRUCTURE_IN_WRONG_LAYER', path: 'selection.selectedStructureId', message: 'A structure requires the structures layer.' });
    if (!structureAvailable(state.selectedStructureId, state.selectedRegionId, domain)) errors.push({ code: 'STRUCTURE_UNAVAILABLE', path: 'selection.selectedStructureId', message: 'Selected structure is unavailable for the selected region.' });
  }
  return { valid: errors.length === 0, errors };
}
