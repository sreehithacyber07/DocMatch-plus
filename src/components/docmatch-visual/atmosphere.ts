import { atmosphereConfig as config } from './config.ts';
import type { Scene } from './scene.ts';

/**
 * Atmospheric lighting (Manus): a wide radial aura to the right of centre and
 * three slow bezier currents across the page. Nothing here moves, so it is
 * painted once per resize onto its own canvas, beneath the animated one.
 */
export function drawAtmosphere(scene: Pick<Scene, 'ctx' | 'width' | 'height'>, alpha: number) {
  const { ctx, width, height } = scene;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const cx = width * config.auraCentre.x;
  const cy = height * config.auraCentre.y;
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * config.auraRadius);
  aura.addColorStop(0, config.auraInner);
  aura.addColorStop(1, config.auraOuter);
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = config.currentStroke;
  ctx.lineWidth = config.currentWidth;
  for (let index = 0; index < config.currentCount; index += 1) {
    ctx.beginPath();
    ctx.moveTo(-30, height * (0.25 + index * 0.25));
    ctx.bezierCurveTo(
      width * 0.3,
      height * (0.08 + index * 0.22),
      width * 0.64,
      height * (0.73 - index * 0.1),
      width + 30,
      height * (0.25 + index * 0.2),
    );
    ctx.stroke();
  }
  ctx.restore();
}
