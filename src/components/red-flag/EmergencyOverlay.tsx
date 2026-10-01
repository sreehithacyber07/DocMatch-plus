import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Navigation, UserPlus, KeyRound } from 'lucide-react';
import { GlassCard, GlassButton, ScanLine, Title, Subtitle, Body, Caption } from '@components/ui';
import { ruleById } from '@utils/redFlagEngine';
import useAppStore from '@stores/useAppStore';
import type { RedFlag } from '@/types/index';

// ── Honour prefers-reduced-motion ────────────────────────────────────────────
const prefersReduced =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// ── Staff override modal ──────────────────────────────────────────────────────
function OverrideModal({ onClose }: { onClose: () => void }) {
  const clearEmergency = useAppStore((s) => s.clearEmergency);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit() {
    if (code === '0000') {
      clearEmergency();
      onClose();
    } else {
      setError('Incorrect code. Please verify with a staff member.');
      setCode('');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Staff override"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(6,11,26,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}
    >
      <GlassCard glow="indigo" intensity="high">
        <div style={{ padding: '32px 36px', maxWidth: 340, textAlign: 'center' }}>
          <div style={{ marginBottom: 8 }}><Caption>Staff Override</Caption></div>
          <div style={{ marginBottom: 20 }}>
            <Body>Enter your 4-digit override code to clear this emergency alert.</Body>
          </div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(103,232,249,0.25)',
              borderRadius: 10, color: 'var(--text-primary)',
              fontSize: 20, textAlign: 'center', letterSpacing: '0.4em',
              outline: 'none', fontFamily: 'monospace', marginBottom: 12,
            }}
            aria-label="Override code"
          />
          {error && (
            <div style={{ color: 'var(--alert)', fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <GlassButton variant="secondary" size="sm" onClick={onClose}>Cancel</GlassButton>
            <GlassButton variant="primary" size="sm" onClick={handleSubmit}>Confirm</GlassButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Rule card ─────────────────────────────────────────────────────────────────
function RuleCard({ flag }: { flag: RedFlag }) {
  const fullRule = ruleById(flag.id);
  const isCritical = flag.severity === 'critical';

  return (
    <div
      style={{
        borderLeft: `4px solid ${isCritical ? 'var(--alert)' : 'var(--warning)'}`,
        paddingLeft: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {!isCritical && (
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--warning)', flexShrink: 0,
          }} />
        )}
        <Body>{flag.name}</Body>
      </div>
      {fullRule?.description && (
        <div style={{ marginBottom: 6 }}>
          <Caption>{fullRule.description}</Caption>
        </div>
      )}
      <div style={{ paddingLeft: 8 }}>
        <Caption>{flag.immediateAction}</Caption>
      </div>
    </div>
  );
}

// ── EmergencyOverlay ──────────────────────────────────────────────────────────
export function EmergencyOverlay() {
  const redFlags = useAppStore((s) =>
    s.redFlags.filter((f) => f.severity === 'critical' || f.severity === 'urgent')
  );

  const [showModal, setShowModal]           = useState(false);
  const [showDirectionsConfirm, setShowDC]  = useState(false);
  const [showAssistConfirm, setShowAC]      = useState(false);

  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef     = useRef<HTMLDivElement>(null);

  // Focus trap on mount
  useEffect(() => {
    primaryBtnRef.current?.focus();

    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape does NOTHING (intentional — staff override only)
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }

      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleGetDirections() {
    console.info('[EmergencyOverlay] Patient requested directions to Emergency Care');
    setShowDC(true);
    setTimeout(() => setShowDC(false), 2500);
  }

  function handleAssist() {
    console.info('[EmergencyOverlay] Staff assistance requested');
    setShowAC(true);
    setTimeout(() => setShowAC(false), 3000);
  }

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label="Urgent Medical Alert"
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      {/* Pulsing alert background */}
      {prefersReduced ? (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, var(--alert) 0%, var(--bg-primary) 70%)',
          opacity: 0.14, pointerEvents: 'none',
        }} />
      ) : (
        <motion.div
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, var(--alert) 0%, var(--bg-primary) 70%)',
            pointerEvents: 'none',
          }}
          animate={{ opacity: [0.10, 0.20, 0.10] }}
          transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
        />
      )}

      {/* Animated border frame (top + bottom ScanLines, left + right pulsing borders) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <ScanLine color="alert" />
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <ScanLine color="alert" />
      </div>
      {!prefersReduced && (
        <>
          <motion.div
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--alert)', opacity: 0.5 }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.3, ease: 'easeInOut', repeat: Infinity, delay: 0.4 }}
          />
          <motion.div
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, background: 'var(--alert)', opacity: 0.5 }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.3, ease: 'easeInOut', repeat: Infinity, delay: 0.8 }}
          />
        </>
      )}

      {/* Background PulseRings (decorative, behind card) */}
      {!prefersReduced && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ position: 'relative', width: 400, height: 400 }}>
            {[320, 240, 160].map((size, i) => (
              <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                <div style={{ opacity: 0.15 }}>
                  <motion.div
                    style={{ width: size, height: size, borderRadius: '50%', border: '1px solid var(--alert)' }}
                    animate={{ scale: [1, 1.06, 1], opacity: [0.15, 0.30, 0.15] }}
                    transition={{ duration: 2 + i * 0.5, ease: 'easeInOut', repeat: Infinity, delay: i * 0.4 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content card */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 560, width: '100%', margin: '0 24px', overflowY: 'auto', maxHeight: '90vh' }}>
        <GlassCard glow="alert" intensity="high">
          <div style={{ padding: '36px 40px' }}>

            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative' }}>
              <AlertTriangle size={64} style={{ color: 'var(--alert)', position: 'relative', zIndex: 1 }} />
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <Title glow>Urgent Medical Attention Recommended</Title>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <Subtitle>Please proceed to Emergency Care now.</Subtitle>
            </div>

            {/* Rule cards */}
            {redFlags.length > 0 && (
              <div aria-live="assertive" style={{ marginBottom: 28 }}>
                {redFlags.map((flag) => <RuleCard key={flag.id} flag={flag} />)}
              </div>
            )}

            {/* Primary action */}
            <div style={{ marginBottom: 12 }}>
              <GlassButton
                variant="alert"
                size="lg"
                icon={Navigation}
                onClick={handleGetDirections}
              >
                Get Directions to Emergency Care
              </GlassButton>
              {showDirectionsConfirm && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <Caption>Navigating to Emergency Care — please follow the signs.</Caption>
                </div>
              )}
            </div>

            {/* Secondary action */}
            <div style={{ marginBottom: 20 }}>
              <GlassButton
                variant="secondary"
                size="md"
                icon={UserPlus}
                onClick={handleAssist}
              >
                I need walking assistance
              </GlassButton>
              {showAssistConfirm && (
                <div style={{ marginTop: 8 }}>
                  <Caption>Staff has been notified. Help is on its way.</Caption>
                </div>
              )}
            </div>

            {/* Tertiary: staff override */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: 12,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 8px', borderRadius: 6,
                  transition: 'color 0.2s ease',
                  fontFamily: 'inherit',
                }}
                aria-label="Enter staff override code"
              >
                <KeyRound size={12} />
                Staff override code
              </button>
            </div>

          </div>
        </GlassCard>
      </div>

      {/* Staff override modal */}
      {showModal && <OverrideModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
