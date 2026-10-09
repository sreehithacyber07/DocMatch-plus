import type { BodyView, PainLocation } from '../../body/index.ts';
import type { BodyVariantId } from '../../features/body-explorer/artwork/hitmap-geometry.ts';
import type { BodySnapshot } from '../../features/body-explorer/BodyExplorer.tsx';
import type { RegionAssessmentContext } from '../../features/body-explorer/clinical-coverage.ts';
import type { ComplaintSource } from '../../features/body-explorer/unmapped-regions.ts';
import type { IntakeSnapshot } from '../../features/intake/PatientIntake.tsx';
import type { PatientContext } from '../../features/intake/patient-context.ts';
import type { RoutingSnapshot } from '../../features/routing-flow/RoutingFlow.tsx';
import { createPatientMemory, RESUME_WINDOW_MS } from '../../features/trust/patient-memory.ts';
import { DEPLOYMENT_MODE } from '../../features/trust/runtime-config.ts';
import type { PatientSessionBoundary } from '../../features/trust/session-policy.ts';

export interface Confirmed {
  complaintId: string;
  painLocation: PainLocation | null;
  source: ComplaintSource;
  view: BodyView;
  clinicalContext: RegionAssessmentContext;
  /** When the patient confirmed the concern; the location was fixed at that moment. */
  confirmedAt: string;
}

/** The route screen's own patient state. */
export interface RouteSnapshot {
  patientSession: PatientSessionBoundary<Confirmed>;
  intake: { epoch: number; context: PatientContext } | null;
  artworkVariant: BodyVariantId | null;
}

export type RouteMemoryParts = {
  route: RouteSnapshot;
  intake: IntakeSnapshot;
  body: BodySnapshot;
  routing: RoutingSnapshot;
};

/**
 * The one patient's screen state, held in page memory while /route is away.
 * Only a web/self-service build (the patient's own device) keeps it across
 * leaving /route; a kiosk or staffed tablet discards it on exit. See
 * features/trust/patient-memory.ts for the full privacy rules.
 */
export const routeMemory = createPatientMemory<RouteMemoryParts>({
  retainAcrossExit: DEPLOYMENT_MODE === 'web/self-service',
  resumeWindowMs: RESUME_WINDOW_MS,
});

// A page restored from the back/forward cache is a new patient boundary, even
// while /route is not on screen, so nothing from before it can be resumed.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) routeMemory.discard();
  });
}
