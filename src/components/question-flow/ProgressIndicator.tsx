import { PulseRing, Caption, ProgressBar } from '@components/ui';

export interface ProgressIndicatorProps {
  currentIndex: number;
  total: number;
}

export function ProgressIndicator({ currentIndex, total }: ProgressIndicatorProps) {
  const pct = total > 0 ? Math.round(((currentIndex) / total) * 100) : 0;

  return (
    <div style={{ width: '100%', maxWidth: 560 }}>
      {/* Step dots with connecting line */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        {/* Background connecting line */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)',
          }}
        />
        {/* Filled portion of connecting line */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            height: 2,
            transform: 'translateY(-50%)',
            background: 'var(--success)',
            width: `${pct}%`,
            transition: 'width 0.4s ease',
          }}
        />

        {/* Dots */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {Array.from({ length: total }, (_, i) => {
            const isCompleted = i < currentIndex;
            const isActive = i === currentIndex;
            return (
              <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isActive && (
                  <div style={{ position: 'absolute', pointerEvents: 'none' }}>
                    <PulseRing color="indigo" size={16} />
                  </div>
                )}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isCompleted
                      ? 'var(--success)'
                      : isActive
                      ? 'var(--indigo)'
                      : 'rgba(255,255,255,0.2)',
                    transition: 'background 0.3s ease',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Step label */}
      <div style={{ marginBottom: 8, textAlign: 'center' }}>
        <Caption>Step {currentIndex + 1} of {total}</Caption>
      </div>

      {/* Progress bar */}
      <ProgressBar value={pct} color="cyan" size="sm" />
    </div>
  );
}
