import { BODY_REGION_IDS, type BodyRegionId } from './ids.ts';
import type { BodyValidationIssue, ContractValidationReport, NormalizedPoint, PainLocation } from './types.ts';

export const R4_MAX_PAIN_POINTS = 1;

function normalizedPointErrors(point: unknown, path: string): BodyValidationIssue[] {
  if (typeof point !== 'object' || point === null) {
    return [{ code: 'POINT_REQUIRED', path, message: 'An exact pain location requires a normalized point.' }];
  }
  const candidate = point as Partial<NormalizedPoint>;
  const errors: BodyValidationIssue[] = [];
  for (const axis of ['x', 'y'] as const) {
    const value = candidate[axis];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      errors.push({ code: 'POINT_OUT_OF_BOUNDS', path: `${path}.${axis}`, message: `${axis} must be a finite number from 0 to 1.` });
    }
  }
  return errors;
}
export function validatePainLocation(location: unknown): ContractValidationReport {
  const errors: BodyValidationIssue[] = [];
  if (typeof location !== 'object' || location === null) {
    return { valid: false, errors: [{ code: 'PAIN_LOCATION_REQUIRED', path: 'painLocation', message: 'Pain location must be an object.' }] };
  }
  const candidate = location as { regionId?: unknown; precision?: unknown; point?: unknown };
  if (typeof candidate.regionId !== 'string' || !BODY_REGION_IDS.includes(candidate.regionId as BodyRegionId)) {
    errors.push({ code: 'UNKNOWN_REGION', path: 'painLocation.regionId', message: 'Pain location must reference a known semantic region.' });
  }
  if (candidate.precision !== 'general-area' && candidate.precision !== 'exact-point') {
    errors.push({ code: 'INVALID_PAIN_PRECISION', path: 'painLocation.precision', message: 'Pain precision must be general-area or exact-point.' });
  } else if (candidate.precision === 'general-area' && candidate.point !== undefined) {
    errors.push({ code: 'GENERAL_AREA_HAS_POINT', path: 'painLocation.point', message: 'A general-area location cannot include an exact point.' });
  } else if (candidate.precision === 'exact-point') {
    errors.push(...normalizedPointErrors(candidate.point, 'painLocation.point'));
  }
  return { valid: errors.length === 0, errors };
}

export function validatePrimaryPainLocations(locations: readonly unknown[]): ContractValidationReport {
  const errors: BodyValidationIssue[] = [];
  if (locations.length > R4_MAX_PAIN_POINTS) {
    errors.push({ code: 'TOO_MANY_PAIN_LOCATIONS', path: 'painLocations', message: `R4 permits at most ${R4_MAX_PAIN_POINTS} primary pain location.` });
  }
  locations.forEach((location, index) => {
    for (const issue of validatePainLocation(location).errors) {
      errors.push({ ...issue, path: `painLocations[${index}]${issue.path.slice('painLocation'.length)}` });
    }
  });
  return { valid: errors.length === 0, errors };
}

export function assertPainLocation(location: unknown): asserts location is PainLocation {
  const report = validatePainLocation(location);
  if (!report.valid) throw new TypeError(report.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
}

export function generalAreaPainLocation(regionId: BodyRegionId): PainLocation {
  return { regionId, precision: 'general-area' };
}

export function exactPointPainLocation(regionId: BodyRegionId, point: Readonly<NormalizedPoint>): PainLocation {
  const location = { regionId, precision: 'exact-point' as const, point: { ...point } };
  assertPainLocation(location);
  return location;
}
