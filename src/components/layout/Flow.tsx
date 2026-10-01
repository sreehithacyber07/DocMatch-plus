import type { HTMLAttributes, ReactNode } from 'react';

type FlowElement = 'article' | 'div' | 'form' | 'nav' | 'section';
type FlowGap = 'compact' | 'control' | 'section' | 'major';

export interface FlowProps extends HTMLAttributes<HTMLElement> {
  as?: FlowElement;
  children: ReactNode;
  gap?: FlowGap;
}

export function Flow({
  as: Component = 'div',
  children,
  className = '',
  gap = 'section',
  ...props
}: FlowProps) {
  const classes = ['flow', `flow--${gap}`, className].filter(Boolean).join(' ');

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
