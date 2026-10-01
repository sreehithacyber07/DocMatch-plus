export type QuestionType = 'yes_no' | 'scale' | 'mcq' | 'text';

export type QuestionCategory =
  | 'pain'
  | 'duration'
  | 'severity'
  | 'nature'
  | 'history'
  | 'lifestyle'
  | 'associated'
  | 'emergency';

export interface DecisionNode {
  id: string;
  question: string;
  questionType: 'yes_no' | 'scale' | 'mcq' | 'single_select';
  options?: { label: string; value: string; nextNodeId?: string }[];
  category: QuestionCategory;
  severityWeight: number;           // 1–10
  redFlagTriggers?: string[];       // Phase 4 watches these answer values
  // optional dynamic routing — if absent, options[].nextNodeId is used
  getNextNode?: (
    answers: Record<string, string>,
    regions: string[]
  ) => string | null;
}

export interface SpecialistRule {
  specialist: string;
  keywords: string[];               // answer values or question ids
  regions: string[];                // body region ids
  weight: number;                   // score multiplier
}

export interface PatientProfile {
  age: number | null;
  gender: string | null;
  height: number | null;
  weight: number | null;
  mobility: 'full' | 'limited' | 'wheelchair';
  language: string;
}

export interface BodyRegion {
  id: string;
  name: string;
  label: string;
  position: { x: number; y: number; z: number };
  organs: string[];
  symptoms: string[];
  color: string;
  systemType: string;
}

export interface Symptom {
  id: string;
  name: string;
  regionId: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: { label: string; value: string }[];
}

export interface RoutingResult {
  confidence: number;
  recommendedSpecialist: string;
  alternatives: string[];
}

// ── Red-flag detection types ──────────────────────────────────────────────────

export type RedFlagSeverity = 'critical' | 'urgent' | 'warning';

export type RedFlagOverrideAction =
  | 'emergency_immediate'
  | 'urgent_fast_track'
  | 'doctor_alert';

export interface RedFlagContext {
  answers: Record<string, string>;
  regions: string[];
  patient: PatientProfile;
}

export interface RedFlagRule {
  id: string;
  name: string;
  severity: RedFlagSeverity;
  description: string;           // patient-facing explanation
  immediateAction: string;       // what to do RIGHT NOW
  overrideAction: RedFlagOverrideAction;
  disableComfort: boolean;
  /** Pure predicate — same inputs → same output, no side effects. */
  check: (context: RedFlagContext) => boolean;
}

export interface RedFlagResult {
  triggered: RedFlagRule[];               // all fired rules, severity-sorted
  highestSeverity: RedFlagSeverity | null;
  overrideAction: RedFlagOverrideAction | null;
  shouldOverride: boolean;                // true if any critical or urgent
  detectedAt: number;                     // Date.now() at evaluation
}

// Persisted / historical record stored in Zustand state.redFlags[].
// Does NOT include the `check` function (not serialisable).
export interface RedFlag {
  id: string;
  name: string;
  severity: RedFlagSeverity;
  immediateAction: string;
  detectedAt: number;
}

export interface ComfortExercise {
  id: string;
  type: 'breathing' | 'hydration' | 'posture' | 'movement';
  label: string;
}
