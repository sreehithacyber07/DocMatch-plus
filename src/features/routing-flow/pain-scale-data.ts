export const PAIN_LEVELS = [
  { level: 1, label: 'Minimal' },
  { level: 2, label: 'Mild' },
  { level: 3, label: 'Moderate' },
  { level: 4, label: 'Strong' },
  { level: 5, label: 'Severe' },
] as const;

export type PainLevel = (typeof PAIN_LEVELS)[number]['level'];

export function painLevelLabel(level: PainLevel | null) {
  return PAIN_LEVELS.find((item) => item.level === level)?.label ?? 'Not recorded';
}
