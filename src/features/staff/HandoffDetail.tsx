import { Disclose, DiscloseItem } from '../../components/layout';
import { Pictogram } from '../../components/pictograms';
import { CLINICAL_BOUNDARY } from '../trust/copy.ts';
import { HANDOFF_STATUS_LABEL, type HandoffDetailView } from './workspace.ts';

const SOAP_TITLE: Readonly<Record<'S' | 'O' | 'A' | 'P', string>> = {
  S: 'Subjective',
  O: 'Objective',
  A: 'Assessment',
  P: 'Plan',
};

export interface HandoffDetailProps {
  detail: HandoffDetailView;
  acknowledging: boolean;
  onAcknowledge: () => void;
  notice: string | null;
}

function when(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Not recorded';
}

/**
 * One prepared handoff, as the care team reads it.
 *
 * Everything shown is stored evidence: what the patient reported, what the body
 * map captured, what R3 screened, and the specialty direction the frozen engine
 * produced. Nothing is inferred here, and the note is never edited: R9F is
 * review and acknowledgement.
 */
export function HandoffDetail({ detail, acknowledging, onAcknowledge, notice }: HandoffDetailProps) {
  const { item } = detail;
  const acknowledged = item.status === 'acknowledged';

  return (
    <article className="staff-detail" aria-labelledby="staff-detail-title">
      <header className="staff-detail__head">
        <div>
          <p className="type-label staff-detail__eyebrow">
            {item.complaintLabel} / prepared {when(item.preparedAt)}
          </p>
          <h2 className="type-heading-2 staff-detail__title" id="staff-detail-title">
            {item.directionLabel ?? 'No specialty direction recorded'}
          </h2>
        </div>
        <span className="staff-status" data-status={item.status}>
          <span className="type-caption">{HANDOFF_STATUS_LABEL[item.status]}</span>
        </span>
      </header>

      {item.priority ? (
        <p className="staff-detail__priority" role="note">
          <Pictogram name="priority" size={20} state="critical" />
          <span className="type-body-small">
            {item.canonical
              ? 'An urgent-review safety rule was recorded alongside the specialty direction.'
              : <>Warning-sign screening was triggered during this assessment
                {item.prioritySeverity ? ` (${item.prioritySeverity})` : ''}. The patient saw priority guidance on screen.</>}
          </span>
        </p>
      ) : null}

      <section className="staff-detail__block" aria-labelledby="staff-direction">
        <h3 className="type-label staff-detail__block-title" id="staff-direction">Why this direction</h3>
        <p className="type-body-small staff-detail__copy">
          {detail.routeSummary
            ? item.canonical
              ? detail.routeSummary.converged
                ? `The recorded responses support ${detail.routeSummary.direction} as the next clinical direction. Basis: ${detail.routeSummary.stopReason.replace(/-/g, ' ')}.`
                : `No narrower direction separated. ${detail.routeSummary.direction} is the recorded parent-service direction.`
              : detail.routeSummary.converged
                ? `The response pattern separated toward ${detail.routeSummary.direction}. Stop reason: ${detail.routeSummary.stopReason.replace(/_/g, ' ')}.`
                : `No single specialty separated. General Medicine is recorded as the starting point. Stop reason: ${detail.routeSummary.stopReason.replace(/_/g, ' ')}.`
            : 'No routing result is stored for this assessment.'}
        </p>
        {detail.bodyContext ? (
          <p className="type-body-small staff-detail__copy">
            <span className="staff-detail__inline-label">Body map</span> {detail.bodyContext}
          </p>
        ) : null}
      </section>

      {[
        { title: 'Reported description', lines: detail.intake, id: 'staff-intake' },
        { title: 'Interview answers', lines: detail.routing, id: 'staff-routing' },
        { title: 'Warning-sign screening', lines: detail.safety, id: 'staff-safety' },
      ].map((group) =>
        group.lines.length > 0 ? (
          <section className="staff-detail__block" key={group.id} aria-labelledby={group.id}>
            <h3 className="type-label staff-detail__block-title" id={group.id}>{group.title}</h3>
            <dl className="staff-answers">
              {group.lines.map((line) => (
                <div className="staff-answers__row" key={`${group.id}-${line.questionId}`}>
                  <dt className="type-caption">{line.question}</dt>
                  <dd className="type-body-small">{line.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null,
      )}

      <Disclose title="Prepared SOAP summary" mark="summary" emphasis="section">
        <DiscloseItem>
          {detail.soap ? (
            <div className="staff-soap">
              {(['S', 'O', 'A', 'P'] as const).map((key) => (
                <section className="staff-soap__section" key={key}>
                  <h4 className="type-label staff-soap__title">{SOAP_TITLE[key]}</h4>
                  <dl className="staff-answers">
                    {detail.soap?.[key].map((line) => (
                      <div className="staff-answers__row" key={`${key}-${line.label}`}>
                        <dt className="type-caption">{line.label}</dt>
                        <dd className="type-body-small">{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : (
            <p className="type-body-small">No prepared summary is stored for this handoff.</p>
          )}
        </DiscloseItem>
      </Disclose>

      {detail.history.length > 0 ? (
        <section className="staff-detail__block" aria-labelledby="staff-history">
          <h3 className="type-label staff-detail__block-title" id="staff-history">Review history</h3>
          <ul className="staff-history">
            {detail.history.map((entry) => (
              <li className="type-caption" key={`${entry.label}-${entry.at}`}>
                {entry.label} / {when(entry.at)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="staff-detail__actions">
        <div className="staff-detail__action-copy">
          <p className="type-caption">
            {acknowledged
              ? 'Acknowledged. This records that the care team saw this prepared handoff.'
              : 'Acknowledging records that you have seen this prepared handoff. It does not assign a clinician, book an appointment or start treatment.'}
          </p>
          {notice ? <p className="type-caption staff-detail__notice" role="status">{notice}</p> : null}
        </div>
        <button
          className="staff-cta"
          type="button"
          onClick={onAcknowledge}
          disabled={acknowledged || acknowledging}
        >
          <span className="type-control">
            {acknowledged ? 'Acknowledged' : acknowledging ? 'Recording' : 'Acknowledge handoff'}
          </span>
          <Pictogram name="handoff" size={20} />
        </button>
      </footer>
      <p className="type-caption staff-detail__boundary">{CLINICAL_BOUNDARY}</p>
    </article>
  );
}
