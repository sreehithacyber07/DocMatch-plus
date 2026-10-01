import type { CSSProperties } from 'react';

export interface ScanLineProps {
  color?: 'cyan' | 'indigo' | 'purple' | 'alert';
}

type ScanColor = NonNullable<ScanLineProps['color']>;

const colorMap: Record<ScanColor, string> = {
  cyan:   'var(--cyan-neon)',
  indigo: 'var(--indigo-soft)',
  purple: 'var(--purple)',
  alert:  'var(--alert)',
};

export function ScanLine({ color = 'cyan' }: ScanLineProps) {
  const c = colorMap[color];

  const containerStyle: CSSProperties = {
    width: '100%',
    height: '2px',
    overflow: 'hidden',
    position: 'relative',
  };

  const lineStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: `linear-gradient(90deg, transparent 0%, ${c} 50%, transparent 100%)`,
    boxShadow: `0 0 8px 1px ${c}`,
    animation: 'scanLine 3s linear infinite',
  };

  return (
    <div style={containerStyle}>
      <div style={lineStyle} />
    </div>
  );
}
