import { motion, useReducedMotion } from 'framer-motion';
import { Pictogram } from '../../components/pictograms';
import type { BodyRegionId } from '../../body/index.ts';
import { voiceOf, type PatientContext } from '../intake/patient-context.ts';
import { byVoice } from '../intake/question-voice.ts';
import { fadeLift } from '../../styles/motion-variants.ts';
import { FACE_REGION_BY_ID, type FaceRegionId } from './faceHitMap.ts';
import {
  concernOptionsFor,
  createRegionAssessmentContext,
  type RegionAssessmentContext,
} from './clinical-coverage.ts';

interface RegionConcernEntryProps {
  regionId: BodyRegionId;
  regionLabel: string;
  faceSubregionId: FaceRegionId | null;
  patient: PatientContext;
  onBack: () => void;
  onContinue: (context: RegionAssessmentContext) => void;
}

export function RegionConcernEntry({
  regionId,
  regionLabel,
  faceSubregionId,
  patient,
  onBack,
  onContinue,
}: RegionConcernEntryProps) {
  const reduced = Boolean(useReducedMotion());
  const options = concernOptionsFor(regionId, faceSubregionId, {
    age: patient.derivedAge,
    sexForAssessment: patient.sexForAssessment,
  });
  const pediatric = patient.derivedAge < 18;
  const voice = voiceOf(patient);
  const location = faceSubregionId ? FACE_REGION_BY_ID[faceSubregionId].label : regionLabel;

  return (
    <main className="concern-entry" aria-labelledby="concern-entry-title">
      <motion.div className="concern-entry__heading" {...fadeLift(reduced, 0)}>
        <button className="concern-entry__back" type="button" onClick={onBack}>
          <Pictogram name="back" size={20} /> Back to body map
        </button>
        <p className="type-label">
          {pediatric ? 'Pediatric symptom intake' : 'Symptom intake'} / {location}
        </p>
        <h1 id="concern-entry-title">
          {byVoice(voice, 'What are you experiencing in this area?', 'What is your child experiencing in this area?')}
        </h1>
        <p className="type-body">
          Choose the closest description. The location records where the concern is; it does not choose a specialty.
        </p>
      </motion.div>

      <motion.div className="concern-entry__options" role="group" aria-label="Concern type" {...fadeLift(reduced, 0.06)}>
        {options.map((option) => (
          <button
            className="concern-entry__option"
            type="button"
            key={option.id}
            onClick={() => onContinue(createRegionAssessmentContext({
              regionId,
              regionLabel,
              faceSubregionId,
              concern: option,
              patient,
            }))}
          >
            <span className="concern-entry__option-mark" aria-hidden="true">
              <Pictogram name="question" size={20} />
            </span>
            <span>
              <strong className="type-control">{option.label}</strong>
              <span className="type-caption">{option.description}</span>
            </span>
            <Pictogram name="routing" size={20} aria-hidden="true" />
          </button>
        ))}
      </motion.div>

      <motion.aside className="concern-entry__note" {...fadeLift(reduced, 0.12)}>
        <Pictogram name="priority" size={20} />
        <p className="type-body-small">
          Safety checks run before a care direction is shown. This prototype guides routing and does not diagnose.
        </p>
      </motion.aside>
    </main>
  );
}
