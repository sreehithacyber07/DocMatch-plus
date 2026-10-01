import type { ReactNode, CSSProperties } from 'react';

export interface TypographyProps {
  children: ReactNode;
  glow?: boolean;
  className?: string;
}

export function Title({ children, glow, className }: TypographyProps) {
  const style: CSSProperties = {
    fontSize: 'calc(48px * var(--text-scale))',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
    color: 'var(--text-primary)',
    textShadow: glow ? '0 0 30px rgba(241,245,249,0.3)' : undefined,
    margin: 0,
  };
  return (
    <h1 style={style} className={className}>
      {children}
    </h1>
  );
}

export function Subtitle({ children, glow, className }: TypographyProps) {
  const style: CSSProperties = {
    fontSize: 'calc(20px * var(--text-scale))',
    fontWeight: 400,
    color: 'var(--text-secondary)',
    textShadow: glow ? '0 0 20px rgba(148,163,184,0.3)' : undefined,
    margin: 0,
  };
  return (
    <p style={style} className={className}>
      {children}
    </p>
  );
}

export function Body({ children, glow, className }: TypographyProps) {
  const style: CSSProperties = {
    fontSize: 'calc(15px * var(--text-scale))',
    fontWeight: 400,
    lineHeight: 1.7,
    color: 'var(--text-secondary)',
    textShadow: glow ? '0 0 15px rgba(148,163,184,0.2)' : undefined,
    margin: 0,
  };
  return (
    <p style={style} className={className}>
      {children}
    </p>
  );
}

export function Caption({ children, glow, className }: TypographyProps) {
  const style: CSSProperties = {
    fontSize: 'calc(12px * var(--text-scale))',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(148,163,184,0.7)',
    textShadow: glow ? '0 0 10px rgba(148,163,184,0.2)' : undefined,
    margin: 0,
    display: 'block',
  };
  return (
    <span style={style} className={className}>
      {children}
    </span>
  );
}

export function DataText({ children, glow, className }: TypographyProps) {
  const style: CSSProperties = {
    fontSize: 'calc(14px * var(--text-scale))',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    color: 'var(--cyan-neon)',
    textShadow: glow ? '0 0 10px rgba(34,211,238,0.5)' : undefined,
    margin: 0,
  };
  return (
    <span style={style} className={className}>
      {children}
    </span>
  );
}
