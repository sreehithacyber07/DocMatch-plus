/*
  Small hand-drawn marks for the landing, in place of the icon library the
  Manus prototype used. Each is decorative (aria-hidden) and inherits colour.
*/

export function DnaMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M7 3c0 5 10 7 10 12s-4 5-5 6" />
      <path d="M17 3c0 5-10 7-10 12s4 5 5 6" />
      <path d="M9 7h6M8.5 17h7M10 12h4" />
    </svg>
  );
}

export function ArrowUpRightMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function ChevronDownMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PointerMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 3l14 7-6 2-2 6L5 3Z" />
    </svg>
  );
}

export function ClinicalIntakeMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 9h6M12 13v5M9.5 15.5h5" />
    </svg>
  );
}

export function MenuMark({ open, size = 20 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
