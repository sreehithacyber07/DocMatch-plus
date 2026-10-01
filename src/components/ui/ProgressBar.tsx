import type { CSSProperties } from 'react';

export interface ProgressBarProps {
  value: number;
  color?: 'cyan' | 'indigo' | 'purple' | 'success' | 'alert';
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

type BarColor = NonNullable<ProgressBarProps['color']>;

const gradientMap: Record<BarColor, string> = {
  cyan:    'linear-gradient(90deg, var(--cyan), var(--cyan-neon))',
  indigo:  'linear-gradient(90deg, var(--indigo), var(--indigo-soft))',
  purple:  'linear-gradient(90deg, var(--purple), var(--indigo-soft))',
  success: 'linear-gradient(90deg, var(--success), var(--cyan))',
  alert:   'linear-gradient(90deg, var(--alert), var(--alert-end))',
};

const glowMap: Record<BarColor, string> = {
  cyan:    'var(--cyan-neon)',
  indigo:  'var(--indigo-soft)',
  purple:  'var(--purple)',
  success: 'var(--success)',
  alert:   'var(--alert)',
};

const heightMap: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: '2px',
  md: '4px',
  lg: '6px',
};

export function ProgressBar({
  value,
  color = 'cyan',
  animated = true,
  size = 'md',
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const showDot = clampedValue > 2;
  const trackHeight = heightMap[size];

  const wrapperStyle: CSSProperties = {
    width: '100%',
    position: 'relative',
  };

  const trackStyle: CSSProperties = {
    width: '100%',
    height: trackHeight,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  };

  const fillStyle: CSSProperties = {
    height: '100%',
    width: `${clampedValue}%`,
    background: gradientMap[color],
    borderRadius: '2px',
    transition: animated ? 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
  };

  const dotStyle: CSSProperties = {
    position: 'absolute',
    left: `${clampedValue}%`,
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: glowMap[color],
    boxShadow: `0 0 6px 2px ${glowMap[color]}`,
    animation: animated ? 'progressGlow 1.5s ease-in-out infinite' : 'none',
    transition: animated ? 'left 0.6s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
  };

  return (
    <div style={wrapperStyle}>
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>
      {showDot && <div style={dotStyle} />}
    </div>
  );
}
