import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn, describedBy } from './cn.ts';

/** The error line under a field or group. Text and a mark, never colour alone. */
export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="dm-field__error" id={id}>
      <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.6v4.2M8 10.9v.2" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  helper?: ReactNode;
  error?: string;
  optional?: boolean;
  /** A small mark drawn inside the frame, before the text. */
  mark?: ReactNode;
  /** Visually hides the label while keeping it as the accessible name. */
  hideLabel?: boolean;
  fieldClassName?: string;
}

/**
 * A labelled text input. The label is always a real <label>; a placeholder
 * never stands in for it. Helper and error text are linked with
 * aria-describedby, and the invalid state is set with aria-invalid.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, value, onValueChange, helper, error, optional, mark, hideLabel, fieldClassName, id, className, disabled, ...input },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  return (
    <div
      className={cn('dm-field', fieldClassName)}
      data-invalid={error ? true : undefined}
      data-filled={value ? true : undefined}
      data-disabled={disabled || undefined}
    >
      <label className={cn('dm-field__label', hideLabel && 'sr-only')} htmlFor={inputId}>
        <span>{label}</span>
        {optional ? <span className="dm-field__optional">Optional</span> : null}
      </label>
      <div className="dm-field__frame">
        {mark ? (
          <span className="dm-field__mark" aria-hidden="true">
            {mark}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn('dm-field__input', className)}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(helper && helperId, error && errorId)}
          onChange={(event) => onValueChange(event.target.value)}
          {...input}
        />
      </div>
      {helper ? (
        <p className="dm-field__helper" id={helperId}>
          {helper}
        </p>
      ) : null}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
});

const SearchMark = (
  <svg viewBox="0 0 20 20" focusable="false">
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="m12.6 12.6 4.4 4.4" />
  </svg>
);

/** A search input with its mark drawn inside the frame. */
export const SearchField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'mark' | 'type'>>(function SearchField(props, ref) {
  return <TextField ref={ref} type="search" mark={SearchMark} autoComplete="off" {...props} />;
});

/**
 * A text field that exists only while its parent answer allows it.
 *
 * MECHANICAL REASON for the motion: revealing a dependent field grows the form.
 * Animating its height lets the content beneath slide rather than jump, so the
 * control the patient just used stays where it was. With reduced motion the
 * field appears in its final place at once.
 */
export function ConditionalTextField({ show, ...props }: TextFieldProps & { show: boolean }) {
  const reduced = Boolean(useReducedMotion());
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          className="dm-conditional"
          initial={reduced ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduced ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
        >
          <TextField {...props} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
