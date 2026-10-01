/**
 * Which services are even presentable for this assessment.
 *
 * INTERNAL MODEL STATE IS NOT A ROUTE.
 *
 * The R1 belief vector carries six keys for every weighted complaint, so an
 * upper-abdominal run holds a Neurology and a Dermatology number from the
 * first question. That is engine state. It must never become something a
 * patient sees: an abdominal concern cannot surface Neurology because the
 * vector happens to contain it, and a knee cannot surface Gastroenterology.
 *
 * This module answers one question from age, anatomy, concern and physiology:
 * which destinations are plausible for this presentation at all? It does NOT
 * route. The questions, the published criteria and the weighted evidence still
 * decide whether any of them is actually selected. It is the filter every
 * selected direction must pass before it is shown, and the tests assert that
 * every gate and weighted route stays inside it.
 */
import type { RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { reproductiveBranchEligible } from './direction-gate.ts';
import { SPECIALTY_REGISTRY } from './specialty-registry.ts';

const MUSCULOSKELETAL_REGION = /(shoulder|arm|elbow|forearm|wrist|hand|hip|thigh|knee|leg|ankle|foot|back)/;
const EYE = ['patient-right-eye', 'patient-left-eye'];
const EAR = ['patient-right-ear', 'patient-left-ear'];

/** The weighted complaints, which have no clinical context in older call sites. */
const WEIGHTED_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
  'upper-abdominal-pain': ['medical-gastroenterology', 'cardiology'],
  'shortness-of-breath': ['cardiology', 'respiratory-medicine'],
  // Headache can reach Neurology or ENT only through the source-backed gate;
  // no extra likelihoods are assigned to either direction here.
  headache: ['neurology', 'otorhinolaryngology'],
  'joint-musculoskeletal-pain': ['orthopaedics'],
};

function routable(ids: Iterable<string>): string[] {
  const enabled = new Set(SPECIALTY_REGISTRY.filter((record) => record.routingEnabled).map((record) => record.id));
  return [...new Set(ids)].filter((id) => enabled.has(id));
}

export interface RouteEligibility {
  /** The population parent service: always presentable. */
  parentServiceId: 'general-medicine' | 'paediatrics';
  /** Narrower services that may be presented if the evidence selects them. */
  narrowerServiceIds: readonly string[];
}

export function eligibleRouteDirections(
  context: RegionAssessmentContext | null,
  complaintId: string = context?.complaintId ?? '',
): RouteEligibility {
  const pediatric = context?.patientMode === 'pediatric';
  const parentServiceId = pediatric ? 'paediatrics' : 'general-medicine';
  if (!context) {
    return { parentServiceId, narrowerServiceIds: routable(WEIGHTED_ELIGIBILITY[complaintId] ?? []) };
  }

  const ids: string[] = [];
  if (!pediatric && WEIGHTED_ELIGIBILITY[complaintId]) ids.push(...WEIGHTED_ELIGIBILITY[complaintId]);

  const face = context.faceSubregionId ?? '';
  const concern = context.concernId;
  const region = context.bodyRegionId;
  const lower = region === 'lower-abdomen' || region === 'pelvis';

  if (EAR.includes(face) || face === 'nose' || complaintId === 'throat-concern') ids.push('otorhinolaryngology');
  if (EYE.includes(face)) ids.push('ophthalmology');
  if (concern === 'skin-change') ids.push('dermatology');
  if (MUSCULOSKELETAL_REGION.test(region) && ['pain', 'injury', 'movement-function', 'swelling-lump'].includes(concern)) {
    ids.push('orthopaedics');
  }

  // Adult-only services never enter a child's eligible set.
  if (!pediatric) {
    if (region === 'chest' && concern !== 'skin-change' && concern !== 'injury') {
      ids.push('cardiology', 'respiratory-medicine');
    }
    if ((lower || region === 'upper-abdomen') && ['bowel-change', 'pain', 'swelling-lump', 'other'].includes(concern)) {
      ids.push('medical-gastroenterology');
    }
    if (lower && ['urinary-change', 'pain', 'swelling-lump', 'other'].includes(concern)) ids.push('urology');
    if (region === 'upper-abdomen' && concern === 'urinary-change') ids.push('urology');
    // Heartburn, reflux or swallowing felt in the chest (NHS Heartburn and acid reflux).
    if (region === 'chest' && concern === 'voice-swallow') ids.push('medical-gastroenterology');
    // NICE NG127: progressive limb or neck weakness, and one-sided facial pain set off by touch.
    if (concern === 'weakness-drooping' && (MUSCULOSKELETAL_REGION.test(region) || region === 'neck')) ids.push('neurology');
    if (context.complaintId === 'face-general-concern' && concern === 'pain' && face !== 'upper-neck') ids.push('neurology', 'otorhinolaryngology');
    // NHS Lumps and NICE NG12: a neck lump that has not gone down.
    if ((region === 'neck' || face === 'upper-neck') && concern === 'swelling-lump') ids.push('otorhinolaryngology');
    if (reproductiveBranchEligible(context)
      && ['reproductive-pelvic-change', 'pain', 'swelling-lump', 'other', 'bleeding-discharge'].includes(concern)) {
      ids.push('obstetrics-gynaecology');
    }
  }

  return { parentServiceId, narrowerServiceIds: routable(ids) };
}

/** Whether a registry id may be shown for this assessment. */
export function isPresentable(eligibility: RouteEligibility, registryId: string): boolean {
  return registryId === eligibility.parentServiceId || eligibility.narrowerServiceIds.includes(registryId);
}
