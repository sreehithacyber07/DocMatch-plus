import { useEffect, useRef } from 'react';
import { drawAtmosphere } from './atmosphere.ts';
import { intensityConfig, motionConfig, type EnvironmentIntensity } from './config.ts';
import { createDnaRenderer } from './dna.ts';
import { buildParticles, drawParticles, type Particle } from './particles.ts';
import type { Scene } from './scene.ts';
import { createPulseScheduler, drawSignalWaves } from './signal-waves.ts';

export interface SignalFieldProps {
  intensity: EnvironmentIntensity;
  /** Extra travel along the strand, in pixels, so a stage change moves the DNA on. */
  offset?: number;
  reducedMotion: boolean;
}

/**
 * The ambient canvas: atmosphere, particles, signal waves with one travelling
 * light, and the continuous DNA, all in one canvas and one animation loop.
 *
 * It sits behind every surface and never takes input: the canvas has
 * pointer-events: none and the cursor is read from window pointer events. No
 * React state changes per frame; the loop reads refs. It pauses while the tab
 * is hidden. Under reduced motion it draws one still frame with no travelling
 * light and no cursor deformation, and redraws only on resize.
 */
export function SignalField({ intensity, offset = 0, reducedMotion }: SignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intensityRef = useRef(intensity);
  const offsetRef = useRef(offset);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let particles: Particle[] = [];
    let particleScale = -1;
    let smoothScroll = window.scrollY + offsetRef.current;
    let focusX = 0.78;
    let anchors: { at: number; x: number }[] = [];
    const cursor = { x: 0.76, y: 0.48, tx: 0.76, ty: 0.48 };
    let presence = 0;
    let presenceTarget = 0;
    const scheduler = createPulseScheduler();
    const drawDNA = createDnaRenderer();
    const started = performance.now();

    const refreshAnchors = () => {
      anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-dna-anchor]')).map((element) => ({
        at: element.getBoundingClientRect().top + window.scrollY + element.offsetHeight / 2,
        x: Number(element.dataset.dnaX) || 0.5,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, motionConfig.maxPixelRatio);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      particleScale = -1;
      refreshAnchors();
    };

    const storyFocus = () => {
      if (!anchors.length) return 0.5;
      if (reducedMotion) return width <= motionConfig.smallScreen ? 0.86 : 0.78;
      if (width <= motionConfig.smallScreen) return 0.86;
      const position = window.scrollY + height / 2;
      const next = anchors.findIndex((anchor) => anchor.at >= position);
      const raw = next < 0 ? anchors[anchors.length - 1].x : next === 0 ? anchors[0].x : (() => {
        const previous = anchors[next - 1];
        const following = anchors[next];
        const progress = Math.max(0, Math.min(1, (position - previous.at) / (following.at - previous.at)));
        const eased = progress * progress * (3 - 2 * progress);
        return previous.x + (following.x - previous.x) * eased;
      })();
      return width <= 1024 ? 0.5 + (raw - 0.5) * 0.58 : raw;
    };

    const draw = (now: number) => {
      const level = intensityConfig[intensityRef.current];
      if (particleScale !== level.particles) {
        particleScale = level.particles;
        particles = buildParticles(width, height, reducedMotion ? level.particles * 0.5 : level.particles);
      }
      const time = reducedMotion ? 0 : (now - started) / 1000;
      cursor.x += (cursor.tx - cursor.x) * motionConfig.cursorEase;
      cursor.y += (cursor.ty - cursor.y) * motionConfig.cursorEase;
      presence += ((reducedMotion ? 0 : presenceTarget) - presence) * motionConfig.presenceEase;
      const targetScroll = window.scrollY + offsetRef.current;
      smoothScroll += (targetScroll - smoothScroll) * (reducedMotion ? 1 : motionConfig.scrollEase);
      focusX += (storyFocus() - focusX) * (reducedMotion ? 1 : 0.055);

      const scene: Scene = {
        ctx,
        width,
        height,
        time,
        scroll: smoothScroll,
        focusX,
        story: anchors.length > 0,
        cursor,
        presence,
        small: width <= motionConfig.smallScreen,
      };
      ctx.clearRect(0, 0, width, height);
      drawAtmosphere(scene, level.aura);
      drawParticles(scene, particles);
      const pulse = drawSignalWaves(scene, scheduler, level.waves, !reducedMotion);
      drawDNA(scene, level.dna, pulse);

      if (!reducedMotion && !document.hidden) frame = requestAnimationFrame(draw);
    };

    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cursor.tx = event.clientX / Math.max(1, width);
      cursor.ty = event.clientY / Math.max(1, height);
      presenceTarget = 1;
    };
    const pointerLeave = () => {
      presenceTarget = 0;
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const redraw = () => {
      resize();
      if (reducedMotion) draw(performance.now());
    };

    resize();
    document.fonts?.ready.then(refreshAnchors).catch(() => {});
    window.addEventListener('resize', redraw);
    window.addEventListener('pointermove', pointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', pointerLeave);
    document.addEventListener('visibilitychange', visibility);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', redraw);
      window.removeEventListener('pointermove', pointerMove);
      document.documentElement.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="docmatch-signal-field" aria-hidden="true" />;
}
