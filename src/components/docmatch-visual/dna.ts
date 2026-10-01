import { dnaConfig as config } from './config.ts';
import type { PulsePoint, Scene } from './scene.ts';

/**
 * The continuous DNA strand.
 *
 * The centreline is a deformable spline, not an object that moves: its x at
 * each screen height comes from two slow sine terms of height, time and
 * scroll (the Manus "broad S"), so different parts of the strand sit at
 * different places at once and scrolling brings new strand in without a reset.
 * The two helix strands are built around that centreline; the rungs join them.
 *
 * On top of the Manus geometry this adds: a depth pass that draws the front
 * half of each strand a little brighter so the strands cross through depth; a
 * local twist near the cursor; and a faint edge light where a travelling
 * signal pulse passes close to the strand.
 */
export function createDnaRenderer() {
  const count = config.lastIndex - config.firstIndex + 1;
  const ys = new Float32Array(count);
  const centres = new Float32Array(count);
  const swings = new Float32Array(count);
  const depths = new Float32Array(count);
  const twists = new Float32Array(count);
  let cached: { width: number; height: number; strands: CanvasGradient[] } | null = null;

  const gradients = (ctx: CanvasRenderingContext2D, width: number, height: number, amplitude: number) => {
    if (cached && cached.width === width && cached.height === height) return cached.strands;
    const baseX = width * config.centre;
    const strands = [0, 1].map((strand) => {
      const gradient = ctx.createLinearGradient(baseX - amplitude, 0, baseX + amplitude, height);
      gradient.addColorStop(0, 'rgba(49, 94, 120, .02)');
      gradient.addColorStop(0.22, strand === 0 ? 'rgba(83, 213, 245, .17)' : 'rgba(67, 125, 151, .13)');
      gradient.addColorStop(0.52, strand === 0 ? 'rgba(83, 213, 245, .76)' : 'rgba(67, 125, 151, .58)');
      gradient.addColorStop(0.82, strand === 0 ? 'rgba(83, 213, 245, .14)' : 'rgba(67, 125, 151, .12)');
      gradient.addColorStop(1, 'rgba(49, 94, 120, .02)');
      return gradient;
    });
    cached = { width, height, strands };
    return strands;
  };

  return function drawDNA(scene: Scene, alpha: number, pulse: PulsePoint) {
    const { ctx, width, height, time, scroll, cursor, presence } = scene;
    if (alpha <= 0) return;
    const baseX = width * (scene.story ? scene.focusX : config.centre);
    const amplitude = scene.story
      ? Math.min(width * (scene.small ? 0.07 : 0.14), 190)
      : Math.min(width * config.amplitudeRatio, config.amplitudeMax);
    const radius = Math.min(width * config.helixRadiusRatio, config.helixRadiusMax);
    const step = Math.max(config.minStep, height / config.stepDivisor);
    const travel = scroll * config.scrollTravel + time * config.idleTravel;
    const offset = travel % (step * config.wrapSteps);
    const forceX = cursor.x * width;
    const forceY = cursor.y * height;

    for (let i = 0; i < count; i += 1) {
      const y = (config.firstIndex + i) * step - offset;
      const phase = y * config.pathFrequency + time * config.pathSpeed + scroll * config.pathScroll;
      const broadS =
        Math.sin(phase) * amplitude +
        Math.sin(phase * config.secondaryPathRatio + config.secondaryPathPhase) * amplitude * config.secondaryPathWeight;
      const localWave = Math.sin(y * config.localWaveFrequency + time * config.localWaveSpeed) * config.localWaveAmplitude;
      const spine = baseX + broadS;
      const distance = Math.sqrt(
        Math.pow((spine - forceX) / config.forceRadiusX, 2) + Math.pow((y - forceY) / config.forceRadiusY, 2),
      );
      const force = Math.exp(-distance * distance * config.forceFalloff) * presence;
      const bend = (forceX - spine) * force * config.forceBend;
      const breath = Math.sin(y * config.breathFrequency + time * config.breathSpeed) * config.breathDepth + 1;
      const twist = y * config.twistFrequency + time * config.twistSpeed + scroll * config.twistScroll + force * config.forceTwist;
      ys[i] = y;
      centres[i] = spine + localWave + bend;
      swings[i] = Math.sin(twist) * radius * breath;
      depths[i] = Math.cos(twist);
      twists[i] = twist;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The two strands, exactly as Manus draws them.
    const strandGradients = gradients(ctx, width, height, amplitude);
    for (let strand = 0; strand < 2; strand += 1) {
      const sign = strand === 0 ? 1 : -1;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = centres[i] + swings[i] * sign;
        if (i === 0) ctx.moveTo(x, ys[i]);
        else ctx.lineTo(x, ys[i]);
      }
      ctx.strokeStyle = strandGradients[strand];
      ctx.lineWidth = config.strandWidths[strand];
      ctx.stroke();
    }

    // Depth: the half of each strand turned toward the viewer is drawn again,
    // a little brighter and wider, so the strands read as crossing in depth.
    for (let strand = 0; strand < 2; strand += 1) {
      const sign = strand === 0 ? 1 : -1;
      ctx.beginPath();
      let drawing = false;
      for (let i = 0; i < count; i += 1) {
        const front = depths[i] * sign > 0.35 && ys[i] > -20 && ys[i] < height + 20;
        const x = centres[i] + swings[i] * sign;
        if (front && !drawing) ctx.moveTo(x, ys[i]);
        else if (front) ctx.lineTo(x, ys[i]);
        drawing = front;
      }
      ctx.strokeStyle = strand === 0 ? `rgba(83, 213, 245, ${config.frontAlpha})` : `rgba(67, 125, 151, ${config.frontAlpha})`;
      ctx.lineWidth = config.strandWidths[strand] + config.frontWidth;
      ctx.stroke();
    }

    // Rungs follow the local orientation of the pair.
    ctx.lineWidth = config.rungWidth;
    // Manus draws rungs from index -144, every fifth sample.
    for (let i = config.firstRung - config.firstIndex; i < count; i += config.rungEvery) {
      const y = ys[i];
      if (y < -40 || y > height + 40) continue;
      ctx.beginPath();
      ctx.moveTo(centres[i] - swings[i], y);
      ctx.lineTo(centres[i] + swings[i], y);
      ctx.strokeStyle = `rgba(83, 213, 245, ${config.rungBaseAlpha + Math.abs(Math.sin(twists[i])) * config.rungDepthAlpha})`;
      ctx.stroke();
    }

    // A pulse passing close to the strand lights a short stretch of its edge.
    if (pulse.active) {
      const index = Math.round((pulse.y + offset) / step) - config.firstIndex;
      if (index >= 0 && index < count) {
        const gap = Math.abs(centres[index] - pulse.x);
        if (gap < config.pulseTouchRadius) {
          const strength = config.pulseTouchAlpha * pulse.fade * (1 - gap / config.pulseTouchRadius);
          const span = Math.round(config.pulseTouchSpan / step);
          for (let strand = 0; strand < 2; strand += 1) {
            const sign = strand === 0 ? 1 : -1;
            ctx.beginPath();
            for (let i = Math.max(0, index - span); i <= Math.min(count - 1, index + span); i += 1) {
              const x = centres[i] + swings[i] * sign;
              if (i === Math.max(0, index - span)) ctx.moveTo(x, ys[i]);
              else ctx.lineTo(x, ys[i]);
            }
            ctx.strokeStyle = `rgba(141, 230, 220, ${strength})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  };
}
