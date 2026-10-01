export const SPECIALTY_IDS = [
  'cardiology',
  'pulmonology',
  'neurology',
  'gastroenterology',
  'orthopedics',
  'dermatology',
] as const;

export type SpecialtyId = (typeof SPECIALTY_IDS)[number];

export const SPECIALTY_COUNT = SPECIALTY_IDS.length;
