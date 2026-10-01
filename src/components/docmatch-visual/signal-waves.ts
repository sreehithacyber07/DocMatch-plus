import { signalConfig as config } from './config.ts';
import { NO_PULSE, type PulsePoint, type Scene } from './scene.ts';

/**
 * Chooses which signal line carries the travelling light.
 *
 * Manus lit the lines one after another with no gap. Here exactly one line is
 * lit at a time, followed by an irregular rest, and the next pulse always
 * starts on a different line, so it never reads as a loop.
 */
export interface PulseScheduler {
  line: number;
  start: number;
  restUntil: number;
}

export function createPulseScheduler(): PulseScheduler {
  return { line: 2, start: 0.8, restUntil: 0 };
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

function advance(scheduler: PulseScheduler, time: number): number | null {
  if (time < scheduler.restUntil) return null;
  if (scheduler.start < scheduler.restUntil) {
    // The rest has ended: begin a new pulse on a different line.
    let next = Math.floor(Math.random() * (config.lineCount - 1));
    if (next >= scheduler.line) next += 1;
    scheduler.line = next;
    scheduler.start = time;
  }
  const progress = (time - scheduler.start) * config.pulseSpeed;
  if (progress < 0) return null;
  if (progress >= 1) {
    scheduler.restUntil = time + random(config.restMin, config.restMax);
    return null;
  }
  return progress;
}

function lineY(scene: Scene, line: number, x: number): number {
  const { height, time, cursor, presence, width } = scene;
  const baseY = height * (config.firstLine + line * config.lineSpacing);
  const amplitude = config.amplitudeBase + (line % 3) * config.amplitudeStep;
  const wave =
    Math.sin(x * config.primaryFrequency + time * config.primarySpeed + line * config.primaryPhase) * amplitude +
    Math.sin(x * config.secondaryFrequency - time * config.secondarySpeed + line * config.secondaryPhase) *
      amplitude *
      config.secondaryWeight;
  const distance = Math.abs(x - cursor.x * width);
  const bend = Math.exp(-Math.pow(distance / config.cursorRadius, 2)) * (cursor.y - 0.5) * config.cursorBend * presence;
  return baseY + wave + bend;
}

/**
 * The signal wave field (Manus): six long curved lines beyond the viewport,
 * drifting slowly, bending locally near the cursor. Returns where the
 * travelling light is, so the DNA can answer it.
 */
export function drawSignalWaves(scene: Scene, scheduler: PulseScheduler, alpha: number, animatePulse: boolean): PulsePoint {
  const { ctx, width, cursor, presence, small } = scene;
  if (alpha <= 0) return NO_PULSE;
  const progress = animatePulse ? advance(scheduler, scene.time) : null;
  const activeLine = progress === null ? -1 : scheduler.line;
  const step = small ? config.sampleStepSmall : config.sampleStep;
  const nearest = Math.round((cursor.y - config.firstLine) / config.lineSpacing);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let line = 0; line < config.lineCount; line += 1) {
    ctx.beginPath();
    for (let x = -config.overscan; x <= width + config.overscan; x += step) {
      const y = lineY(scene, line, x);
      if (x === -config.overscan) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const active = line === activeLine;
    ctx.strokeStyle = active ? config.activeStroke : config.stroke;
    ctx.lineWidth = active ? config.activeWidth : config.strokeWidth;
    ctx.stroke();
    if (line === nearest && presence > 0.01) {
      ctx.strokeStyle = `rgba(67, 125, 151, ${config.cursorBrighten * presence})`;
      ctx.stroke();
    }
  }

  let pulse = NO_PULSE;
  if (progress !== null) {
    const pulseX = -config.pulseOverscan + progress * (width + config.pulseOverscan * 2);
    const fade = Math.sin(progress * Math.PI);
    ctx.beginPath();
    for (let x = pulseX - config.pulseHalfLength; x <= pulseX + config.pulseHalfLength; x += config.pulseStep) {
      const y = lineY(scene, activeLine, x);
      if (x === pulseX - config.pulseHalfLength) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // A soft trail behind the head: clear at the tail, brightest just behind
    // the leading edge, clear again at the tip.
    const strength = config.pulseBaseAlpha + fade * config.pulsePeakAlpha;
    const trail = ctx.createLinearGradient(pulseX - config.pulseHalfLength, 0, pulseX + config.pulseHalfLength, 0);
    trail.addColorStop(0, `rgba(${config.pulseRgb}, 0)`);
    trail.addColorStop(0.72, `rgba(${config.pulseRgb}, ${strength})`);
    trail.addColorStop(1, `rgba(${config.pulseRgb}, 0)`);
    ctx.strokeStyle = trail;
    ctx.shadowColor = config.pulseGlow;
    ctx.shadowBlur = config.pulseGlowBlur;
    ctx.lineWidth = config.pulseWidth;
    ctx.stroke();
    ctx.shadowBlur = 0;
    pulse = { active: true, x: pulseX, y: lineY(scene, activeLine, pulseX), fade };
  }
  ctx.restore();
  return pulse;
}
