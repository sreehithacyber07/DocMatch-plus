
export interface TermsSection {
  id: string;
  title: string;
  body: readonly string[];
}

export const TERMS_TITLE = 'Terms & Conditions';

export const TERMS_VALIDATION_MESSAGE = 'Please review and accept the Terms & Conditions before beginning.';

/** The short summary shown in the hover and focus preview. */
export const TERMS_PREVIEW: readonly string[] = [
  'DocMatch+ suggests a specialty direction from your answers. It is not a diagnosis.',
  'If you feel very unwell, tell a member of staff now. If no staff member is near, call 112.',
  'Clinical decisions remain with the care team.',
];

export const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    id: 'purpose',
    title: 'Purpose of DocMatch+',
    body: [
      'DocMatch+ organizes the symptoms and other information you choose to provide during this assessment. It may use that information to prepare a suggested specialty direction and a structured summary for review by the care team.',
    ],
  },
  {
    id: 'not-diagnosis',
    title: 'Not a diagnosis',
    body: [
      'DocMatch+ does not diagnose medical conditions, confirm or rule out a condition, prescribe medication, determine treatment, or replace an assessment by a qualified healthcare professional. Final clinical decisions remain with the care team.',
    ],
  },
  {
    id: 'emergency',
    title: 'Emergency situations',
    body: [
      'DocMatch+ is not an emergency response service and does not alert anyone. If you feel seriously unwell, have severe or rapidly worsening symptoms, or believe you may be experiencing a medical emergency, alert hospital staff immediately. If no staff member is available and emergency assistance is required, call 112.',
    ],
  },
  {
    id: 'information-provided',
    title: 'Information you provide',
    body: [
      'The usefulness of the assessment depends on the information entered. Answer questions as accurately as you reasonably can. DocMatch+ cannot consider symptoms, history, or other medical information that has not been provided.',
    ],
  },
  {
    id: 'safety-checks',
    title: 'Safety checks',
    body: [
      'During the assessment, certain responses may trigger safety-oriented checks or prompts. These checks are intended to help surface potentially important information and should not be interpreted as a diagnosis or guarantee that every urgent condition will be identified.',
    ],
  },
  {
    id: 'session-privacy',
    title: 'Session and privacy',
    body: [
      'How responses are handled depends on the deployment. The session notice below states whether responses stay in page memory or are sent to the DocMatch+ backend. Starting a new patient clears this screen\'s current session.',
    ],
  },
  {
    id: 'clinical-handoff',
    title: 'Clinical handoff',
    body: [
      'At the end of the assessment, DocMatch+ may organize the information you provided into a structured clinical summary or specialty direction. This information is intended to support the clinical workflow and must be reviewed by the care team.',
    ],
  },
  {
    id: 'automated-processing',
    title: 'Automated processing',
    body: [
      'Some parts of DocMatch+ may use rule-based or automated processing to organize responses, identify safety-related answers, or suggest a specialty direction. Automated output should not be treated as medical certainty.',
    ],
  },
  {
    id: 'limitations',
    title: 'Limitations',
    body: [
      'A digital assessment cannot capture every possible medical condition, context, or circumstance. Results may be incomplete or unsuitable when information is missing, unclear, unusual, or outside the supported scope of the system.',
    ],
  },
  {
    id: 'patient-choice',
    title: 'Your choice',
    body: [
      'You may stop the digital assessment before continuing. If you are unsure about a question or prefer not to continue through the kiosk, ask a member of the care team for assistance.',
    ],
  },
];
