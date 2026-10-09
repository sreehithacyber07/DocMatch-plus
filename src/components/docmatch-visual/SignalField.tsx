import { useEffect, useRef } from 'react';
import { drawAtmosphere } from './atmosphere.ts';
import { intensityConfig, motionConfig, type EnvironmentIntensity } from './config.ts';
import { createDnaRenderer } from './dna.ts';
import { createFrameGovernor, pixelRatioFor } from './frame-governor.ts';
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
 * light, and the continuous DNA, in one animation loop.
 *
 * It sits behind every surface and never takes input: the canvases have
 * pointer-events: none and the cursor is read from window pointer events. No
 * React state changes per frame; the loop reads refs. It pauses while the tab
 * is hidden. Under reduced motion it draws one still frame with no travelling
 * light and no cursor deformation, and redraws only on resize.
 *
 * Performance. Profiling showed this loop occupying most of the main thread on
 * every screen (nearly all of it at idle on a throttled phone), so taps, typing
 * and transitions waited behind it. Three changes keep it cheap without
 * changing what it shows:
 *   - the atmosphere (aura and currents) never moves, so it is painted once per
 *     resize onto its own canvas instead of refilling the screen every frame;
 *   - a frame governor paces drawing: the drift is slow enough that 30 frames a
 *     second is indistinguishable at rest, and the display rate (capped at 60)
 *     is used only while the landing scroll or cursor is still settling;
 *   - small or touch screens draw at a pixel ratio of at most 1.5, which keeps
 *     the faint hairlines crisp with far fewer pixels to fill.
 */
export function SignalField({ intensity, offset = 0, reducedMotion }: SignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const atmosphereRef = useRef<HTMLCanvasElement | null>(null);
  const intensityRef = useRef(intensity);
  const offsetRef = useRef(offset);
  const repaintAtmosphereRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    intensityRef.current = intensity;
    repaintAtmosphereRef.current();
  }, [intensity]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const atmosphereCanvas = atmosphereRef.current;
    const atmosphereCtx = atmosphereCanvas?.getContext('2d');
    if (!canvas || !ctx || !atmosphereCanvas || !atmosphereCtx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let particles: Particle[] = [];
    let particleScale = -1;
    let smoothScroll = window.scrollY + offsetRef.current;
    let focusX = 0.78;
    let anchors: { at: number; x: number }[] = [];
    let atmosphereAlpha = -1;
    const cursor = { x: 0.76, y: 0.48, tx: 0.76, ty: 0.48 };
    let presence = 0;
    let presenceTarget = 0;
    const scheduler = createPulseScheduler();
    const drawDNA = createDnaRenderer();
    const governor = createFrameGovernor();
    const started = performance.now();

    const refreshAnchors = () => {
      anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-dna-anchor]')).map((element) => ({
        at: element.getBoundingClientRect().top + window.scrollY + element.offsetHeight / 2,
        x: Number(element.dataset.dnaX) || 0.5,
      }));
    };

    const paintAtmosphere = () => {
      const alpha = intensityConfig[intensityRef.current].aura;
      if (alpha === atmosphereAlpha) return;
      atmosphereAlpha = alpha;
      atmosphereCtx.clearRect(0, 0, width, height);
      drawAtmosphere({ ctx: atmosphereCtx, width, height }, alpha);
    };
    repaintAtmosphereRef.current = paintAtmosphere;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const ratio = pixelRatioFor(window.devicePixelRatio || 1, width, coarse);
      for (const [target, context] of [[canvas, ctx], [atmosphereCanvas, atmosphereCtx]] as const) {
        target.width = Math.round(width * ratio);
        target.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      particleScale = -1;
      atmosphereAlpha = -1;
      paintAtmosphere();
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
      // Each easing is compounded over the 60 fps frames since the last drawn
      // one, so a paced frame settles exactly as fast as the original loop.
      const ease = governor.easing(now);
      cursor.x += (cursor.tx - cursor.x) * ease(motionConfig.cursorEase);
      cursor.y += (cursor.ty - cursor.y) * ease(motionConfig.cursorEase);
      presence += ((reducedMotion ? 0 : presenceTarget) - presence) * ease(motionConfig.presenceEase);
      const targetScroll = window.scrollY + offsetRef.current;
      smoothScroll += (targetScroll - smoothScroll) * (reducedMotion ? 1 : ease(motionConfig.scrollEase));
      focusX += (storyFocus() - focusX) * (reducedMotion ? 1 : ease(0.055));

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
      drawParticles(scene, particles);
      const pulse = drawSignalWaves(scene, scheduler, level.waves, !reducedMotion);
      drawDNA(scene, level.dna, pulse);
    };

    const loop = (now: number) => {
      frame = 0;
      if (reducedMotion || document.hidden) return;
      const settling =
        intensityRef.current === 'landing' &&
        (Math.abs(window.scrollY + offsetRef.current - smoothScroll) > 0.5 ||
          Math.abs(cursor.tx - cursor.x) > 0.001 ||
          Math.abs(cursor.ty - cursor.y) > 0.001);
      if (governor.due(now, settling)) draw(now);
      frame = requestAnimationFrame(loop);
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
      frame = 0;
      if (!document.hidden && !reducedMotion) {
        governor.reset();
        frame = requestAnimationFrame(loop);
      }
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
    if (reducedMotion) draw(performance.now());
    else frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      repaintAtmosphereRef.current = () => undefined;
      window.removeEventListener('resize', redraw);
      window.removeEventListener('pointermove', pointerMove);
      document.documentElement.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reducedMotion]);

  return (
    <>
      <canvas ref={atmosphereRef} className="docmatch-signal-field docmatch-signal-field--atmosphere" aria-hidden="true" />
      <canvas ref={canvasRef} className="docmatch-signal-field" aria-hidden="true" />
    </>
  );
}
