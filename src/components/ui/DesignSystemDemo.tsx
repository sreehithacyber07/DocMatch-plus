import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Activity, Shield, Heart, AlertTriangle } from 'lucide-react';
import { AnimatedBackground } from './AnimatedBackground';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { ScanLine } from './ScanLine';
import { PulseRing } from './PulseRing';
import { Title, Subtitle, Body, Caption, DataText } from './Typography';
import { ProgressBar } from './ProgressBar';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay },
  };
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: '64px' }}>
      <Caption>{label}</Caption>
      <div style={{ marginTop: '16px' }}>{children}</div>
    </section>
  );
}

export function DesignSystemDemo() {
  return (
    <div style={{ minHeight: '100vh', color: 'var(--text-primary)' }}>
      <AnimatedBackground />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '48px 32px 96px',
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        {/* ── Header ── */}
        <motion.header
          {...fadeUp(0)}
          style={{ textAlign: 'center', marginBottom: '80px' }}
        >
          <Caption>DocMatch+ · Design System</Caption>
          <div style={{ margin: '16px 0 12px' }}>
            <Title glow>Glassmorphism UI</Title>
          </div>
          <Subtitle>Phase 1 — Primitive Components</Subtitle>
          <div style={{ marginTop: '10px' }}>
            <DataText glow>build: 2025.phase1 · 8 primitives · 60fps</DataText>
          </div>
        </motion.header>

        {/* ── Typography Scale ── */}
        <motion.div {...fadeUp(0.08)}>
          <Section label="Typography Scale">
            <GlassCard>
              <div
                style={{
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                <div>
                  <Caption>heading-1</Caption>
                  <div style={{ marginTop: '6px' }}>
                    <Title>Diagnose with confidence</Title>
                  </div>
                </div>
                <div>
                  <Caption>heading-2</Caption>
                  <div style={{ marginTop: '6px' }}>
                    <Subtitle>Patient symptom analysis powered by AI</Subtitle>
                  </div>
                </div>
                <div>
                  <Caption>body</Caption>
                  <div style={{ marginTop: '6px' }}>
                    <Body>
                      DocMatch+ routes patients to the right specialist using
                      symptom mapping, vital signs, and medical history. Our
                      confidence engine factors severity, duration, and risk.
                    </Body>
                  </div>
                </div>
                <div>
                  <Caption>caption</Caption>
                  <div style={{ marginTop: '6px' }}>
                    <Caption>Last updated · 2 mins ago · Session active</Caption>
                  </div>
                </div>
                <div>
                  <Caption>data-text</Caption>
                  <div style={{ marginTop: '6px' }}>
                    <DataText glow>
                      confidence: 94.7% · severity: moderate · HR: 72 bpm · temp: 37.2°C
                    </DataText>
                  </div>
                </div>
              </div>
            </GlassCard>
          </Section>
        </motion.div>

        {/* ── Glass Cards ── */}
        <motion.div {...fadeUp(0.16)}>
          <Section label="Glass Cards — Glow Variants">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              <GlassCard glow="indigo" hover>
                <div style={{ padding: '24px' }}>
                  <Subtitle>Indigo</Subtitle>
                  <div style={{ marginTop: '8px' }}>
                    <Body>Primary interaction — hover to intensify glow</Body>
                  </div>
                </div>
              </GlassCard>
              <GlassCard glow="cyan" hover>
                <div style={{ padding: '24px' }}>
                  <Subtitle>Cyan</Subtitle>
                  <div style={{ marginTop: '8px' }}>
                    <Body>Data and diagnostic information</Body>
                  </div>
                </div>
              </GlassCard>
              <GlassCard glow="success" hover>
                <div style={{ padding: '24px' }}>
                  <Subtitle>Success</Subtitle>
                  <div style={{ marginTop: '8px' }}>
                    <Body>Positive health outcomes and results</Body>
                  </div>
                </div>
              </GlassCard>
              <GlassCard glow="alert" hover>
                <div style={{ padding: '24px' }}>
                  <Subtitle>Alert</Subtitle>
                  <div style={{ marginTop: '8px' }}>
                    <Body>Red flags and urgent cases</Body>
                  </div>
                </div>
              </GlassCard>
              <GlassCard intensity="high">
                <div style={{ padding: '24px' }}>
                  <Subtitle>High Intensity</Subtitle>
                  <div style={{ marginTop: '8px' }}>
                    <Body>Elevated glass opacity for emphasis</Body>
                  </div>
                </div>
              </GlassCard>
            </div>
          </Section>
        </motion.div>

        {/* ── Buttons ── */}
        <motion.div {...fadeUp(0.24)}>
          <Section label="Buttons — Variants, Sizes &amp; States">
            <GlassCard>
              <div
                style={{
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '28px',
                }}
              >
                <div>
                  <Caption>All variants (md)</Caption>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginTop: '12px',
                    }}
                  >
                    <GlassButton variant="primary" icon={Activity}>
                      Primary
                    </GlassButton>
                    <GlassButton variant="secondary" icon={Shield}>
                      Secondary
                    </GlassButton>
                    <GlassButton variant="ghost" icon={Heart}>
                      Ghost
                    </GlassButton>
                    <GlassButton variant="alert" icon={AlertTriangle}>
                      Alert
                    </GlassButton>
                  </div>
                </div>
                <div>
                  <Caption>Size scale (primary)</Caption>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '12px',
                      marginTop: '12px',
                    }}
                  >
                    <GlassButton variant="primary" size="sm">
                      Small
                    </GlassButton>
                    <GlassButton variant="primary" size="md">
                      Medium
                    </GlassButton>
                    <GlassButton variant="primary" size="lg">
                      Large
                    </GlassButton>
                  </div>
                </div>
                <div>
                  <Caption>Disabled state</Caption>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginTop: '12px',
                    }}
                  >
                    <GlassButton variant="primary" disabled>
                      Primary Disabled
                    </GlassButton>
                    <GlassButton variant="secondary" disabled>
                      Secondary Disabled
                    </GlassButton>
                    <GlassButton variant="alert" disabled icon={AlertTriangle}>
                      Alert Disabled
                    </GlassButton>
                  </div>
                </div>
              </div>
            </GlassCard>
          </Section>
        </motion.div>

        {/* ── Scan Lines ── */}
        <motion.div {...fadeUp(0.32)}>
          <Section label="Scan Lines">
            <GlassCard>
              <div
                style={{
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                {(['cyan', 'indigo', 'purple', 'alert'] as const).map((c) => (
                  <div key={c}>
                    <Caption>{c}</Caption>
                    <div style={{ marginTop: '10px' }}>
                      <ScanLine color={c} />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </Section>
        </motion.div>

        {/* ── Pulse Rings ── */}
        <motion.div {...fadeUp(0.40)}>
          <Section label="Pulse Rings">
            <GlassCard>
              <div
                style={{
                  padding: '40px 32px',
                  display: 'flex',
                  gap: '56px',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                {(['cyan', 'indigo', 'purple', 'alert'] as const).map((c) => (
                  <div
                    key={c}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <PulseRing color={c} size={80} />
                    <Caption>{c}</Caption>
                  </div>
                ))}
              </div>
            </GlassCard>
          </Section>
        </motion.div>

        {/* ── Progress Bars ── */}
        <motion.div {...fadeUp(0.48)}>
          <Section label="Progress Bars">
            <GlassCard>
              <div
                style={{
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px',
                }}
              >
                <div>
                  <Caption>Cyan — 65% (animated)</Caption>
                  <div style={{ marginTop: '14px' }}>
                    <ProgressBar value={65} color="cyan" animated />
                  </div>
                </div>
                <div>
                  <Caption>Indigo — 82%</Caption>
                  <div style={{ marginTop: '14px' }}>
                    <ProgressBar value={82} color="indigo" animated />
                  </div>
                </div>
                <div>
                  <Caption>Success — 91%</Caption>
                  <div style={{ marginTop: '14px' }}>
                    <ProgressBar value={91} color="success" animated />
                  </div>
                </div>
                <div>
                  <Caption>Alert — 34%</Caption>
                  <div style={{ marginTop: '14px' }}>
                    <ProgressBar value={34} color="alert" animated />
                  </div>
                </div>
                <div>
                  <Caption>Purple — 55% (large track)</Caption>
                  <div style={{ marginTop: '14px' }}>
                    <ProgressBar value={55} color="purple" size="lg" animated />
                  </div>
                </div>
              </div>
            </GlassCard>
          </Section>
        </motion.div>
      </div>
    </div>
  );
}
