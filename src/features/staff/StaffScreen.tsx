import { useCallback, useEffect, useRef, useState } from 'react';
import { Pictogram } from '../../components/pictograms';
import { resolveStaffConfig } from './config.ts';
import { DEPLOYMENT_MODE } from '../trust/runtime-config.ts';
import { StaffLogin } from './StaffLogin.tsx';
import { HandoffDetail } from './HandoffDetail.tsx';
import {
  HANDOFF_STATUS_LABEL,
  WorkspaceError,
  loadHandoffDetail,
  loadQueue,
  runHandoffTransition,
  type HandoffDetailView,
  type QueueItem,
} from './workspace.ts';
import type { StaffAuthFailure, StaffClient, StaffWorkspaceContext } from './session.ts';
import './staff.css';

const CONFIG = resolveStaffConfig({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

type Phase = 'starting' | 'signed-out' | 'checking' | 'workspace' | 'unconfigured';

/** Loaded on demand so the patient bundle never creates a persistent Auth client. */
async function staffModule() {
  return import('./session.ts');
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Not recorded';
}

/**
 * The clinical workspace.
 *
 * Three states and nothing invented in between: signing in, an empty worklist,
 * or real prepared handoffs for this clinician's facility. The list is what the
 * database returns under the facility policies; there is no demo content, no
 * metric tile and no queue position, because none of that is recorded.
 */
/**
 * A read or transition failure that must end the workspace session, and the
 * neutral message to show. Revoked access and an expired session are
 * different facts, so they are reported differently.
 */
function sessionEndFor(error: unknown): StaffAuthFailure | null {
  if (error instanceof WorkspaceError && error.failure === 'unauthorized') return 'not-authorized';
  if (error instanceof WorkspaceError && error.failure === 'expired') return 'session-expired';
  return null;
}

export function StaffScreen() {
  const [phase, setPhase] = useState<Phase>(CONFIG.enabled ? 'starting' : 'unconfigured');
  const [busy, setBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [context, setContext] = useState<StaffWorkspaceContext | null>(null);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [detail, setDetail] = useState<HandoffDetailView | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const clientRef = useRef<StaffClient | null>(null);
  const operationKeys = useRef(new Map<string, string>());
  const operationsInFlight = useRef(new Set<string>());
  const sessionEpoch = useRef(0);

  function logicalKey(operation: string, handoffId: string): string {
    const slot = `${operation}:${handoffId}`;
    const existing = operationKeys.current.get(slot);
    if (existing) return existing;
    const created = crypto.randomUUID();
    operationKeys.current.set(slot, created);
    return created;
  }

  const client = useCallback(async (): Promise<StaffClient | null> => {
    if (!CONFIG.enabled) return null;
    if (clientRef.current) return clientRef.current;
    const { createStaffClient } = await staffModule();
    clientRef.current = createStaffClient(CONFIG.url, CONFIG.publishableKey);
    return clientRef.current;
  }, []);

  const endSession = useCallback(async (failure: StaffAuthFailure | null) => {
    sessionEpoch.current += 1;
    setDetail(null);
    setQueue(null);
    const active = clientRef.current;
    const { signOutStaff, STAFF_AUTH_MESSAGE } = await staffModule();
    const signOut = active
      ? await signOutStaff(active)
      : { remoteRevoked: true, localCleared: true };
    clientRef.current = null;
    operationKeys.current.clear();
    operationsInFlight.current.clear();
    setContext(null);
    setNotice(null);
    setQueueError(null);
    setAuthMessage(
      !signOut.localCleared
        ? 'The saved session could not be cleared. Do not leave this device unattended; ask an administrator to clear this browser’s site data.'
        : failure
          ? STAFF_AUTH_MESSAGE[failure]
          : signOut.remoteRevoked
            ? null
            : 'This device was cleared, but server sign-out could not be confirmed.',
    );
    setPhase('signed-out');
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      const active = await client();
      if (!active) return;
      const { authorizeStaff } = await staffModule();
      const authorization = await authorizeStaff(active);
      if (authorization.status !== 'authorized') {
        if (authorization.reason === 'unavailable') throw new WorkspaceError('unavailable');
        await endSession(authorization.reason);
        return;
      }
      setQueueError(null);
      const rows = await loadQueue(active);
      setQueue(rows);
      setDetail((current) => current && rows.some((item) => item.handoffId === current.item.handoffId) ? current : null);
    } catch (error) {
      const ended = sessionEndFor(error);
      if (ended) {
        await endSession(ended);
        return;
      }
      setQueue([]);
      setDetail(null);
      setQueueError('The worklist could not be loaded. Try again shortly.');
    }
  }, [client, endSession]);

  const enterWorkspace = useCallback(async () => {
    const active = await client();
    if (!active) return;
    const { authorizeStaff, STAFF_AUTH_MESSAGE } = await staffModule();
    const authorization = await authorizeStaff(active);
    if (authorization.status !== 'authorized') {
      // A signed-in account that is not authorized is signed out again, so no
      // credential lingers for a workspace it may not use.
      await endSession(authorization.reason);
      setAuthMessage(STAFF_AUTH_MESSAGE[authorization.reason]);
      return;
    }
    setContext(authorization.context);
    setPhase('workspace');
    await refreshQueue();
  }, [client, endSession, refreshQueue]);

  // Restore an existing staff session on load; a patient page never runs this.
  useEffect(() => {
    if (!CONFIG.enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const active = await client();
        if (!active || cancelled) return;
        const { data, error } = await active.auth.getSession();
        if (cancelled) return;
        if (error) throw error;
        if (!data.session) {
          setPhase('signed-out');
          return;
        }
        setPhase('checking');
        await enterWorkspace();
      } catch {
        if (cancelled) return;
        setAuthMessage('The clinical workspace is unavailable right now. Try again shortly.');
        setPhase('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, enterWorkspace]);

  async function submitSignIn(email: string, password: string) {
    setBusy(true);
    setAuthMessage(null);
    try {
      const active = await client();
      if (!active) return;
      const { signInStaff, STAFF_AUTH_MESSAGE } = await staffModule();
      const failure = await signInStaff(active, email, password);
      if (failure) {
        setAuthMessage(STAFF_AUTH_MESSAGE[failure]);
        return;
      }
      setPhase('checking');
      await enterWorkspace();
    } catch {
      setAuthMessage('The clinical workspace is unavailable right now. Try again shortly.');
      setPhase('signed-out');
    } finally {
      setBusy(false);
    }
  }

  /** Selecting a handoff is a clinician genuinely opening it, so it is recorded. */
  async function openHandoff(item: QueueItem) {
    const slot = `handoff-open:${item.handoffId}`;
    if (operationsInFlight.current.has(slot)) return;
    operationsInFlight.current.add(slot);
    const epoch = sessionEpoch.current;
    setDetailBusy(true);
    setDetail(null);
    setNotice(null);
    try {
      const active = await client();
      if (!active) return;
      const { authorizeStaff } = await staffModule();
      const authorization = await authorizeStaff(active);
      if (authorization.status !== 'authorized') {
        if (authorization.reason === 'unavailable') throw new WorkspaceError('unavailable');
        await endSession(authorization.reason);
        return;
      }
      if (item.status === 'prepared' || item.status === 'available_for_review') {
        const result = await runHandoffTransition(active, 'handoff-open', item.handoffId, logicalKey('handoff-open', item.handoffId));
        if (epoch !== sessionEpoch.current) return;
        operationKeys.current.delete(slot);
        item = { ...item, status: result.status };
        setQueue((current) => current?.map((entry) => (entry.handoffId === item.handoffId ? item : entry)) ?? current);
      }
      const loaded = await loadHandoffDetail(active, item);
      if (epoch === sessionEpoch.current) setDetail(loaded);
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      const ended = sessionEndFor(error);
      if (ended) {
        await endSession(ended);
        return;
      }
      setNotice('This handoff could not be opened. Try again shortly.');
    } finally {
      operationsInFlight.current.delete(slot);
      if (epoch === sessionEpoch.current) setDetailBusy(false);
    }
  }

  async function acknowledge() {
    if (!detail) return;
    const slot = `handoff-acknowledge:${detail.item.handoffId}`;
    if (operationsInFlight.current.has(slot)) return;
    operationsInFlight.current.add(slot);
    const epoch = sessionEpoch.current;
    setAcknowledging(true);
    setNotice(null);
    try {
      const active = await client();
      if (!active) return;
      const result = await runHandoffTransition(active, 'handoff-acknowledge', detail.item.handoffId,
        logicalKey('handoff-acknowledge', detail.item.handoffId));
      if (epoch !== sessionEpoch.current) return;
      operationKeys.current.delete(slot);
      const updated = { ...detail.item, status: result.status };
      setDetail({ ...detail, item: updated });
      setQueue((current) => current?.map((entry) => (entry.handoffId === updated.handoffId ? updated : entry)) ?? current);
      if (result.outcome === 'existing') setNotice('This handoff was already acknowledged.');
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      const ended = sessionEndFor(error);
      if (ended) {
        await endSession(ended);
        return;
      }
      setNotice('The acknowledgement could not be recorded. Try again shortly.');
    } finally {
      operationsInFlight.current.delete(slot);
      if (epoch === sessionEpoch.current) setAcknowledging(false);
    }
  }

  if (phase === 'unconfigured') {
    return (
      <main className="staff-entry" id="main-content" tabIndex={-1}>
        <div className="staff-entry__panel">
          <p className="type-label staff-entry__eyebrow">DocMatch+ / Care team</p>
          <h1 className="type-heading-1 staff-entry__title">Clinical workspace</h1>
          <p className="type-body-small staff-entry__lead">
            This build has no clinical backend configured, so the workspace is unavailable.
          </p>
        </div>
      </main>
    );
  }

  if (phase === 'starting' || phase === 'checking') {
    return (
      <main className="staff-entry" id="main-content" tabIndex={-1}>
        <div className="staff-entry__panel">
          <p className="type-label staff-entry__eyebrow">DocMatch+ / Care team</p>
          <p className="type-body staff-entry__lead" role="status">Checking workspace access</p>
        </div>
      </main>
    );
  }

  if (phase === 'signed-out') {
    return <StaffLogin busy={busy} message={authMessage} onSubmit={submitSignIn} />;
  }

  return (
    <main className="staff-workspace" id="main-content" tabIndex={-1}>
      <header className="staff-bar">
        <div className="staff-bar__identity">
          <Pictogram name="clinician" size={20} />
          <span className="type-control staff-bar__facility">{context?.facilityName}</span>
          <span className="type-caption staff-bar__role">Clinical staff</span>
        </div>
        <div className="staff-bar__actions">
          {DEPLOYMENT_MODE === 'staffed-tablet' ? (
            // R9G-B: on a staffed tablet the patient assessment starts from
            // here, admitted through this signed-in care-team session.
            <a className="staff-ghost" href="/route">
              <span className="type-control">Patient assessment</span>
            </a>
          ) : null}
          <button className="staff-ghost" type="button" onClick={() => void refreshQueue()}>
            <span className="type-control">Refresh</span>
          </button>
          <button className="staff-ghost" type="button" onClick={() => void endSession(null)}>
            <span className="type-control">Sign out</span>
          </button>
        </div>
      </header>

      <div className="staff-grid">
        <section className="staff-queue" aria-labelledby="staff-queue-title">
          <div className="staff-queue__head">
            <h1 className="type-label staff-queue__title" id="staff-queue-title">Prepared handoffs</h1>
            <span className="type-caption staff-queue__count">{queue?.length ?? 0}</span>
          </div>

          {queueError ? <p className="type-body-small staff-empty" role="alert">{queueError}</p> : null}

          {queue !== null && queue.length === 0 && !queueError ? (
            <p className="type-body-small staff-empty">
              No prepared handoffs for this facility yet. A handoff appears here after an assessment
              taken at this facility prepares one.
            </p>
          ) : null}

          <ul className="staff-queue__list">
            {(queue ?? []).map((item) => (
              <li key={item.handoffId}>
                <button
                  className="staff-row"
                  type="button"
                  aria-current={detail?.item.handoffId === item.handoffId ? 'true' : undefined}
                  onClick={() => void openHandoff(item)}
                >
                  <span className="staff-row__line">
                    <span className="type-control staff-row__direction">
                      {item.directionLabel ?? 'Direction not recorded'}
                    </span>
                    <span className="staff-status" data-status={item.status}>
                      <span className="type-caption">{HANDOFF_STATUS_LABEL[item.status]}</span>
                    </span>
                  </span>
                  <span className="staff-row__line staff-row__meta">
                    <span className="type-caption">{item.complaintLabel}</span>
                    <span className="type-caption">{formatTime(item.preparedAt)}</span>
                  </span>
                  {item.priority ? (
                    <span className="staff-row__priority">
                      <Pictogram name="priority" size={20} state="critical" />
                      <span className="type-caption">Warning sign screened</span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="staff-panel" aria-live="polite">
          {detailBusy && !detail ? <p className="type-body-small staff-empty">Opening handoff</p> : null}
          {detail ? (
            <HandoffDetail
              detail={detail}
              acknowledging={acknowledging}
              onAcknowledge={() => void acknowledge()}
              notice={notice}
            />
          ) : (
            !detailBusy && (
              <p className="type-body-small staff-empty" role={notice ? 'alert' : undefined}>
                {notice ?? 'Select a handoff to review the prepared summary and the evidence behind it.'}
              </p>
            )
          )}
        </section>
      </div>
    </main>
  );
}
