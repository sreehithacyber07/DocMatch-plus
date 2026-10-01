import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface GlassButtonProps {
  children: ReactNode;
  variant: 'primary' | 'secondary' | 'ghost' | 'alert';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
}

const sizeConfig = {
  sm: { padding: '8px 16px',  fontSize: '13px', iconSize: 14 },
  md: { padding: '12px 24px', fontSize: '15px', iconSize: 16 },
  lg: { padding: '16px 32px', fontSize: '16px', iconSize: 18 },
} as const;

export function GlassButton({
  children,
  variant,
  size = 'md',
  icon: Icon,
  onClick,
  disabled = false,
}: GlassButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const sc = sizeConfig[size];
  const active = !disabled && hovered;
  const translateY = (!disabled && pressed) ? '0' : active ? '-1px' : '0';

  const base: CSSProperties = {
    padding: sc.padding,
    fontSize: sc.fontSize,
    borderRadius: 'var(--radius-button)',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: 500,
    lineHeight: 1.2,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: `translateY(${translateY})`,
    outline: 'none',
    fontFamily: 'inherit',
  };

  let variantStyle: CSSProperties;

  if (variant === 'primary') {
    variantStyle = {
      background: 'linear-gradient(135deg, var(--indigo), var(--purple))',
      color: 'var(--text-primary)',
      boxShadow: active
        ? '0 4px 20px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
        : '0 2px 10px rgba(99,102,241,0.2)',
      filter: active ? 'brightness(1.1)' : 'brightness(1)',
    };
  } else if (variant === 'secondary') {
    variantStyle = {
      background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
      color: 'var(--indigo-soft)',
      border: '1px solid rgba(99,102,241,0.3)',
      boxShadow: 'none',
    };
  } else if (variant === 'ghost') {
    variantStyle = {
      background: 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      border: 'none',
      boxShadow: 'none',
    };
  } else {
    variantStyle = {
      background: 'linear-gradient(135deg, var(--alert), var(--alert-end))',
      color: 'var(--text-primary)',
      boxShadow: active
        ? '0 4px 20px rgba(236,72,153,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
        : '0 2px 10px rgba(236,72,153,0.2)',
      filter: active ? 'brightness(1.1)' : 'brightness(1)',
    };
  }

  return (
    <button
      style={{ ...base, ...variantStyle }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => { if (!disabled) setHovered(true); }}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => { if (!disabled) setPressed(true); }}
      onMouseUp={() => setPressed(false)}
    >
      {Icon && <Icon size={sc.iconSize} />}
      {children}
    </button>
  );
}
