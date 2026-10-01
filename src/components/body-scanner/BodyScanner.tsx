import { useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  AnimatedBackground,
  DevPhaseSwitcher,
  PhaseShell,
  GlassCard,
  GlassButton,
  Title,
  Subtitle,
  Caption,
} from '@components/ui';
import useAppStore, { type Phase } from '@stores/useAppStore';
import { BodyScanStage } from './BodyScanStage';
import { QuestionStage } from '@components/question-flow';
import { EmergencyStage } from '@components/red-flag';

// ── Simple placeholder for phases not yet implemented ────────────────────────
function PlaceholderStage({ phaseId, label }: { phaseId: Phase; label: string }) {
  const setPhase = useAppStore((s) => s.setPhase);
  return (
    <PhaseShell phaseId={phaseId} variant="slide-up">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GlassCard glow="indigo" className="px-10 py-10 text-center">
          <div style={{ marginBottom: 12 }}><Caption>{label}</Caption></div>
          <GlassButton variant="ghost" size="sm" onClick={() => setPhase('body-scan')}>
            ← Body Scan
          </GlassButton>
        </GlassCard>
      </div>
    </PhaseShell>
  );
}

// ── Welcome stage ─────────────────────────────────────────────────────────────
function WelcomeStage() {
  const setPhase = useAppStore((s) => s.setPhase);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Read preference synchronously so autoPlay attr is correct on first render
  const prefersReducedRef = useRef(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) video.pause();
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) video.pause();
      else video.play().catch(() => {});
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <PhaseShell phaseId="welcome" variant="fade">
      {/* Full-bleed hero video — behind all content */}
      <video
        ref={videoRef}
        autoPlay={!prefersReducedRef.current}
        muted
        loop
        playsInline
        poster="/hero-poster.jpg"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
          display: 'block',
        }}
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      {/* Dark blue gradient overlay for text readability */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background:
            'linear-gradient(to bottom, rgba(6,11,26,0.65) 0%, rgba(6,11,26,0.40) 50%, rgba(6,11,26,0.70) 100%)',
        }}
      />

      {/* Hero content — sits above video and overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GlassCard glow="cyan" className="px-12 py-14 text-center">
          <div style={{ marginBottom: 12 }}><Title>DocMatch+</Title></div>
          <div style={{ marginBottom: 36 }}><Subtitle>Your AI health navigator</Subtitle></div>
          <GlassButton variant="primary" size="lg" onClick={() => setPhase('body-scan')}>
            Start Body Scan
          </GlassButton>
        </GlassCard>
      </div>
    </PhaseShell>
  );
}

// ── Top-level app shell — Phase router + global chrome ───────────────────────
export function BodyScanner() {
  const currentPhase = useAppStore((s) => s.currentPhase);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Global animated background — mounts ONCE, never re-mounts on phase change */}
      <AnimatedBackground />

      {/* Phase router — AnimatePresence waits for exit before entering next */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <AnimatePresence mode="wait">
          {currentPhase === 'welcome' && <WelcomeStage key="welcome" />}
          {currentPhase === 'body-scan' && <BodyScanStage key="body-scan" />}
          {currentPhase === 'questions' && <QuestionStage key="questions" />}
          {currentPhase === 'comfort' && (
            <PlaceholderStage key="comfort" phaseId="comfort" label="Comfort" />
          )}
          {currentPhase === 'summary' && (
            <PlaceholderStage key="summary" phaseId="summary" label="Summary" />
          )}
          {currentPhase === 'emergency' && <EmergencyStage key="emergency" />}
        </AnimatePresence>
      </div>

      {/* Dev phase switcher — only visible in development */}
      <DevPhaseSwitcher />
    </div>
  );
}
