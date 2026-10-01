import { create } from 'zustand';
import type { RedFlag, RedFlagResult, RoutingResult } from '@/types/index';
import { toPersistedRedFlag } from '@utils/redFlagEngine';

export type Phase = 'welcome' | 'body-scan' | 'questions' | 'comfort' | 'summary' | 'emergency';

interface PatientSlice {
  age: number | null;
  gender: string | null;
  height: number | null;
  weight: number | null;
  mobility: 'full' | 'limited' | 'wheelchair';
  language: string;
}

interface SymptomsSlice {
  selectedBodyRegions: string[];
  symptoms: string[];
  severity: number | null;
  duration: string | null;
  answers: Record<string, string>;
}

interface RoutingSlice {
  confidence: number;
  recommendedSpecialist: string;
  alternatives: string[];
  redFlags: RedFlag[];
}

interface UISlice {
  currentPhase: Phase;
  isLoading: boolean;
  showEmergency: boolean;
  showComfort: boolean;
  urgentWarnings: RedFlag[];
  /** Pipe-joined rule IDs of the last acknowledged warning set (for banner dismissal). */
  acknowledgedWarningSet: string;
}

interface AppActions {
  selectRegion:         (id: string) => void;
  deselectRegion:       (id: string) => void;
  setAnswer:            (qId: string, val: string) => void;
  setPhase:             (p: Phase) => void;
  setRouting:           (result: RoutingResult) => void;
  triggerEmergency:     (flags: RedFlag[]) => void;
  /** Persists triggered red-flag rules to audit trail without triggering the UI. */
  recordRedFlags:       (result: RedFlagResult) => void;
  /** Replaces current warning-level flags shown in the banner. */
  setUrgentWarnings:    (flags: RedFlag[]) => void;
  /** Marks the current urgent-warning set as acknowledged (dismisses banner). */
  acknowledgeWarnings:  () => void;
  /** Staff-override: clears the emergency, returns to questionnaire. */
  clearEmergency:       () => void;
  reset:                () => void;
}

export type AppState = PatientSlice & SymptomsSlice & RoutingSlice & UISlice & AppActions;

// ── Selector helpers ──────────────────────────────────────────────────────────
export const selectHasCriticalFlag = (s: AppState): boolean =>
  s.redFlags.some((f) => f.severity === 'critical');

/** Read-only audit log snapshot — suitable for export / logging to a backend. */
export const exportAuditLog = (s: AppState) =>
  s.redFlags.map((f) => ({
    ruleId:      f.id,
    name:        f.name,
    severity:    f.severity,
    detectedAt:  f.detectedAt,
  }));

// ─────────────────────────────────────────────────────────────────────────────

const initialState: Omit<AppState, keyof AppActions> = {
  age: null,
  gender: null,
  height: null,
  weight: null,
  mobility: 'full',
  language: 'en',
  selectedBodyRegions: [],
  symptoms: [],
  severity: null,
  duration: null,
  answers: {},
  confidence: 0,
  recommendedSpecialist: '',
  alternatives: [],
  redFlags: [],
  currentPhase: 'welcome',
  isLoading: false,
  showEmergency: false,
  showComfort: false,
  urgentWarnings: [],
  acknowledgedWarningSet: '',
};

const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  selectRegion: (id) =>
    set((state) => ({
      selectedBodyRegions: state.selectedBodyRegions.includes(id)
        ? state.selectedBodyRegions
        : [...state.selectedBodyRegions, id],
    })),

  deselectRegion: (id) =>
    set((state) => ({
      selectedBodyRegions: state.selectedBodyRegions.filter((r) => r !== id),
    })),

  setAnswer: (qId, val) =>
    set((state) => ({
      answers: { ...state.answers, [qId]: val },
    })),

  setPhase: (p) => set({ currentPhase: p }),

  setRouting: (result) =>
    set({
      confidence:              result.confidence,
      recommendedSpecialist:   result.recommendedSpecialist,
      alternatives:            result.alternatives,
    }),

  triggerEmergency: (flags) =>
    set({
      redFlags:      flags,
      showComfort:   false,
      currentPhase:  'emergency',
      showEmergency: true,
    }),

  recordRedFlags: (result) =>
    set((state) => ({
      redFlags: [
        ...state.redFlags,
        ...result.triggered.map((rule) =>
          toPersistedRedFlag(rule, result.detectedAt)
        ),
      ],
    })),

  setUrgentWarnings: (flags) => set({ urgentWarnings: flags }),

  acknowledgeWarnings: () =>
    set((state) => ({
      acknowledgedWarningSet: state.urgentWarnings.map((f) => f.id).join('|'),
    })),

  clearEmergency: () =>
    set({
      showEmergency: false,
      currentPhase:  'questions',
      // Preserve redFlags — they are the audit trail.
    }),

  reset: () => {
    // Also reset lastTriggeredKey in the monitor via a workaround:
    // clearing answers changes context → monitor resets its own ref.
    void get; // suppress unused warning
    set({ ...initialState });
  },
}));

export default useAppStore;
