import type { CSSProperties, SVGProps } from 'react';
import './pictogram.css';

export type PictogramName =
  | 'alert'
  | 'assistance'
  | 'back'
  | 'body'
  | 'clinician'
  | 'copy-print'
  | 'diagnosis'
  | 'duration'
  | 'handoff'
  | 'history'
  | 'location'
  | 'pain'
  | 'prescription'
  | 'priority'
  | 'pulse'
  | 'question'
  | 'result'
  | 'routing'
  | 'summary'
  | 'structure'
  | 'systems'
  | 'treatment';

export type PictogramState = 'default' | 'focus' | 'active' | 'completed' | 'unavailable' | 'critical';

export interface PictogramProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'name'> {
  label?: string;
  name: PictogramName;
  size?: 20 | 30 | 40;
  state?: PictogramState;
}

function Mark({ name }: { name: PictogramName }) {
  switch (name) {
    case 'body':
      return (
        <g>
          <path data-part="primary" d="M9 1h6l2 2v4l-3 3h-4L7 7V3l2-2Z" />
          <path data-part="secondary" d="M7 9h10l3 4-2 3-2-2v9h-3v-7h-2v7H8v-9l-2 2-2-3 3-4Z" />
        </g>
      );
    case 'location':
      return (
        <g>
          <path data-part="primary" fillRule="evenodd" d="M12 1 22 9v6l-10 8L2 15V9l10-8Zm0 5-5 5v2l5 4 5-4v-2l-5-5Z" />
          <path data-part="signal" d="M10 10h4v4h-4v-4Z" />
        </g>
      );
    case 'systems':
      return (
        <path
          data-part="primary"
          fillRule="evenodd"
          d="M2 2h7l2 2v6H4l-2-2V2Zm13 0h7v8h-9V4l2-2ZM8 15h8v7H8v-7ZM9 6h6v2H9V6Zm2 2h2v8h-2V8Z"
        />
      );
    case 'structure':
      return (
        <path
          data-part="primary"
          fillRule="evenodd"
          d="M5 1h10l7 7v9l-6 6H6l-4-6V6l3-5Zm3 6-2 4 3 7h6l3-5-4-6H8Zm2 3h4l1 3-2 2h-3l-1-3 1-2Z"
        />
      );
    case 'question':
      return (
        <g>
          <path data-part="primary" fillRule="evenodd" d="M3 2h14l4 4v11l-4 4h-5l-4 3v-3H3V2Zm4 4v11h8l2-2V7l-1-1H7Z" />
          <path data-part="signal" d="M9 8h5l2 2v3l-3 2v1h-3v-3l3-2v-1H9V8Zm1 9h3v3h-3v-3Z" />
        </g>
      );
    case 'alert':
      return (
        <g>
          <path data-part="primary" fillRule="evenodd" d="M5 1h12l6 6v10l-6 6H5l-4-4V5l4-4Zm3 5v12h8l2-2V8l-2-2H8Z" />
          <path data-part="signal" d="M10 7h4v7h-4V7Zm0 9h4v3h-4v-3Z" />
        </g>
      );
    case 'routing':
      return (
        <g>
          <path data-part="primary" d="M2 3h8l5 5v3h-4V9L8 7H6v11h7v5H2V3Z" />
          <path data-part="signal" d="m14 2 8 10-8 10v-6h-4v-8h4V2Z" />
        </g>
      );
    case 'back':
      return <path data-part="primary" d="M2 10 10 2v5h5l5 5v10h-5v-8l-5-2v5l-8-7Z" />;
    case 'copy-print':
      return (
        <path
          data-part="primary"
          fillRule="evenodd"
          d="M6 1h10l4 4v4h3v11h-5v3H4v-3H1V7h5V1Zm3 4v5h7V6l-1-1H9Zm-1 11v5h7v-5H8ZM4 10v3h3v-3H4Zm14 0v3h2v-3h-2Z"
        />
      );
    case 'assistance':
      return (
        <path
          data-part="primary"
          d="M3 1h6l2 2v5H5L3 6V1Zm1 9h7l3 4 3-3 4 4-7 7-4-4v5H5v-8H2v-5h2Zm16-9h3v22h-3V1Z"
        />
      );
    case 'history':
      return (
        <g>
          <path data-part="primary" d="M12 3a9 9 0 1 1-7.2 3.6L2 9V2h7L6.7 4.3A11 11 0 1 0 12 1v2Z" />
          <path data-part="signal" d="M11 6h2v6.2l4 2.3-1 1.7-5-2.9V6Z" />
        </g>
      );
    case 'pain':
      return (
        <g>
          <path data-part="primary" d="M12 1 4 5v7c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5l-8-4Zm0 3.2L17 6.7V12c0 3.5-2 6.4-5 7.8-3-1.4-5-4.3-5-7.8V6.7l5-2.5Z" />
          <path data-part="signal" d="m13 6-5 7h3l-1 5 6-8h-3V6Z" />
        </g>
      );
    case 'duration':
      return (
        <g>
          <path data-part="primary" fillRule="evenodd" d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm0 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" />
          <path data-part="signal" d="M11 5h2v6l4 3-1.2 1.6L11 12V5Z" />
        </g>
      );
    case 'pulse':
      return <path data-part="primary" d="M1 13h5l2-6 4 11 3-8 2 3h6v2h-7l-1-1.5-3 8-4-10-1 3.5H1v-2Z" />;
    case 'priority':
      return (
        <g>
          <path data-part="primary" fillRule="evenodd" d="M12 1 23 12 12 23 1 12 12 1Zm0 4.2L5.2 12 12 18.8l6.8-6.8L12 5.2Z" />
          <path data-part="signal" d="M10.5 7h3v7h-3V7Zm0 9h3v3h-3v-3Z" />
        </g>
      );
    case 'handoff':
      return (
        <g>
          <path data-part="primary" d="M2 3h8v5H6v8h4v5H2V3Zm12 2 8 7-8 7v-4H8V9h6V5Z" />
          <path data-part="signal" d="M11 11h6v2h-6v-2Z" />
        </g>
      );
    case 'result':
      return (
        <g>
          <path data-part="primary" d="M3 2h18v20H3V2Zm3 3v14h12V5H6Z" />
          <path data-part="signal" d="m8 12 2.3 2.3L16.6 8 18 9.4l-7.7 7.7L6.6 13.4 8 12Z" />
        </g>
      );
    case 'summary':
      return (
        <g>
          <path data-part="primary" d="M4 2h16v20H4V2Zm3 3v14h10V5H7Z" />
          <path data-part="signal" d="M9 8h6v2H9V8Zm0 4h6v2H9v-2Zm0 4h4v2H9v-2Z" />
        </g>
      );
    case 'diagnosis':
      return (
        <g>
          <path data-part="primary" d="M4 2h16v20H4V2Zm3 3v14h10V5H7Z" />
          <path data-part="signal" d="m8 8 8 8-1.5 1.5-8-8L8 8Zm6.5 0L16 9.5l-8 8L6.5 16l8-8Z" />
        </g>
      );
    case 'prescription':
      return (
        <g>
          <path data-part="primary" d="M4 2h10a5 5 0 0 1 0 10H9v10H4V2Zm5 4v2h5a1 1 0 0 0 0-2H9Z" />
          <path data-part="signal" d="m14 13 2.5 2.5L19 13l2 2-2.5 2.5L21 20l-2 2-2.5-2.5L14 22l-2-2 2.5-2.5L12 15l2-2Z" />
        </g>
      );
    case 'treatment':
      return (
        <g>
          <path data-part="primary" d="M3 9h18v6H3V9Zm6-6h6v18H9V3Z" />
          <path data-part="signal" d="M2 3.4 3.4 2 22 20.6 20.6 22 2 3.4Z" />
        </g>
      );
    case 'clinician':
      return (
        <g>
          <path data-part="primary" d="M8 1h8v8l-4 3-4-3V1Zm-3 12h14l3 4v6h-5v-5h-2v5H9v-5H7v5H2v-6l3-4Z" />
          <path data-part="signal" d="M11 14h2v3h3v2h-3v3h-2v-3H8v-2h3v-3Z" />
        </g>
      );
  }
}

export function Pictogram({
  className = '',
  label,
  name,
  size = 20,
  state = 'default',
  style,
  ...props
}: PictogramProps) {
  const labelled = Boolean(label);
  const pictogramStyle = { '--pictogram-size': `${size}px`, ...style } as CSSProperties;

  return (
    <svg
      {...props}
      className={['pictogram', className].filter(Boolean).join(' ')}
      data-name={name}
      data-state={state}
      viewBox="0 0 24 24"
      style={pictogramStyle}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? label : undefined}
      role={labelled ? 'img' : undefined}
      focusable="false"
    >
      {labelled && <title>{label}</title>}
      <Mark name={name} />
    </svg>
  );
}
