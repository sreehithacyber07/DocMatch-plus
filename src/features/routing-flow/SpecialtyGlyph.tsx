export interface SpecialtyGlyphProps {
  specialty: string;
  size?: number;
  className?: string;
}

/** Bespoke clinical line marks used only for specialty directions. */
export function SpecialtyGlyph({ specialty, size = 24, className }: SpecialtyGlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphFor(specialty)}
    </svg>
  );
}

function glyphFor(specialty: string) {
  switch (specialty) {
    case 'cardiology':
      return (
        <>
          <path d="M16 27S5.5 20.6 5.5 12.7c0-4 4.9-6.1 7.7-3.2L16 12.3l2.8-2.8c2.8-2.9 7.7-.8 7.7 3.2C26.5 20.6 16 27 16 27Z" />
          <path d="M7.8 17h4.3l1.8-4.2 3.1 8.1 2.1-3.9h5.1" />
        </>
      );
    case 'respiratory-medicine':
      return (
        <>
          <path d="M15 7.2v8.2c-2.4-1.9-4.4-4.4-6.7-3.2-2.8 1.4-3.6 7.4-2.4 11.7.6 2.2 2.5 3 4.4 2.2 3.5-1.5 4.7-5.7 4.7-10.7" />
          <path d="M17 7.2v8.2c2.4-1.9 4.4-4.4 6.7-3.2 2.8 1.4 3.6 7.4 2.4 11.7-.6 2.2-2.5 3-4.4 2.2-3.5-1.5-4.7-5.7-4.7-10.7" />
          <path d="M12.5 7.2h7" />
        </>
      );
    case 'neurology':
      return (
        <>
          <path d="M13 26.5c-2.4 0-4.2-1.6-4.2-3.7-2.1-.5-3.3-2.2-2.8-4.2-1.6-1.4-1.5-4 .2-5.2-.4-2.4 1.5-4.6 4-4.5.8-2.5 4.2-3.5 5.8-1.4 1.6-2.1 5-1.1 5.8 1.4 2.5-.1 4.4 2.1 4 4.5 1.7 1.2 1.8 3.8.2 5.2.5 2-1 3.7-3 4.2 0 2.1-1.8 3.7-4.2 3.7" />
          <path d="M16 7.5v19M11.2 12.2c2.7.1 4.8 1.8 4.8 4.3M20.8 12.2c-2.7.1-4.8 1.8-4.8 4.3M9.3 19.1c3-.6 5.4.4 6.7 2.8M22.7 19.1c-3-.6-5.4.4-6.7 2.8" />
        </>
      );
    case 'medical-gastroenterology':
      return (
        <>
          <path d="M17.5 6.2c-.7 4.6.5 6.7 3.7 8 3.4 1.4 4.6 4.8 3.3 7.8-1.5 3.5-5.7 4.7-9.2 2.8-2.7-1.5-4.2-4-3.9-6.7.2-1.7 1.2-2.7 2.7-2.7 2.5 0 3.3-1.4 3.4-3.3" />
          <path d="M11.4 18.5c-2.9-.2-4.9-2-4.9-4.6 0-2.2 1.4-4 3.4-4.7M9.9 9.2c1.7-.5 3.2.1 4.1 1.4" />
          <path d="M16.1 19c1.6 2.4 4.6 2.7 6.5.8" />
        </>
      );
    case 'orthopaedics':
      return (
        <>
          <path d="M9.2 8.4a3.3 3.3 0 1 1 4.7 4.7l4 4a3.3 3.3 0 1 1 4.7 4.7" />
          <path d="M22.8 23.6a3.3 3.3 0 1 1-4.7-4.7l-4-4a3.3 3.3 0 1 1-4.7-4.7" />
          <circle cx="16" cy="16" r="2.2" />
        </>
      );
    case 'dermatology':
      return (
        <>
          <path d="M7 8.5c3.6 2.4 5.7 2.4 9.2 0 3.5-2.4 5.6-2.4 8.8 0M7 14.1c3.6 2.4 5.7 2.4 9.2 0 3.5-2.4 5.6-2.4 8.8 0M7 19.7c3.6 2.4 5.7 2.4 9.2 0 3.5-2.4 5.6-2.4 8.8 0" />
          <path d="M7 25.3h18" />
        </>
      );
    case 'general-medicine':
    default:
      return (
        <>
          <circle cx="16" cy="16" r="10.5" />
          <path d="M16 10v12M10 16h12" />
          <path d="M16 3.5v2M16 26.5v2M3.5 16h2M26.5 16h2" />
        </>
      );
  }
}
