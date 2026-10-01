import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn.ts';

export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Checkbox. The shadcn checkbox renders a button with role="checkbox" and a
 * checked state; this keeps that structure without the Radix runtime, which
 * cannot be installed alongside the pinned Drei and Fiber versions.
 *
 * A native button already answers Space and Enter, and role="checkbox" with
 * aria-checked is what assistive technology reads. The button itself is the
 * full touch target; the drawn box inside it is smaller. The tick is a
 * hand-drawn path, not an icon library.
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, onCheckedChange, className, onClick, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn('dm-checkbox', className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
      {...props}
    >
      <span className="dm-checkbox__box" aria-hidden="true">
        <svg className="dm-checkbox__indicator" viewBox="0 0 16 16" focusable="false">
          <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
        </svg>
      </span>
    </button>
  );
});
