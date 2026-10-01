import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { cn } from './cn.ts';
import { moveSpecularEdge } from './specular.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'warning' | 'back' | 'icon';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  /** Shows a progress mark, keeps the width and blocks activation. */
  loading?: boolean;
  /** Read by assistive technology while loading, in place of the label. */
  loadingLabel?: string;
  children?: ReactNode;
}

/**
 * The DocMatch+ button.
 *
 * MECHANICAL REASON for the motion: a press moves the control down by one
 * pixel, as if it gave under the finger. A kiosk or tablet has no hover, so the
 * press itself must show that the touch landed. With reduced motion the press
 * is carried by the surface alone.
 *
 * Disabled and loading states use their own surface tokens, never opacity, so
 * the label keeps its contrast.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, loadingLabel, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  const reduced = Boolean(useReducedMotion());
  const inactive = Boolean(disabled) || loading;

  return (
    <motion.button
      ref={ref}
      type={type}
      className={cn('dm-button', 'dm-specular', `dm-button--${variant}`, className)}
      data-loading={loading || undefined}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      whileTap={inactive || reduced ? undefined : { y: 1, scale: 0.985 }}
      transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
      {...rest}
      onPointerMove={(event) => {
        moveSpecularEdge(event);
        rest.onPointerMove?.(event);
      }}
      onClick={loading ? (event) => event.preventDefault() : rest.onClick}
    >
      {loading ? (
        <span className="dm-button__progress" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <circle cx="10" cy="10" r="7" />
          </svg>
        </span>
      ) : null}
      <span className="dm-button__label">{children}</span>
      {loading && loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
    </motion.button>
  );
});
