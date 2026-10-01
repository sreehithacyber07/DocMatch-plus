import type { DecisionNode, SpecialistRule } from '@/types/index';

// ─── Decision nodes ──────────────────────────────────────────────────────────
// 19 nodes covering pain, severity, onset, duration, associated symptoms,
// lifestyle, history, and emergency screening.
// Nodes with getNextNode use dynamic branching; all others use options[].nextNodeId.

export const decisionNodes: DecisionNode[] = [
  // ── 1. Pain character (always first) ──────────────────────────────────────
  {
    id: 'pain_character',
    question: 'How would you best describe your pain or discomfort?',
    questionType: 'mcq',
    options: [
      { label: 'Sharp / stabbing', value: 'sharp',     nextNodeId: 'severity' },
      { label: 'Dull / aching',    value: 'dull',      nextNodeId: 'severity' },
      { label: 'Burning',          value: 'burning',   nextNodeId: 'severity' },
      { label: 'Throbbing',        value: 'throbbing', nextNodeId: 'severity' },
      { label: 'Cramping',         value: 'cramping',  nextNodeId: 'severity' },
      { label: 'Pressure / tight', value: 'pressure',  nextNodeId: 'severity' },
    ],
    category: 'pain',
    severityWeight: 9,
  },

  // ── 2. Severity scale ──────────────────────────────────────────────────────
  {
    id: 'severity',
    question: 'On a scale of 1 to 10, how severe is your pain right now?',
    questionType: 'scale',
    category: 'severity',
    severityWeight: 10,
    // Dynamic: high severity → emergency_screening early; chest region → breathless
    getNextNode: (answers, regions) => {
      const sev = parseInt(answers['severity'] ?? '0', 10);
      if (sev >= 8) return 'emergency_screening';
      if (regions.some(r => ['chest', 'upper_back'].includes(r))) return 'breathless';
      return 'onset';
    },
  },

  // ── 3. Breathlessness (chest / upper-back relevant) ────────────────────────
  {
    id: 'breathless',
    question: 'Are you experiencing any difficulty breathing or shortness of breath?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'emergency_screening' },
      { label: 'No',  value: 'no',  nextNodeId: 'onset' },
    ],
    category: 'associated',
    severityWeight: 8,
    redFlagTriggers: ['yes'],
  },

  // ── 4. Emergency screening ─────────────────────────────────────────────────
  {
    id: 'emergency_screening',
    question: 'Did your pain or symptoms start suddenly and at maximum severity?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'symptom_worsening' },
      { label: 'No',  value: 'no',  nextNodeId: 'onset' },
    ],
    category: 'emergency',
    severityWeight: 10,
    redFlagTriggers: ['yes'],
  },

  // ── 5. Symptom worsening (follows emergency_screening yes) ────────────────
  {
    id: 'symptom_worsening',
    question: 'Are your symptoms rapidly getting worse over the past hour?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'vision_changes' },
      { label: 'No',  value: 'no',  nextNodeId: 'onset' },
    ],
    category: 'emergency',
    severityWeight: 9,
    redFlagTriggers: ['yes'],
  },

  // ── 6. Onset character ────────────────────────────────────────────────────
  {
    id: 'onset',
    question: 'How did your symptoms begin?',
    questionType: 'single_select',
    options: [
      { label: 'Suddenly (within minutes)', value: 'sudden',    nextNodeId: 'duration' },
      { label: 'Gradually (over hours)',    value: 'gradual',   nextNodeId: 'duration' },
      { label: 'After a specific trigger',  value: 'triggered', nextNodeId: 'duration' },
    ],
    category: 'nature',
    severityWeight: 5,
  },

  // ── 7. Duration ───────────────────────────────────────────────────────────
  {
    id: 'duration',
    question: 'How long have you been experiencing these symptoms?',
    questionType: 'single_select',
    options: [
      { label: 'Less than 24 hours', value: 'hours',  nextNodeId: 'aggravating_factors' },
      { label: 'A few days',         value: 'days',   nextNodeId: 'aggravating_factors' },
      { label: 'A few weeks',        value: 'weeks',  nextNodeId: 'aggravating_factors' },
      { label: 'A month or more',    value: 'months', nextNodeId: 'age_flag' },
    ],
    category: 'duration',
    severityWeight: 6,
    // Dynamic: chronic symptoms → gather history context
    getNextNode: (answers) => {
      if (answers['duration'] === 'months') return 'age_flag';
      return 'aggravating_factors';
    },
  },

  // ── 8. Aggravating factors ────────────────────────────────────────────────
  {
    id: 'aggravating_factors',
    question: 'What tends to make your symptoms worse?',
    questionType: 'mcq',
    options: [
      { label: 'Physical movement',     value: 'movement',    nextNodeId: 'fever' },
      { label: 'Eating / drinking',     value: 'food',        nextNodeId: 'fever' },
      { label: 'Stress / anxiety',      value: 'stress',      nextNodeId: 'fever' },
      { label: 'Rest / lying down',     value: 'rest',        nextNodeId: 'fever' },
      { label: 'Heat / cold',           value: 'temperature', nextNodeId: 'fever' },
      { label: 'Nothing in particular', value: 'none',        nextNodeId: 'fever' },
    ],
    category: 'nature',
    severityWeight: 5,
  },

  // ── 9. Fever ──────────────────────────────────────────────────────────────
  {
    id: 'fever',
    question: 'Do you currently have a fever or feel unusually hot?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'nausea' },
      { label: 'No',  value: 'no',  nextNodeId: 'nausea' },
    ],
    category: 'associated',
    severityWeight: 6,
  },

  // ── 10. Nausea ────────────────────────────────────────────────────────────
  {
    id: 'nausea',
    question: 'Are you experiencing nausea or an upset stomach?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'dizziness' },
      { label: 'No',  value: 'no',  nextNodeId: 'dizziness' },
    ],
    category: 'associated',
    severityWeight: 5,
  },

  // ── 11. Dizziness ─────────────────────────────────────────────────────────
  {
    id: 'dizziness',
    question: 'Do you feel dizzy, lightheaded, or unsteady?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'numbness' },
      { label: 'No',  value: 'no',  nextNodeId: 'numbness' },
    ],
    category: 'associated',
    severityWeight: 6,
    redFlagTriggers: ['yes'],
  },

  // ── 12. Numbness / tingling ───────────────────────────────────────────────
  {
    id: 'numbness',
    question: 'Do you have any numbness, tingling, or loss of sensation?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'recent_injury' },
      { label: 'No',  value: 'no',  nextNodeId: 'recent_injury' },
    ],
    category: 'associated',
    severityWeight: 7,
    redFlagTriggers: ['yes'],
  },

  // ── 13. Vision changes ────────────────────────────────────────────────────
  {
    id: 'vision_changes',
    question: 'Have you noticed any sudden changes in your vision (blurring, double, or loss)?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'onset' },
      { label: 'No',  value: 'no',  nextNodeId: 'onset' },
    ],
    category: 'emergency',
    severityWeight: 9,
    redFlagTriggers: ['yes'],
  },

  // ── 14. Vomiting ──────────────────────────────────────────────────────────
  {
    id: 'vomiting',
    question: 'Are you actively vomiting or have you vomited in the past few hours?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: null as unknown as string },
      { label: 'No',  value: 'no',  nextNodeId: null as unknown as string },
    ],
    category: 'associated',
    severityWeight: 6,
  },

  // ── 15. Recent injury ─────────────────────────────────────────────────────
  {
    id: 'recent_injury',
    question: 'Have you had a recent injury, fall, or physical trauma?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'medication' },
      { label: 'No',  value: 'no',  nextNodeId: 'medication' },
    ],
    category: 'history',
    severityWeight: 7,
  },

  // ── 16. Medication ────────────────────────────────────────────────────────
  {
    id: 'medication',
    question: 'Are you currently taking any prescription medication or supplements?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'recent_travel' },
      { label: 'No',  value: 'no',  nextNodeId: 'recent_travel' },
    ],
    category: 'lifestyle',
    severityWeight: 4,
  },

  // ── 17. Recent travel ─────────────────────────────────────────────────────
  {
    id: 'recent_travel',
    question: 'Have you traveled internationally or to a new region in the past 4 weeks?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: null as unknown as string },
      { label: 'No',  value: 'no',  nextNodeId: null as unknown as string },
    ],
    category: 'lifestyle',
    severityWeight: 5,
  },

  // ── 18. Age flag (chronic symptom path) ──────────────────────────────────
  {
    id: 'age_flag',
    question: 'Are you 65 years of age or older?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: 'medication' },
      { label: 'No',  value: 'no',  nextNodeId: 'medication' },
    ],
    category: 'history',
    severityWeight: 7,
  },

  // ── 19. Skin changes (dermatology path) ──────────────────────────────────
  {
    id: 'skin_rash',
    question: 'Do you have a visible rash, unusual skin change, or persistent itching?',
    questionType: 'yes_no',
    options: [
      { label: 'Yes', value: 'yes', nextNodeId: null as unknown as string },
      { label: 'No',  value: 'no',  nextNodeId: null as unknown as string },
    ],
    category: 'pain',
    severityWeight: 10,
  },
];

// ─── Specialist routing rules ─────────────────────────────────────────────────
// Keywords match against answer values OR question ids (see questionEngine.ts).
// Regions match body region ids from bodyRegions.ts.
// Weight 0.8–1.2 (Cardiologist gets 1.2 to reflect high keyword specificity).

export const specialistRules: SpecialistRule[] = [
  {
    specialist: 'Cardiologist',
    keywords: ['pressure', 'throbbing', 'breathless', 'tightness', 'left', 'palpitation'],
    regions:  ['chest', 'left_arm', 'neck'],
    weight:   1.2,
  },
  {
    specialist: 'Pulmonologist',
    keywords: ['breathless', 'cough', 'wheeze', 'breathlessness', 'chest'],
    regions:  ['chest', 'upper_back'],
    weight:   1.1,
  },
  {
    specialist: 'Neurologist',
    keywords: ['numbness', 'vision_changes', 'dizziness', 'tingling', 'sudden', 'weakness'],
    regions:  ['head', 'neck'],
    weight:   1.1,
  },
  {
    specialist: 'Gastroenterologist',
    keywords: ['nausea', 'vomiting', 'food', 'cramping', 'bloating', 'burning'],
    regions:  ['abdomen', 'pelvis'],
    weight:   1.0,
  },
  {
    specialist: 'Orthopedic',
    keywords: ['sharp', 'stabbing', 'movement', 'injury', 'trauma', 'recent_injury'],
    regions:  ['left_arm', 'right_arm', 'left_leg', 'right_leg',
               'left_hand', 'right_hand', 'left_foot', 'right_foot',
               'upper_back', 'lower_back'],
    weight:   1.0,
  },
  {
    specialist: 'Dermatologist',
    keywords: ['skin_rash', 'burning', 'rash', 'itch', 'blister', 'temperature'],
    regions:  ['left_arm', 'right_arm', 'left_hand', 'right_hand'],
    weight:   1.1,
  },
  {
    specialist: 'ENT Specialist',
    keywords: ['dizziness', 'vomiting', 'ear', 'throat', 'sinus', 'hearing'],
    regions:  ['head', 'neck'],
    weight:   0.9,
  },
  {
    specialist: 'Gynecologist',
    keywords: ['cramping', 'pelvis', 'lower', 'menstrual', 'pregnancy'],
    regions:  ['pelvis', 'abdomen', 'lower_back'],
    weight:   1.0,
  },
  {
    specialist: 'Urologist',
    keywords: ['burning', 'pressure', 'frequency', 'lower', 'flank'],
    regions:  ['pelvis', 'lower_back'],
    weight:   0.9,
  },
  {
    specialist: 'Endocrinologist',
    keywords: ['fatigue', 'thirst', 'weight', 'temperature', 'months', 'stress'],
    regions:  ['abdomen'],
    weight:   0.8,
  },
  {
    specialist: 'General Physician',
    keywords: ['fever', 'nausea', 'worsening', 'gradual', 'none', 'medication'],
    regions:  [],
    weight:   0.8,
  },
];
