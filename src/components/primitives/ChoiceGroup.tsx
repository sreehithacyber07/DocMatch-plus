import { useId, type ReactNode } from 'react';
import { cn, describedBy } from './cn.ts';
import { FieldError } from './Field.tsx';

export interface ChoiceOption {
  value: string;
  label: string;
}

interface GroupFrameProps {
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  /** Number of columns on wide screens. */
  columns?: 1 | 2 | 3 | 4;
  children: (ids: { describedBy?: string }) => ReactNode;
  id?: string;
  /** Called when focus leaves the group, for touched state. */
  onLeave?: () => void;
}

/**
 * A fieldset with a legend, hint and error line. The legend names the group
 * for assistive technology, which is what grouped radio buttons and checkboxes
 * need.
 */
function GroupFrame({ legend, hint, error, optional, className, columns = 1, children, id, onLeave }: GroupFrameProps) {
  const generated = useId();
  const groupId = id ?? generated;
  const hintId = `${groupId}-hint`;
  const errorId = `${groupId}-error`;
  return (
    <fieldset
      className={cn('dm-choice-group', className)}
      id={groupId}
      data-invalid={error ? true : undefined}
      aria-describedby={describedBy(hint && hintId, error && errorId)}
      tabIndex={-1}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave?.();
      }}
    >
      <legend className="dm-choice-group__legend">
        <span>{legend}</span>
        {optional ? <span className="dm-field__optional">Optional</span> : null}
      </legend>
      {hint ? (
        <p className="dm-choice-group__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="dm-choice-group__cells" data-columns={columns}>
        {children({ describedBy: describedBy(error && errorId) })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}

export interface RadioChoiceGroupProps<Value extends string> {
  legend: ReactNode;
  name: string;
  options: readonly { value: Value; label: string }[];
  value: Value | null;
  onValueChange: (value: Value) => void;
  hint?: ReactNode;
  error?: string;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  id?: string;
  onLeave?: () => void;
}

/**
 * Single choice, drawn as full-width cells. Each cell is a native radio input
 * inside its label, so arrow keys move within the group, the group is one Tab
 * stop, and the whole cell is the touch target.
 */
export function RadioChoiceGroup<Value extends string>({
  legend,
  name,
  options,
  value,
  onValueChange,
  hint,
  error,
  columns,
  className,
  id,
  onLeave,
}: RadioChoiceGroupProps<Value>) {
  return (
    <GroupFrame legend={legend} hint={hint} error={error} columns={columns} className={className} id={id} onLeave={onLeave}>
      {({ describedBy: errorRef }) =>
        options.map((option) => (
          <label className="dm-choice" key={option.value} data-checked={value === option.value || undefined}>
            <input
              className="dm-choice__input"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              required
              aria-invalid={errorRef ? true : undefined}
              aria-describedby={errorRef}
              onChange={() => onValueChange(option.value)}
            />
            <span className="dm-choice__mark dm-choice__mark--radio" aria-hidden="true" />
            <span className="dm-choice__label">{option.label}</span>
          </label>
        ))
      }
    </GroupFrame>
  );
}

export interface CheckboxChoiceGroupProps<Value extends string> {
  legend: ReactNode;
  name: string;
  options: readonly { value: Value; label: string }[];
  values: readonly Value[];
  onToggle: (value: Value) => void;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  id?: string;
  onLeave?: () => void;
}

/**
 * Multiple choice with native checkboxes. Exclusive answers such as "None" are
 * resolved by the caller's onToggle, so the rule lives with the data and is
 * testable.
 */
export function CheckboxChoiceGroup<Value extends string>({
  legend,
  name,
  options,
  values,
  onToggle,
  hint,
  error,
  optional,
  columns,
  className,
  id,
  onLeave,
}: CheckboxChoiceGroupProps<Value>) {
  return (
    <GroupFrame legend={legend} hint={hint} error={error} optional={optional} columns={columns} className={className} id={id} onLeave={onLeave}>
      {({ describedBy: errorRef }) =>
        options.map((option) => (
          <label className="dm-choice" key={option.value} data-checked={values.includes(option.value) || undefined}>
            <input
              className="dm-choice__input"
              type="checkbox"
              name={name}
              value={option.value}
              checked={values.includes(option.value)}
              aria-invalid={errorRef ? true : undefined}
              aria-describedby={errorRef}
              onChange={() => onToggle(option.value)}
            />
            <span className="dm-choice__mark dm-choice__mark--check" aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false">
                <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
              </svg>
            </span>
            <span className="dm-choice__label">{option.label}</span>
          </label>
        ))
      }
    </GroupFrame>
  );
}
