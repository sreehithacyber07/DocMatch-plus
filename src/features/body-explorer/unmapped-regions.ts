/**
 * What happens when the bridge does not map the region the patient tapped.
 *
 * Four selectable regions do not resolve directly through the approved bridge:
 * face, chest, lower abdomen and pelvis. This module offers only an approved
 * patient-stated complaint where one already exists. Other locations receive
 * a temporary care-team handoff until their sourced medical pass is complete.
 *
 * Two mechanisms, and the difference between them matters:
 *
 *   statable   an approved complaint the PATIENT may declare at this location.
 *              The body map does not infer it; the patient states it, and the
 *              handoff records that they did. Only used where offering the
 *              complaint needs no new clinical claim.
 *
 * WHY THE CHEST IS OFFERED BREATHLESSNESS AND NOT AN ABDOMINAL QUESTION SET.
 *
 * `shortness-of-breath` is an approved complaint carrying its own approved
 * question set and its own R3 red-flag rules, and it is not anatomically bound:
 * every one of its questions asks about breathing rather than about a body
 * region. It is also the one approved complaint that no region reaches today,
 * which is why it never appeared in the product. A patient who taps their chest
 * and says "breathing feels difficult" has stated a complaint the engine can
 * route correctly, so the chest continues.
 *
 * `upper-abdominal-pain` is deliberately NOT offered at the chest. Its
 * provenance does include the AHA chest pain pathway and its prior carries
 * cardiology, which makes the overlap tempting. It is still refused: chest pain
 * has no approved question set in this build, and running a chest-pain
 * presentation through a question set written for upper abdominal pain would be
 * exactly the invented mapping this file exists to avoid. Chest pain as a
 * first-class complaint is the first item of the clinical data proposal.
 *
 * Face, lower abdomen and pelvis must not be redirected to a different body
 * region. Their own sourced complaint-entry and adaptive questions belong to
 * the separate medical pass, not to this presentation module.
 */
import type { BodyRegionId } from '../../body/index.ts';
import { bodyRegionById } from '../../body/index.ts';
import { candidateComplaintIdsForRegion } from '../../body/bridge/index.ts';
import { R2B_DEMONSTRATION_COMPLAINTS } from '../../engine/data/index.ts';

/** How the complaint reaching the interview was established. */
export type ComplaintSource = 'bridge-resolved' | 'patient-stated';

export interface StatableComplaint {
  complaintId: string;
  /** The patient's own words, not the clinical label. */
  statement: string;
  /** Shown under the option so the offer is never silent about its basis. */
  basis: string;
}

export interface UnmappedRegionPlan {
  statable: readonly StatableComplaint[];
}

const CHEST_BREATHLESSNESS: StatableComplaint = {
  complaintId: 'shortness-of-breath',
  statement: 'Breathing feels difficult',
  basis: 'Breathing questions do not depend on where you tapped.',
};

const PLANS: Readonly<Record<string, UnmappedRegionPlan>> = {
  chest: {
    statable: [CHEST_BREATHLESSNESS],
  },
  face: {
    statable: [],
  },
  'lower-abdomen': {
    statable: [],
  },
  pelvis: {
    statable: [],
  },
};

const EMPTY: UnmappedRegionPlan = { statable: [] };

/**
 * The continuation plan for a region the bridge does not map.
 *
 * Returns empty for a mapped region: a mapped region continues through the
 * bridge and must never be offered a patient-stated alternative, because that
 * would let a patient talk the product out of the complaint its own approved
 * mapping already resolved.
 */
export function unmappedRegionPlan(regionId: BodyRegionId): UnmappedRegionPlan {
  if (candidateComplaintIdsForRegion(regionId).length > 0) return EMPTY;
  const plan = PLANS[regionId] ?? EMPTY;
  return {
    statable: plan.statable.filter((offer) =>
      R2B_DEMONSTRATION_COMPLAINTS.some((complaint) => complaint.id === offer.complaintId),
    ),
  };
}

/** Whether a selected region has any way forward at all. */
export function regionCanContinue(regionId: BodyRegionId): boolean {
  if (candidateComplaintIdsForRegion(regionId).length > 0) return true;
  const plan = unmappedRegionPlan(regionId);
  return plan.statable.length > 0;
}

export function regionLabelFor(regionId: BodyRegionId): string {
  return bodyRegionById(regionId)?.label ?? regionId;
}
