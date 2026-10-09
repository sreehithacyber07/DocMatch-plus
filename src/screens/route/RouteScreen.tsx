import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BodyVariantId } from '../../features/body-explorer/artwork/hitmap-geometry.ts';
import { useNavigate } from 'react-router-dom';
import { BodyExplorer, type BodySnapshot } from '../../features/body-explorer/BodyExplorer.tsx';
import { RoutingFlow, type RoutingSnapshot, type RoutingSurface } from '../../features/routing-flow/RoutingFlow.tsx';
import { DocMatchEnvironment } from '../../components/docmatch-visual/DocMatchEnvironment.tsx';
import type { EnvironmentIntensity } from '../../components/docmatch-visual/config.ts';
import { bodyRegionById, type PainLocation } from '../../body/index.ts';
import { lateralityLabel } from '../../features/body-explorer/laterality.ts';
import { KioskPrivacyBoundary } from '../../features/trust/KioskPrivacyBoundary.tsx';
import { DEPLOYMENT_MODE, DEPLOYMENT_PROFILE, KIOSK_IDLE_POLICY } from '../../features/trust/runtime-config.ts';
import {
  confirmPatientSession,
  createPatientSessionBoundary,
  resetPatientSession,
  type PatientResetReason,
} from '../../features/trust/session-policy.ts';
import type { AssessmentStart } from '../../features/persistence/events.ts';
import {
  CARE_TEAM_ADMISSION_REQUIRED,
  checkCareTeamOnTablet,
  createRuntimePersistence,
} from '../../features/persistence/runtime.ts';
import {
  usePatientPersistence,
  usePersistenceSnapshot,
  type PersistenceRetention,
} from '../../features/persistence/usePatientPersistence.ts';
import type { AssessmentPersistence } from '../../features/persistence/assessment-persistence.ts';
import { useCareTeamGate } from '../../features/persistence/useCareTeamGate.ts';
import { CareTeamGate } from './CareTeamGate.tsx';
import { PatientIntake, type IntakeSnapshot } from '../../features/intake/PatientIntake.tsx';
import type { PatientContext } from '../../features/intake/patient-context.ts';
import { resolveArtwork } from '../../features/body-explorer/artwork/registry.ts';
import { SESSION_NOTICE } from '../../features/persistence/runtime.ts';
import { routeMemory, type Confirmed } from './route-memory.ts';

function describeLocation(painLocation: PainLocation | null): string | null {
  if (!painLocation) return null;
  const region = bodyRegionById(painLocation.regionId);
  if (!region) return null;
  const side = lateralityLabel(region.laterality);
  const precision = painLocation.precision === 'exact-point' ? 'exact point' : 'general area';
  return [region.label, side?.toLowerCase(), precision].filter(Boolean).join(', ');
}

export function RouteScreen() {
  /*
    Page-memory resume. If this patient left /route a moment ago (a browser
    Back, or Back from the terms to the introduction) and this is a
    web/self-service build, their screens come back exactly as they were. The
    memory is JavaScript only, never browser storage; a refresh, New Patient,
    kiosk inactivity or a restored page clears it. See route-memory.ts.
  */
  const [resumed] = useState(() => {
    const { epoch } = routeMemory.resume();
    return { epoch, route: routeMemory.read(epoch, 'route') };
  });
  const [patientSession, setPatientSession] = useState(
    () => resumed.route?.patientSession ?? { ...createPatientSessionBoundary<Confirmed>(), epoch: resumed.epoch },
  );
  const confirmed = patientSession.patient;
  const epoch = patientSession.epoch;

  useEffect(() => {
    routeMemory.attach();
    return () => routeMemory.leave();
  }, []);

  // The memory moves to the next epoch before React commits the reset, so
  // nothing that belonged to the previous patient can be written back or kept.
  const clearPatientSession = useCallback((reason: PatientResetReason) => {
    const next = routeMemory.epoch() + 1;
    routeMemory.reset(next);
    setPatientSession((current) => ({ ...resetPatientSession(current, reason), epoch: next }));
  }, []);

  const confirmConcern = useCallback((next: Confirmed) => {
    setPatientSession((current) => confirmPatientSession(current, next));
  }, []);

  // R8.1 patient context. It belongs to one patient session: it is stored with
  // the epoch it was given in, so any reset (new patient, kiosk inactivity, a
  // restored page) moves the epoch on and the context no longer applies. It is
  // React state only and is never handed to persistence. Age selects the adult
  // or pediatric questionnaire family; the retained background fields remain
  // display-only and never alter specialty likelihoods.
  const [intake, setIntake] = useState<{ epoch: number; context: PatientContext } | null>(() => resumed.route?.intake ?? null);
  const patientContext = intake?.epoch === patientSession.epoch ? intake.context : null;
  const presentationVariant = patientContext?.sexForAssessment === 'female' ? 'female'
    : patientContext?.sexForAssessment === 'male' ? 'male' : null;
  const navigate = useNavigate();
  // Presentation only: which routing surface is showing, for the environment.
  const [surface, setSurface] = useState<RoutingSurface>('interview');
  // The artwork shown on the body map, for the associated location step. Presentation only.
  const [artworkVariant, setArtworkVariant] = useState<BodyVariantId | null>(() => resumed.route?.artworkVariant ?? null);

  // Changing the location is the same patient starting the body map again, so
  // their context moves into the next epoch with them. The body map starts
  // afresh and the answers, which belonged to the previous concern, do not
  // carry. New Patient, inactivity and a restored page carry nothing: they
  // leave the patient behind.
  const changeLocation = useCallback(() => {
    const next = routeMemory.epoch() + 1;
    const carriedIntake = intake && intake.epoch === epoch ? { ...intake, epoch: next } : null;
    routeMemory.reset(next);
    setIntake(carriedIntake);
    setPatientSession((current) => ({ ...resetPatientSession(current, 'manual'), epoch: next }));
  }, [epoch, intake]);

  // Each screen reports its state to the page memory, tagged with the epoch
  // that produced it; a stale epoch's write is ignored.
  useEffect(() => {
    routeMemory.write(epoch, 'route', { patientSession, intake, artworkVariant });
  }, [epoch, patientSession, intake, artworkVariant]);
  const rememberIntake = useCallback((snapshot: IntakeSnapshot) => routeMemory.write(epoch, 'intake', snapshot), [epoch]);
  const rememberBody = useCallback((snapshot: BodySnapshot) => routeMemory.write(epoch, 'body', snapshot), [epoch]);
  const rememberRouting = useCallback((snapshot: RoutingSnapshot) => routeMemory.write(epoch, 'routing', snapshot), [epoch]);

  // Moving between the body and the interview replaces the whole surface, so
  // the viewport returns to the top rather than keeping the previous offset.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [confirmed]);

  // A browser back/forward cache can restore JavaScript memory without a fresh
  // page load. Treat that restoration as a new patient boundary.
  useEffect(() => {
    const clearRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) clearPatientSession('history-return');
    };
    window.addEventListener('pageshow', clearRestoredPage);
    return () => window.removeEventListener('pageshow', clearRestoredPage);
  }, [clearPatientSession]);
  const complaintLabel = confirmed ? confirmed.clinicalContext.complaintLabel : null;

  // Persistence observes the confirmed concern; it never drives the interview.
  const assessmentStart = useMemo<AssessmentStart | null>(() => {
    if (!confirmed) return null;
    const location = confirmed.painLocation;
    return {
      complaintId: confirmed.complaintId,
      complaintSource: confirmed.source,
      clinicalContext: {
        bodyRegionId: confirmed.clinicalContext.bodyRegionId,
        faceSubregionId: confirmed.clinicalContext.faceSubregionId,
        concernId: confirmed.clinicalContext.concernId,
        age: confirmed.clinicalContext.age,
        sexForAssessment: confirmed.clinicalContext.sexForAssessment,
        reporter: confirmed.clinicalContext.age >= 12 && confirmed.clinicalContext.age < 18
          ? confirmed.clinicalContext.questionVoice === 'self' ? 'young-person' : 'caregiver'
          : null,
      },
      location: location
        ? {
            regionId: location.regionId,
            view: confirmed.view,
            precision: location.precision,
            point: location.precision === 'exact-point' ? location.point : null,
            capturedAt: confirmed.confirmedAt,
          }
        : null,
    };
  }, [confirmed]);
  // While this patient is away from /route, their backend session is held
  // rather than ended, so returning continues the same assessment. Any reset
  // ends it (routeMemory disposes a session for a stale epoch).
  const retentionKey = confirmed?.confirmedAt ?? null;
  const persistenceRetention = useMemo<PersistenceRetention | null>(
    () =>
      retentionKey
        ? {
            take: () => routeMemory.unpark<AssessmentPersistence>(epoch, retentionKey),
            release: (session) => routeMemory.park(epoch, retentionKey, session),
          }
        : null,
    [epoch, retentionKey],
  );
  const persistence = usePatientPersistence(assessmentStart, createRuntimePersistence, persistenceRetention);
  const persistenceState = usePersistenceSnapshot(persistence).state;
  // R9G-B staffed tablet: each patient is admitted through the care-team
  // session on this tablet, so a patient begins only while one is signed in.
  const careTeam = useCareTeamGate(CARE_TEAM_ADMISSION_REQUIRED, patientSession.epoch, checkCareTeamOnTablet);
  const careTeamBlocksNewPatient =
    !confirmed && careTeam.state !== 'not-required' && careTeam.state !== 'authorized';

  // The Body Explorer carries its own top bar and progression strip, so it is
  // not wrapped in the R0 shell. Wrapping it would duplicate the identity and
  // spend width the anatomy needs.
  const content = careTeamBlocksNewPatient ? (
      <CareTeamGate
        state={careTeam.state as 'checking' | 'sign-in-required' | 'unavailable'}
        onRecheck={careTeam.recheck}
      />
    ) : !confirmed && !patientContext ? (
      <main className="route-surface route-surface--intake" id="main-content" tabIndex={-1}>
        <a className="route-skip" href="#main-content">
          Skip to content
        </a>
        <PatientIntake
          key={`intake-${patientSession.epoch}`}
          deploymentLabel={DEPLOYMENT_PROFILE.label}
          sessionNotice={SESSION_NOTICE}
          snapshot={routeMemory.read(epoch, 'intake')}
          onSnapshot={rememberIntake}
          onComplete={async (context) => {
            const variant = context.sexForAssessment === 'female' ? 'female'
              : context.sexForAssessment === 'male' ? 'male' : null;
            if (variant) {
              const source = resolveArtwork(variant, 'front', 'hologram').entry.assetRef;
              if (source) {
                const image = new Image();
                image.src = source;
                try { await image.decode(); } catch { /* The explorer handles a missing asset. */ }
              }
            }
            setIntake({ epoch: patientSession.epoch, context });
          }}
          onExit={() => navigate('/', { state: { returnToIntroduction: true } })}
        />
      </main>
    ) : !confirmed || !complaintLabel ? (
      <main className="route-surface" id="main-content" tabIndex={-1}>
        <a className="route-skip" href="#main-content">
          Skip to content
        </a>
        <BodyExplorer
          key={`body-${patientSession.epoch}`}
          presentationVariant={presentationVariant}
          deploymentLabel={DEPLOYMENT_PROFILE.label}
          patientContext={patientContext}
          snapshot={routeMemory.read(epoch, 'body')}
          onSnapshot={rememberBody}
          onNewPatient={() => clearPatientSession('manual')}
          onComplaintConfirmed={(complaintId, painLocation, source, view, clinicalContext, variantId) => {
            setArtworkVariant(variantId);
            confirmConcern({
              complaintId,
              painLocation: painLocation as PainLocation | null,
              source,
              view,
              clinicalContext,
              confirmedAt: new Date().toISOString(),
            });
          }}
        />
      </main>
    ) : (
    <main
      className="route-surface route-surface--assessment"
      id="main-content"
      tabIndex={-1}
      data-persistence={persistenceState}
    >
      <a className="route-skip" href="#main-content">
        Skip to content
      </a>
      <RoutingFlow
        key={`routing-${patientSession.epoch}`}
        complaintId={confirmed.complaintId}
        complaintLabel={complaintLabel}
        regionSummary={describeLocation(confirmed.painLocation)}
        complaintSource={confirmed.source}
        capture={{ painLocation: confirmed.painLocation, view: confirmed.view }}
        onChangeLocation={changeLocation}
        onNewPatient={() => clearPatientSession('manual')}
        persistence={persistence}
        patientContext={patientContext}
        clinicalContext={confirmed.clinicalContext}
        bodyVariant={artworkVariant ?? presentationVariant}
        onSurfaceChange={setSurface}
        snapshot={routeMemory.read(epoch, 'routing')}
        onSnapshot={rememberRouting}
      />
    </main>
  );

  const resetAnnouncement = patientSession.lastResetReason
    ? patientSession.lastResetReason === 'inactivity'
      ? 'Patient session cleared after inactivity. Ready for a new patient.'
      : 'Patient session cleared. Ready for a new patient.'
    : '';

  /*
    The environment follows the patient through the flow: faint behind the
    intake and the questions so the fields lead, quieter behind the Body
    Explorer so the anatomy leads, medium on the result. The priority screen
    keeps it faint, because a warning must never compete with decoration. Each
    stage moves the strand on, so the DNA continues rather than restarting.
  */
  const stageIndex = careTeamBlocksNewPatient || (!confirmed && !patientContext)
    ? 0
    : !confirmed
      ? 1
      : surface === 'result'
        ? 4
        : surface === 'priority'
          ? 3
          : 2;
  const intensity: EnvironmentIntensity =
    stageIndex === 1 ? 'explorer' : stageIndex === 4 ? 'result' : 'form';

  return (
    <DocMatchEnvironment intensity={intensity} offset={stageIndex * 420}>
    <KioskPrivacyBoundary
      enabled={DEPLOYMENT_MODE === 'hospital-kiosk'}
      policy={KIOSK_IDLE_POLICY}
      onReset={clearPatientSession}
    >
      {content}
      <p className="route-session-announcement" role="status" aria-live="polite">
        {resetAnnouncement}
      </p>
    </KioskPrivacyBoundary>
    </DocMatchEnvironment>
  );
}
