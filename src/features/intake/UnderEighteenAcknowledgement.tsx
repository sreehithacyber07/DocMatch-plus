import { useState } from 'react';
import { Button } from '../../components/primitives/Button.tsx';
import { Dialog } from '../../components/primitives/Dialog.tsx';
import { needsReporterChoice, type ReporterChoice } from './question-voice.ts';

export interface UnderEighteenAcknowledgementProps {
  open: boolean;
  age: number;
  onContinue: (reporter: ReporterChoice | null) => void;
  onBack: () => void;
}

const REPORTER_OPTIONS: readonly { value: ReporterChoice; label: string }[] = [
  { value: 'young-person', label: 'The young person' },
  { value: 'caregiver', label: 'Parent, guardian or caregiver' },
];

/**
 * The adult-presence acknowledgement for an under-18 assessment.
 *
 * A product safety rule, not a legal one: it asks that a responsible adult is
 * present while a child's questions are answered and urgent guidance is acted
 * on. Nothing about the adult is collected: no name, relationship detail or
 * contact. For 12 to 17 it also records who is answering, which locks the
 * questionnaire voice for the rest of the assessment.
 *
 * Any way out other than the primary action (Go back, Escape, the close
 * button, a click on the backdrop) returns to About you without advancing.
 */
export function UnderEighteenAcknowledgement({ open, age, onContinue, onBack }: UnderEighteenAcknowledgementProps) {
  const askReporter = needsReporterChoice(age);
  const [reporter, setReporter] = useState<ReporterChoice | null>(null);
  const [attempted, setAttempted] = useState(false);
  const missingChoice = askReporter && reporter === null;

  const confirm = () => {
    if (missingChoice) {
      setAttempted(true);
      document.getElementById('under18-reporter')?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    onContinue(askReporter ? reporter : 'caregiver');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack();
      }}
      className="under18"
      closeLabel="Go back"
      preventBackdropClose
      title={(
        <>
          <span className="under18__eyebrow type-label">Under-18 assessment</span>
          <span className="under18__heading">A responsible adult should be present</span>
        </>
      )}
      description={
        'This assessment is for someone under 18. A parent, guardian, caregiver, or other responsible adult should stay with them while the questions are answered. Some questions may need their help, and any urgent guidance should be acted on by an adult.'
      }
      footer={(
        <div className="under18__actions">
          <Button variant="back" className="under18__back" onClick={onBack}>
            Go back
          </Button>
          <Button variant="primary" className="cta under18__continue" onClick={confirm} disabled={askReporter && reporter === null}>
            {askReporter ? 'CONTINUE TO ASSESSMENT' : 'Continue with an adult present'}
          </Button>
        </div>
      )}
    >
      {askReporter ? (
        <fieldset
          className="under18__reporter"
          id="under18-reporter"
          aria-describedby={attempted && missingChoice ? 'under18-reporter-error' : undefined}
        >
          <legend className="type-label under18__reporter-legend">WHO WILL ANSWER THE QUESTIONS?</legend>
          <p className="type-caption under18__reporter-hint">
            The questions will be worded for the person you choose, for the whole assessment.
          </p>
          <div className="under18__reporter-options">
            {REPORTER_OPTIONS.map((option) => (
              <label className="under18__reporter-option" key={option.value} data-checked={reporter === option.value}>
                <input
                  type="radio"
                  name="under18-reporter"
                  value={option.value}
                  checked={reporter === option.value}
                  onChange={() => {
                    setReporter(option.value);
                    setAttempted(false);
                  }}
                />
                <span className="type-control">{option.label}</span>
              </label>
            ))}
          </div>
          {attempted && missingChoice ? (
            <p className="type-caption under18__error" id="under18-reporter-error" role="alert">
              Choose who is answering to continue.
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <p className="type-body-small under18__support">
        DocMatch+ organizes the symptoms reported here and recommends a clinical direction. It does not provide a
        {' '}diagnosis.
      </p>
    </Dialog>
  );
}
