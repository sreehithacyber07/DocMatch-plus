/** The root entrance has one path on every normal visit. */
export type HeroState = 'loading' | 'playing' | 'final' | 'fallback' | 'exiting' | 'dismissed';
export type HeroEvent = 'video-ready' | 'video-ended' | 'video-error' | 'enter' | 'exit-complete';

export interface HeroEntryConditions {
  reducedMotion: boolean;
}

export function initialHeroState({ reducedMotion }: Readonly<HeroEntryConditions>): HeroState {
  return reducedMotion ? 'fallback' : 'loading';
}

export function heroReducer(state: HeroState, event: HeroEvent): HeroState {
  if (state === 'dismissed') return state;
  switch (event) {
    case 'video-ready':
      return state === 'loading' ? 'playing' : state;
    case 'video-ended':
      return state === 'loading' || state === 'playing' ? 'final' : state;
    case 'video-error':
      return state === 'loading' || state === 'playing' ? 'fallback' : state;
    case 'enter':
      return ['loading', 'playing', 'final', 'fallback'].includes(state) ? 'exiting' : state;
    case 'exit-complete':
      return state === 'exiting' ? 'dismissed' : state;
    default:
      return state;
  }
}

export function heroIsVisible(state: HeroState): boolean {
  return state !== 'dismissed';
}

export function enterAvailable(state: HeroState): boolean {
  return state !== 'exiting' && state !== 'dismissed';
}

export function videoMounted(state: HeroState, conditions: Readonly<HeroEntryConditions>): boolean {
  return !conditions.reducedMotion && ['loading', 'playing', 'final', 'exiting'].includes(state);
}
