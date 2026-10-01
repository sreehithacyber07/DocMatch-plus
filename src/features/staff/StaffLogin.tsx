import { useId, useState, type FormEvent } from 'react';
import { Pictogram } from '../../components/pictograms';
import { CLINICAL_BOUNDARY } from '../trust/copy.ts';

export interface StaffLoginProps {
  busy: boolean;
  message: string | null;
  onSubmit: (email: string, password: string) => void;
}

/**
 * The care-team entrance.
 *
 * Deliberately a separate surface from the patient assessment: a patient never
 * reaches it, and it never collects patient information. There is no account
 * creation and no password recovery here; both are administered by the facility
 * through a trusted channel, so nothing on this page can grant access.
 */
export function StaffLogin({ busy, message, onSubmit }: StaffLoginProps) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) onSubmit(email, password);
  }

  return (
    <main className="staff-entry" id="main-content" tabIndex={-1}>
      <form className="staff-entry__panel" onSubmit={submit} noValidate>
        <p className="type-label staff-entry__eyebrow">DocMatch+ / Care team</p>
        <h1 className="type-heading-1 staff-entry__title">Clinical workspace</h1>
        <p className="type-body-small staff-entry__lead">
          Sign in with the account your facility issued to review prepared handoffs.
        </p>

        <div className="staff-field">
          <label className="type-label" htmlFor={emailId}>Work email</label>
          <input
            id={emailId}
            className="staff-input type-body"
            type="email"
            name="email"
            autoComplete="username"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="staff-field">
          <label className="type-label" htmlFor={passwordId}>Password</label>
          <input
            id={passwordId}
            className="staff-input type-body"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <p className="type-caption staff-entry__error" role="alert">{message ?? ''}</p>

        <button className="staff-cta" type="submit" disabled={busy}>
          <span className="type-control">{busy ? 'Checking access' : 'Sign in'}</span>
          <Pictogram name="clinician" size={20} />
        </button>

        <p className="type-caption staff-entry__note">
          Accounts are provisioned by your facility administrator. This workspace shows prepared
          routing handoffs for your facility only.
        </p>
        <p className="type-caption staff-entry__boundary">{CLINICAL_BOUNDARY}</p>
      </form>
    </main>
  );
}
