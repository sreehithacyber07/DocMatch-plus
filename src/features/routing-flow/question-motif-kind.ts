export type MotifKind =
  | 'character'
  | 'intensity'
  | 'duration'
  | 'onset'
  | 'pattern'
  | 'change'
  | 'context'
  | 'location'
  | 'routing'
  | 'safety';

export function motifForQuestion(kind: 'safety' | 'intake' | 'routing', category?: string, control?: string): MotifKind {
  if (kind === 'safety') return 'safety';
  if (kind === 'routing') return 'routing';
  // A body-location answer is about where, not when.
  if (control === 'body-location') return 'location';
  switch (category) {
    case 'character':
    case 'intensity':
    case 'duration':
    case 'onset':
    case 'pattern':
    case 'change':
    case 'context':
      return category;
    default:
      return 'character';
  }
}
