import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ReactNode, CSSProperties } from 'react';

export interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: 'indigo' | 'cyan' | 'alert' | 'success' | 'warning';
  intensity?: 'normal' | 'high';
  hover?: boolean;
}

type GlowKey = NonNullable<GlassCardProps['glow']>;

const glowConfig: Record<GlowKey, { border: string; shadow: string; shadowHover: string }> = {
  indigo:  { border: 'rgba(99,102,241,0.4)',  shadow: 'rgba(99,102,241,0.12)', shadowHover: 'rgba(99,102,241,0.25)' },
  cyan:    { border: 'rgba(14,165,233,0.4)',   shadow: 'rgba(14,165,233,0.12)', shadowHover: 'rgba(14,165,233,0.25)' },
  alert:   { border: 'rgba(236,72,153,0.4)',   shadow: 'rgba(236,72,153,0.12)', shadowHover: 'rgba(236,72,153,0.25)' },
  success: { border: 'rgba(16,185,129,0.4)',   shadow: 'rgba(16,185,129,0.12)', shadowHover: 'rgba(16,185,129,0.25)' },
  warning: { border: 'rgba(245,158,11,0.4)',   shadow: 'rgba(245,158,11,0.12)', shadowHover: 'rgba(245,158,11,0.25)' },
};

export function GlassCard({
  children,
  className,
  glow,
  intensity = 'normal',
  hover = false,
}: GlassCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const gc = glow ? glowConfig[glow] : null;
  const isActive = hover && isHovered;
  const bgAlpha = intensity === 'high' ? 0.7 : 0.5;

  const shadowParts = [
    '0 8px 32px rgba(0,0,0,0.3)',
    'inset 0 1px 0 rgba(255,255,255,0.05)',
  ];
  if (gc) {
    shadowParts.push(`0 0 20px ${isActive ? gc.shadowHover : gc.shadow}`);
  }

  const baseStyle: CSSProperties = {
    background: `rgba(30,41,59,${bgAlpha})`,
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: `1px solid ${gc ? gc.border : 'var(--border-glass)'}`,
    borderRadius: 'var(--radius-card)',
    boxShadow: shadowParts.join(', '),
    position: 'relative',
  };

  const inner = <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>;

  if (hover) {
    return (
      <motion.div
        className={className}
        style={{ ...baseStyle, transition: 'box-shadow 0.3s ease, border-color 0.3s ease' }}
        animate={{ scale: isActive ? 1.01 : 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {inner}
      </motion.div>
    );
  }

  return (
    <div className={className} style={baseStyle}>
      {inner}
    </div>
  );
}
