import { useRef, useEffect } from 'react';

export interface AnimatedBackgroundProps {
  className?: string;
}

interface Rgb { r: number; g: number; b: number }

interface Particle {
  x: number;
  y: number;
  size: number;
  vy: number;
  vx: number;
  period: number;
  phase: number;
  colorIndex: number;
}

function resolveColor(varName: string): Rgb {
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 99, g: 102, b: 241 };
}

function AmbientParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const count = isMobile ? 18 : 35;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const colors: Rgb[] = [
      resolveColor('--cyan-neon'),
      resolveColor('--indigo-soft'),
      resolveColor('--purple'),
    ];

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 1 + Math.random() * 1.5,
      vy: -(4 + Math.random() * 6),
      vx: (Math.random() - 0.5) * 4,
      period: 4 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
      colorIndex: Math.floor(Math.random() * 3),
    }));

    let rafId = 0;
    let stopped = false;
    let lastTime = performance.now();

    const draw = (now: number) => {
      if (stopped) return;

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      ctx.clearRect(0, 0, W, H);
      ctx.shadowBlur = 6;

      for (const p of particles) {
        p.y += p.vy * dt;
        p.x += p.vx * dt;

        if (p.y < -p.size) {
          p.y = H + p.size;
          p.x = Math.random() * W;
        }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;

        const t = now / 1000;
        const opacity = 0.2 + 0.25 * (1 + Math.sin((2 * Math.PI * t) / p.period + p.phase));
        const rgb = colors[p.colorIndex];

        ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`;
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      rafId = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        lastTime = performance.now();
        rafId = requestAnimationFrame(draw);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    rafId = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, pointerEvents: 'none' }}
    />
  );
}

export function AnimatedBackground({ className }: AnimatedBackgroundProps) {
  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(160deg, var(--bg-deep) 0%, var(--bg-primary) 55%, var(--bg-light) 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Indigo orb — drifts top-left toward bottom-right */}
      <div
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          top: '-120px',
          left: '-80px',
          animation: 'orbDriftIndigo 20s ease-in-out infinite',
          willChange: 'transform',
        }}
      />
      {/* Cyan orb — drifts bottom-left toward top-right */}
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)',
          bottom: '-80px',
          left: '-60px',
          animation: 'orbDriftCyan 25s ease-in-out infinite',
          willChange: 'transform',
        }}
      />
      {/* Purple orb — pulses scale(1)→scale(1.2) */}
      <div
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          top: '35%',
          right: '5%',
          animation: 'orbPulse 15s ease-in-out infinite',
          willChange: 'transform',
        }}
      />
      {/* Dot grid — faint 40px pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle, rgba(99,102,241,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Ambient particles — canvas, zIndex:1, above grid, below vignette */}
      <AmbientParticles />
      {/* Vignette — zIndex:2, above particles */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(6,11,26,0.8) 100%)',
        }}
      />
      {/* SVG noise grain — zIndex:3, topmost */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.04,
          zIndex: 3,
        }}
      >
        <filter id="docmatch-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.75"
            numOctaves={4}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#docmatch-noise)" />
      </svg>
    </div>
  );
}
