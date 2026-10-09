/**
 * Tuning for the DocMatch+ ambient environment.
 *
 * Every value marked "Manus" is copied from the Manus export
 * (_manus_reference/client/src/pages/Home.tsx) and recorded in
 * MANUS_VISUAL_AUDIT.md. Values marked "added" implement behaviour the Manus
 * prototype did not have and the visual brief requires.
 */

export const atmosphereConfig = {
  // Manus: radial aura centred at (0.7w, 0.5h) with radius 0.76w.
  auraCentre: { x: 0.7, y: 0.5 },
  auraRadius: 0.76,
  auraInner: 'rgba(17, 62, 76, 0.10)',
  auraOuter: 'rgba(3, 10, 20, 0)',
  // Manus: three slow bezier currents.
  currentCount: 3,
  currentStroke: 'rgba(72, 120, 150, 0.11)',
  currentWidth: 0.7,
} as const;

export const particleConfig = {
  // Manus: count = clamp(round(w*h / 11000), 56, 118).
  areaPerParticle: 11000,
  minCount: 56,
  maxCount: 118,
  // Manus: drift amplitude and speed.
  driftX: 7,
  driftY: 5,
  speedX: 0.22,
  speedY: 0.19,
  // Manus: fill rgba(49, 94, 120, 0.07 + depth * 0.16).
  baseAlpha: 0.07,
  depthAlpha: 0.16,
  rgb: '49, 94, 120',
} as const;

export const signalConfig = {
  // Manus: six lines at 15% spacing from 15% of the height.
  lineCount: 6,
  firstLine: 0.15,
  lineSpacing: 0.15,
  amplitudeBase: 18,
  amplitudeStep: 7,
  // Manus: the two sine terms of each line.
  primaryFrequency: 0.0032,
  primarySpeed: 0.025,
  primaryPhase: 1.18,
  secondaryFrequency: 0.006,
  secondarySpeed: 0.018,
  secondaryPhase: 1.7,
  secondaryWeight: 0.35,
  overscan: 140,
  sampleStep: 16,
  sampleStepSmall: 24, // added: coarser sampling on small screens
  stroke: 'rgba(49, 94, 120, 0.14)',
  strokeWidth: 0.65,
  activeStroke: 'rgba(67, 125, 151, 0.18)',
  activeWidth: 0.9,
  // Manus: cursor bend exp(-(d/180)^2) * (cy - 0.5) * 9.
  cursorRadius: 180,
  cursorBend: 9,
  // added: the nearest line brightens slightly near the cursor.
  cursorBrighten: 0.05,
  // Manus: pulse speed 0.085 of a crossing per second, half-length 115px.
  pulseSpeed: 0.085,
  pulseHalfLength: 115,
  pulseOverscan: 120,
  pulseStep: 10,
  pulseRgb: '141, 230, 220',
  pulseBaseAlpha: 0.14,
  pulsePeakAlpha: 0.26,
  // Manus drew the glow as an 8px shadow of rgba(83, 213, 245, 0.22); it is
  // now a wide faint stroke of the same colour (see drawSignalWaves).
  pulseGlowRgb: '83, 213, 245',
  pulseGlowAlpha: 0.11,
  pulseGlowWidth: 6,
  pulseWidth: 1.1,
  // added: an irregular rest between pulses, in seconds.
  restMin: 1.6,
  restMax: 5.2,
} as const;

export const dnaConfig = {
  // Manus geometry.
  centre: 0.5,
  amplitudeRatio: 0.34,
  amplitudeMax: 430,
  helixRadiusRatio: 0.044,
  helixRadiusMax: 50,
  minStep: 9,
  stepDivisor: 66,
  firstIndex: -150,
  lastIndex: 290,
  // Manus motion.
  scrollTravel: 0.64,
  idleTravel: 3.5,
  pathFrequency: 0.006,
  pathSpeed: 0.08,
  pathScroll: 0.003,
  secondaryPathRatio: 0.42,
  secondaryPathPhase: 1.2,
  secondaryPathWeight: 0.44,
  localWaveFrequency: 0.018,
  localWaveSpeed: 0.42,
  localWaveAmplitude: 12,
  twistFrequency: 0.035,
  twistSpeed: 0.34,
  twistScroll: 0.005,
  breathFrequency: 0.012,
  breathSpeed: 0.24,
  breathDepth: 0.13,
  // Manus cursor force field.
  forceRadiusX: 190,
  forceRadiusY: 260,
  forceFalloff: 2.5,
  forceBend: 0.16,
  // added: local twist and depth response to the cursor.
  forceTwist: 0.6,
  // Manus strands and rungs.
  strandWidths: [1.05, 0.8],
  firstRung: -144,
  rungEvery: 5,
  rungWidth: 0.62,
  rungBaseAlpha: 0.07,
  rungDepthAlpha: 0.14,
  // Manus wrap is 8 steps; added: a multiple of the rung spacing, so rungs
  // never jump when the sample grid wraps.
  wrapSteps: 10,
  // added: the front half of each strand is drawn a little brighter and wider,
  // which reads as the strands crossing through depth.
  frontAlpha: 0.2,
  frontWidth: 0.35,
  // added: a faint edge light where a travelling pulse passes the strand.
  pulseTouchRadius: 120,
  pulseTouchSpan: 70,
  pulseTouchAlpha: 0.28,
} as const;

export const motionConfig = {
  // Manus smoothing.
  cursorEase: 0.065,
  scrollEase: 0.055,
  reducedScrollEase: 0.2,
  // added: how fast the cursor's influence fades in and out.
  presenceEase: 0.05,
  // Manus: DPR clamp.
  maxPixelRatio: 2,
  // Manus: mobile breakpoint.
  smallScreen: 700,
} as const;

export type EnvironmentIntensity = 'landing' | 'explorer' | 'form' | 'result';

/** How strongly each layer shows in each context. 1 is the Manus landing. */
export const intensityConfig: Record<EnvironmentIntensity, { dna: number; waves: number; particles: number; aura: number }> = {
  landing: { dna: 1, waves: 1, particles: 1, aura: 1 },
  explorer: { dna: 0.35, waves: 0.6, particles: 0.45, aura: 1 },
  form: { dna: 0.2, waves: 0.45, particles: 0.25, aura: 1 },
  result: { dna: 0.6, waves: 0.75, particles: 0.5, aura: 1 },
};
