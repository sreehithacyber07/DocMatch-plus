import { Button } from '../../components/primitives/Button.tsx';
import { CheckboxChoiceGroup, RadioChoiceGroup } from '../../components/primitives/ChoiceGroup.tsx';
import { DateField } from '../../components/primitives/DateField.tsx';
import { OptionalPhoneField } from './OptionalPhoneField.tsx';
import type { PhoneValue } from './phone-country.ts';
import { ConditionalTextField, TextField } from '../../components/primitives/Field.tsx';
import { MultiSelectCombobox } from '../../components/primitives/MultiSelectCombobox.tsx';
import {
  ACCESSIBILITY_OPTIONS,
  ALLERGY_OPTIONS,
  ALLERGY_OTHER,
  ALLERGY_STATUS_OPTIONS,
  CONDITION_NONE_KNOWN,
  CONDITION_OPTIONS,
  CONDITION_OTHER,
  EARLIEST_BIRTH_YEAR,
  EPISODE_OPTIONS,
  EXPLANATION_OPTIONS,
  MEDICATION_ENTRY_LIMIT,
  MEDICATION_STATUS_OPTIONS,
  SEX_OPTIONS,
  SURGERY_OPTIONS,
  TEXT_LIMITS,
  episodeWasReported,
  keepOtherText,
  localToday,
  toggleExclusive,
  toggleValue,
  validateDateOfBirth,
  type AccessibilityNeed,
  type IntakeStep,
  type PatientContextDraft,
  type StepErrors,
} from './patient-context.ts';
import { byVoice, type QuestionVoice } from './question-voice.ts';
import './about-you.css';

export interface PatientContextStepProps {
  step: IntakeStep;
  draft: PatientContextDraft;
  /** The locked questionnaire voice. About you is always addressed to the person holding the device. */
  voice: QuestionVoice;
  /** Only the errors the patient should see now. */
  errors: StepErrors;
  onChange: (update: Partial<PatientContextDraft>) => void;
  /** Marks an answer as visited once focus leaves it. */
  onLeave: (field: string) => void;
  /** The optional contact, held by the intake in page memory; never part of the patient context. */
  phone: PhoneValue;
  onPhoneChange: (phone: PhoneValue) => void;
}

/*
  Free-text answers turn off autocomplete and spell checking. Autocomplete can
  keep typed text in the browser's form history, and some browsers send text to
  a spelling service; either would take patient text beyond this page.
*/
const PRIVATE_TEXT = { autoComplete: 'off', spellCheck: false } as const;

const EARLIEST_BIRTH = { year: EARLIEST_BIRTH_YEAR, month: 1, day: 1 };

/** One of the three context steps. Field ids are stable so validation can focus them. */
export function PatientContextStep({ step, draft, voice, errors, onChange, onLeave, phone, onPhoneChange }: PatientContextStepProps) {
  if (step === 'basics') {
    const today = localToday();
    const dob = validateDateOfBirth(draft.dateOfBirthParts, today);
    const nameComplete = draft.assessmentName.trim().length > 0;
    const ageComplete = dob.ok === true;
    const sexComplete = draft.sexForAssessment !== null;

    return (
      <div className="about-you">
        <div className="about-you__panel">
          {/* Row 1: Name (optional) */}
          <div className="about-you__row">
            <div className="about-you__row-label">
              <span className="about-you__row-check" data-complete={nameComplete ? true : undefined} />
              Name
              <span className="about-you__row-label-tag">Optional</span>
            </div>
            <div className="about-you__row-control">
              <input
                id="context-name"
                className="about-you__name-input"
                type="text"
                placeholder="Your name"
                maxLength={TEXT_LIMITS.name}
                value={draft.assessmentName}
                onChange={(e) => onChange({ assessmentName: e.target.value })}
                aria-label="Name for this assessment"
                {...PRIVATE_TEXT}
              />
            </div>
          </div>

          {/* Row 2: Age / Date of birth (required) */}
          <div className="about-you__row about-you__age-row">
            <div className="about-you__row-label">
              <span className="about-you__row-check" data-complete={ageComplete ? true : undefined} />
              Age
              <span className="about-you__row-label-tag">{ageComplete ? `${dob.age} years` : 'Required'}</span>
            </div>
            <div className="about-you__row-control">
              <div className="about-you__age-editor">
                <DateField
                  id="context-dob"
                  legend="Date of birth"
                  value={draft.dateOfBirthParts}
                  date={draft.dateOfBirth}
                  onValueChange={(parts) => {
                    const result = validateDateOfBirth(parts, today);
                    onChange({ dateOfBirthParts: parts, dateOfBirth: result.ok ? result.iso : draft.dateOfBirth });
                  }}
                  error={errors.dateOfBirth}
                  invalidPart={dob.ok === false ? dob.field : undefined}
                  meta={null}
                  min={EARLIEST_BIRTH}
                  max={today}
                  onLeave={() => onLeave('dateOfBirth')}
                />
              </div>
            </div>
          </div>

          {/* Row 3: Sex for this assessment (required) */}
          <div className="about-you__row">
            <div className="about-you__row-label">
              <span className="about-you__row-check" data-complete={sexComplete ? true : undefined} />
              Sex for this assessment
              <span className="about-you__row-label-tag">Required</span>
            </div>
            <div className="about-you__row-control">
              <fieldset
                className="about-you__sex-options"
                id="context-sex"
                tabIndex={-1}
                aria-label="Sex for this assessment"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave('sexForAssessment');
                }}
              >
                {SEX_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="about-you__sex-option"
                    data-selected={draft.sexForAssessment === option.value ? true : undefined}
                  >
                    <input
                      type="radio"
                      name="context-sex"
                      value={option.value}
                      checked={draft.sexForAssessment === option.value}
                      onChange={() => onChange({ sexForAssessment: option.value })}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            </div>
            {errors.sexForAssessment ? (
              <div className="about-you__row-error">
                <p className="dm-field__error" id="context-sex-error" role="alert">
                  <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M8 4.6v4.2M8 10.9v.2" />
                  </svg>
                  <span>{errors.sexForAssessment}</span>
                </p>
              </div>
            ) : null}
          </div>

          {/* Row 4: Contact number (optional) */}
          <div className="about-you__row">
            <div className="about-you__row-label">
              Contact
              <span className="about-you__row-label-tag">Optional</span>
            </div>
            <div className="about-you__row-control about-you__phone-inline">
              <OptionalPhoneField value={phone} onChange={onPhoneChange} />
            </div>
          </div>
        </div>

        <p className="about-you__privacy">Used only for this assessment.</p>
      </div>
    );
  }

  if (step === 'history') {
    const episode = episodeWasReported(draft.previousSimilarEpisode);
    return (
      <div className="context-step context-step--columns">
        <div className="context-step__column">
          <CheckboxChoiceGroup<AccessibilityNeed>
            id="context-access"
            legend={byVoice(voice, 'Do you have any accessibility needs we should account for?', 'Does your child have any accessibility needs we should account for?')}
            name="context-access"
            options={ACCESSIBILITY_OPTIONS}
            values={draft.accessibilityNeeds}
            columns={2}
            onToggle={(value) => {
              const accessibilityNeeds = toggleExclusive(draft.accessibilityNeeds, value, 'none');
              onChange({ accessibilityNeeds, accessibilityOther: keepOtherText(accessibilityNeeds, draft.accessibilityOther) });
            }}
            error={errors.accessibilityNeeds}
            onLeave={() => onLeave('accessibilityNeeds')}
          />
          <ConditionalTextField
            show={draft.accessibilityNeeds.includes('other')}
            id="context-access-other"
            label="Describe the accessibility need"
            optional
            maxLength={TEXT_LIMITS.short}
            value={draft.accessibilityOther}
            onValueChange={(accessibilityOther) => onChange({ accessibilityOther })}
            {...PRIVATE_TEXT}
          />
        </div>

        <div className="context-step__column">
          <MultiSelectCombobox
            id="context-conditions"
            label="Existing medical conditions"
            hint="Choose any that apply, or None known. The list is not complete; choose Other for anything missing."
            options={CONDITION_OPTIONS}
            values={draft.existingConditions}
            emptyMessage="No match. Choose Other to describe it."
            error={errors.existingConditions}
            onToggle={(value) => {
              const existingConditions = toggleExclusive(draft.existingConditions, value, CONDITION_NONE_KNOWN);
              onChange({ existingConditions, conditionOther: keepOtherText(existingConditions, draft.conditionOther, CONDITION_OTHER) });
            }}
            onLeave={() => onLeave('existingConditions')}
            closeOnSelect={(value) => value === CONDITION_NONE_KNOWN}
          />
          <ConditionalTextField
            show={draft.existingConditions.includes(CONDITION_OTHER)}
            id="context-conditions-other"
            label="Other condition"
            optional
            maxLength={TEXT_LIMITS.short}
            value={draft.conditionOther}
            onValueChange={(conditionOther) => onChange({ conditionOther })}
            {...PRIVATE_TEXT}
          />
          <RadioChoiceGroup
            id="context-episode"
            legend={byVoice(voice, 'Have you had a similar episode before?', 'Has your child had a similar episode before?')}
            name="context-episode"
            options={EPISODE_OPTIONS}
            value={draft.previousSimilarEpisode}
            columns={2}
            onValueChange={(previousSimilarEpisode) =>
              onChange({
                previousSimilarEpisode,
                ...(episodeWasReported(previousSimilarEpisode)
                  ? {}
                  : { previousExplanationKnown: null, previousExplanation: '' }),
              })
            }
            error={errors.previousSimilarEpisode}
            onLeave={() => onLeave('previousSimilarEpisode')}
          />
          {episode ? (
            <RadioChoiceGroup
              id="context-explanation"
              legend="Was a diagnosis or explanation previously given?"
              name="context-explanation"
              options={EXPLANATION_OPTIONS}
              value={draft.previousExplanationKnown}
              columns={3}
              onValueChange={(previousExplanationKnown) =>
                onChange({
                  previousExplanationKnown,
                  ...(previousExplanationKnown === 'yes' ? {} : { previousExplanation: '' }),
                })
              }
              error={errors.previousExplanationKnown}
              onLeave={() => onLeave('previousExplanationKnown')}
            />
          ) : null}
          <ConditionalTextField
            show={episode && draft.previousExplanationKnown === 'yes'}
            id="context-explanation-text"
            label="Previous diagnosis or explanation"
            helper="What was said before. It is not treated as the reason for today."
            optional
            maxLength={TEXT_LIMITS.short}
            value={draft.previousExplanation}
            onValueChange={(previousExplanation) => onChange({ previousExplanation })}
            {...PRIVATE_TEXT}
          />
        </div>
      </div>
    );
  }

  const medicationRows = draft.medications.length > 0 ? draft.medications : [''];
  return (
    <div className="context-step context-step--columns context-step--background">
      <div className="context-step__column">
        <RadioChoiceGroup
          id="context-allergy"
          legend={byVoice(voice, 'Do you have any allergies?', 'Does your child have any allergies?')}
          name="context-allergy"
          options={ALLERGY_STATUS_OPTIONS}
          value={draft.allergyStatus}
          columns={1}
          onValueChange={(allergyStatus) =>
            onChange({ allergyStatus, ...(allergyStatus === 'known' ? {} : { allergies: [], allergyOther: '' }) })
          }
          error={errors.allergyStatus}
          onLeave={() => onLeave('allergyStatus')}
        />
        <div className="context-step__column-extras">
          {draft.allergyStatus === 'known' ? (
            <CheckboxChoiceGroup
              id="context-allergy-types"
              legend="Allergy types"
              name="context-allergy-types"
              options={ALLERGY_OPTIONS}
              values={draft.allergies}
              columns={2}
              onToggle={(value) => {
                const allergies = toggleValue(draft.allergies, value);
                onChange({ allergies, allergyOther: keepOtherText(allergies, draft.allergyOther, ALLERGY_OTHER) });
              }}
              error={errors.allergies}
              onLeave={() => onLeave('allergies')}
            />
          ) : null}
          <ConditionalTextField
            show={draft.allergyStatus === 'known' && draft.allergies.includes(ALLERGY_OTHER)}
            id="context-allergy-other"
            label="Other allergy"
            optional
            maxLength={TEXT_LIMITS.short}
            value={draft.allergyOther}
            onValueChange={(allergyOther) => onChange({ allergyOther })}
            {...PRIVATE_TEXT}
          />
        </div>
      </div>

      <div className="context-step__column">
        <RadioChoiceGroup
          id="context-medication"
          legend={byVoice(voice, 'Do you take any medications?', 'Does your child take any medications?')}
          name="context-medication"
          options={MEDICATION_STATUS_OPTIONS}
          value={draft.medicationStatus}
          columns={1}
          onValueChange={(medicationStatus) =>
            onChange({ medicationStatus, ...(medicationStatus === 'known' ? {} : { medications: [''] }) })
          }
          error={errors.medicationStatus}
          onLeave={() => onLeave('medicationStatus')}
        />
        <div className="context-step__column-extras">
          {draft.medicationStatus === 'known' ? (
            <fieldset
              className="context-medications"
              id="context-medications"
              tabIndex={-1}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave('medications');
              }}
            >
              <legend className="sr-only">Medications</legend>
              <ol className="context-medications__list">
                {medicationRows.map((entry, index) => (
                  <li key={index} className="context-medications__row">
                    <TextField
                      id={`context-medication-${index}`}
                      label={`Medication ${index + 1}`}
                      maxLength={TEXT_LIMITS.short}
                      value={entry}
                      error={index === 0 ? errors.medications : undefined}
                      onValueChange={(value) =>
                        onChange({ medications: medicationRows.map((current, at) => (at === index ? value : current)) })
                      }
                      {...PRIVATE_TEXT}
                    />
                    {medicationRows.length > 1 ? (
                      <Button
                        variant="icon"
                        className="context-medications__remove"
                        aria-label={`Remove medication ${index + 1}`}
                        onClick={() => onChange({ medications: medicationRows.filter((_, at) => at !== index) })}
                      >
                        <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                          <path d="M6 6 14 14M14 6 6 14" />
                        </svg>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
              {medicationRows.length < MEDICATION_ENTRY_LIMIT ? (
                <Button
                  variant="quiet"
                  className="context-medications__add"
                  onClick={() => onChange({ medications: [...medicationRows, ''] })}
                >
                  Add another medication
                </Button>
              ) : null}
            </fieldset>
          ) : null}
        </div>

      </div>

      <div className="context-step__column">
        <RadioChoiceGroup
          id="context-surgery"
          legend={byVoice(voice, 'Have you had a previous surgery or procedure?', 'Has your child had a previous surgery or procedure?')}
          name="context-surgery"
          options={SURGERY_OPTIONS}
          value={draft.surgeryStatus}
          columns={1}
          onValueChange={(surgeryStatus) => onChange({ surgeryStatus, ...(surgeryStatus === 'yes' ? {} : { surgeries: '' }) })}
          error={errors.surgeryStatus}
          onLeave={() => onLeave('surgeryStatus')}
        />
        <div className="context-step__column-extras">
          <ConditionalTextField
            show={draft.surgeryStatus === 'yes'}
            id="context-surgery-text"
            label="Major surgery or procedure"
            optional
            maxLength={TEXT_LIMITS.short}
            value={draft.surgeries}
            onValueChange={(surgeries) => onChange({ surgeries })}
            {...PRIVATE_TEXT}
          />
        </div>
      </div>
    </div>
  );
}
