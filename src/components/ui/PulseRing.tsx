import type { CSSProperties } from 'react';

export interface PulseRingProps {
  color?: 'cyan' | 'indigo' | 'purple' | 'alert' | 'warning';
  size?: number;
}

type RingColor = NonNullable<PulseRingProps['color']>;

const colorMap: Record<RingColor, string> = {
  cyan:    'var(--cyan-neon)',
  indigo:  'var(--indigo)',
  purple:  'var(--purple)',
  alert:   'var(--alert)',
  warning: 'var(--warning)',
};

export function PulseRing({ color = 'cyan', size = 80 }: PulseRingProps) {
  const c = colorMap[color];

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const ringStyle = (delaySeconds: number): CSSProperties => ({
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: `1px solid ${c}`,
    animation: `pulseRing 2s ease-out ${delaySeconds}s infinite`,
    willChange: 'transform',
  });

  return (
    <div style={containerStyle}>
      <div style={ringStyle(0)} />
      <div style={ringStyle(0.6)} />
      <div style={ringStyle(1.2)} />
    </div>
  );
}
