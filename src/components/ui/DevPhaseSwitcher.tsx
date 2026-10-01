import useAppStore, { type Phase } from '@stores/useAppStore';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'welcome',   label: 'Welcome' },
  { id: 'body-scan', label: 'Body Scan' },
  { id: 'questions', label: 'Questions' },
  { id: 'comfort',   label: 'Comfort' },
  { id: 'summary',   label: 'Summary' },
  { id: 'emergency', label: 'Emergency' },
];

const btnBase = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'monospace',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'right' as const,
  transition: 'all 0.15s ease',
  backdropFilter: 'blur(8px)',
};

export function DevPhaseSwitcher() {
  if (!import.meta.env.DEV) return null;

  const currentPhase = useAppStore((s) => s.currentPhase);
  const setPhase     = useAppStore((s) => s.setPhase);

  return (
    <div
      style={{
        position: 'fixed',
        top: 16, right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Phase labels */}
      <div style={{
        fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'rgba(103,232,249,0.5)', fontFamily: 'monospace',
        marginBottom: 2, textAlign: 'right',
      }}>
        dev · phases
      </div>

      {PHASES.map(({ id, label }) => {
        const active = currentPhase === id;
        return (
          <button
            key={id}
            onClick={() => {
              // Dev seed: ensure chest region is populated when entering Questions
              // so the question engine has something to work with. (Phase 9 removes this.)
              if (id === 'questions') {
                const { selectedBodyRegions, selectRegion } = useAppStore.getState();
                if (selectedBodyRegions.length === 0) selectRegion('chest');
              }
              setPhase(id);
            }}
            style={{
              ...btnBase,
              border: `1px solid ${active ? '#22D3EE' : 'rgba(103,232,249,0.2)'}`,
              background: active ? 'rgba(34,211,238,0.18)' : 'rgba(10,14,39,0.7)',
              color: active ? '#22D3EE' : 'rgba(103,232,249,0.55)',
            }}
          >
            {label}
          </button>
        );
      })}

      {/* Test scenario buttons (Phase 9 removes) */}
      <div style={{
        fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'rgba(236,72,153,0.5)', fontFamily: 'monospace',
        marginTop: 6, marginBottom: 2, textAlign: 'right',
      }}>
        dev · test flags
      </div>

      {/* Test: Critical — CRITICAL_CHEST_PAIN */}
      <button
        onClick={() => {
          const s = useAppStore.getState();
          s.selectRegion('chest');
          s.setAnswer('breathless', 'yes');
        }}
        style={{
          ...btnBase,
          border: '1px solid rgba(236,72,153,0.4)',
          background: 'rgba(236,72,153,0.12)',
          color: 'rgba(236,72,153,0.8)',
        }}
        title="Triggers CRITICAL_CHEST_PAIN"
      >
        Test: Critical
      </button>

      {/* Test: Urgent — URGENT_SEVERE_PAIN */}
      <button
        onClick={() => {
          const s = useAppStore.getState();
          s.setAnswer('severity', '10');
          s.setAnswer('onset', 'sudden');
        }}
        style={{
          ...btnBase,
          border: '1px solid rgba(245,158,11,0.4)',
          background: 'rgba(245,158,11,0.12)',
          color: 'rgba(245,158,11,0.8)',
        }}
        title="Triggers URGENT_SEVERE_PAIN"
      >
        Test: Urgent
      </button>

      {/* Test: Warning — WARNING_PERSISTENT_WORSENING */}
      <button
        onClick={() => {
          const s = useAppStore.getState();
          s.setAnswer('duration', 'months');
          s.setAnswer('worsening', 'yes');
        }}
        style={{
          ...btnBase,
          border: '1px solid rgba(99,102,241,0.4)',
          background: 'rgba(99,102,241,0.12)',
          color: 'rgba(99,102,241,0.8)',
        }}
        title="Triggers WARNING_PERSISTENT_WORSENING"
      >
        Test: Warning
      </button>

      {/* Reset — clears all state then sets phase to questions (dev restart) */}
      <button
        onClick={() => {
          const s = useAppStore.getState();
          s.reset();
          s.clearEmergency();
        }}
        style={{
          ...btnBase,
          border: '1px solid rgba(103,232,249,0.2)',
          background: 'rgba(10,14,39,0.7)',
          color: 'rgba(103,232,249,0.4)',
          marginTop: 2,
        }}
      >
        Reset
      </button>
    </div>
  );
}
