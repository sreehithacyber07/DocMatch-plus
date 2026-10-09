import { particleConfig as config } from './config.ts';
import type { Scene } from './scene.ts';

export interface Particle {
  x: number;
  y: number;
  size: number;
  depth: number;
  phase: number;
  /** Precomputed fill, so no colour string is built per particle per frame. */
  fill: string;
}

/**
 * Sparse ambient particles (Manus). Positions are deterministic, so the field
 * is the same on every visit and on every resize. `scale` thins the field for
 * quieter contexts.
 */
export function buildParticles(width: number, height: number, scale: number): Particle[] {
  const base = Math.min(config.maxCount, Math.max(config.minCount, Math.round((width * height) / config.areaPerParticle)));
  const count = Math.max(0, Math.round(base * scale));
  return Array.from({ length: count }, (_, index) => ({
    x: ((index * 9301 + 49297) % 233280) / 233280,
    y: ((index * 4177 + 179) % 1000) / 1000,
    size: 0.45 + ((index * 13) % 8) / 11,
    depth: 0.24 + ((index * 19) % 100) / 130,
    phase: ((index * 23) % 100) / 10,
  })).map((particle) => ({
    ...particle,
    fill: `rgba(${config.rgb}, ${config.baseAlpha + particle.depth * config.depthAlpha})`,
  }));
}

export function drawParticles(scene: Scene, particles: readonly Particle[]) {
  const { ctx, width, height, time } = scene;
  if (particles.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const particle of particles) {
    const x = particle.x * width + Math.sin(time * config.speedX + particle.phase) * config.driftX;
    const y = particle.y * height + Math.cos(time * config.speedY + particle.phase) * config.driftY;
    ctx.fillStyle = particle.fill;
    ctx.beginPath();
    ctx.arc(x, y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
