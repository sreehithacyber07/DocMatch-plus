import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, GlassButton, ScanLine, Title, Caption, PulseRing } from '@components/ui';
import type { DecisionNode, QuestionCategory } from '@/types/index';

// ── Category → visual mapping ─────────────────────────────────────────────────
// Using the four available ScanLine / GlassCard colour tokens.
const CATEGORY_GLOW: Record<QuestionCategory, 'indigo' | 'cyan' | 'alert'> = {
  pain:       'indigo',
  severity:   'indigo',
  emergency:  'alert',
  nature:     'cyan',
  duration:   'cyan',
  associated: 'cyan',
  history:    'indigo',
  lifestyle:  'cyan',
};

const CATEGORY_SCAN: Record<QuestionCategory, 'indigo' | 'cyan' | 'alert'> = {
  pain:       'indigo',
  severity:   'indigo',
  emergency:  'alert',
  nature:     'cyan',
  duration:   'cyan',
  associated: 'cyan',
  history:    'indigo',
  lifestyle:  'cyan',
};

export interface QuestionCardProps {
  node: DecisionNode;
  currentIndex: number;
  totalCount: number;
  selectedValue?: string;
  onAnswer: (value: string) => void;
}

// Scale 1-10 gradient: low=indigo mid=cyan high=alert
function scaleColor(n: number): string {
  if (n <= 3) return 'var(--indigo-soft)';
  if (n <= 6) return 'var(--cyan-neon)';
  return 'var(--alert)';
}

// Brief screen flash on answer selection
function FlashOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0.05 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0,
            background: 'var(--cyan-neon)',
            pointerEvents: 'none',
            zIndex: 200,
          }}
        />
      )}
    </AnimatePresence>
  );
}

export function QuestionCard({
  node,
  currentIndex,
  totalCount,
  selectedValue,
  onAnswer,
}: QuestionCardProps) {
  const [flash, setFlash] = useState(false);
  const glow = CATEGORY_GLOW[node.category];
  const scanColor = CATEGORY_SCAN[node.category];

  function handleSelect(value: string) {
    onAnswer(value);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  }

  // Answer area by question type -------------------------------------------
  function renderAnswers() {
    if (node.questionType === 'yes_no') {
      return (
        <div
          role="radiogroup"
          aria-label="Answer options"
          style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}
        >
          {(['yes', 'no'] as const).map((val, i) => (
            <motion.div
              key={val}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              style={{ position: 'relative' }}
            >
              {selectedValue === val && (
                <div style={{ position: 'absolute', inset: -8, pointerEvents: 'none', zIndex: 0 }}>
                  <PulseRing color={glow === 'alert' ? 'alert' : 'indigo'} size={40} />
                </div>
              )}
              <GlassButton
                variant={selectedValue === val ? 'primary' : 'secondary'}
                size="lg"
                onClick={() => handleSelect(val)}
              >
                {val === 'yes' ? 'Yes' : 'No'}
              </GlassButton>
            </motion.div>
          ))}
        </div>
      );
    }

    if (node.questionType === 'scale') {
      const nums = Array.from({ length: 10 }, (_, i) => i + 1);
      return (
        <div>
          {/* Gradient track */}
          <div style={{
            height: 4, borderRadius: 2, marginBottom: 20,
            background: 'linear-gradient(90deg, var(--indigo) 0%, var(--cyan-neon) 50%, var(--alert) 100%)',
            opacity: 0.35,
          }} />
          <div
            role="radiogroup"
            aria-label="Pain scale 1 to 10"
            style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            {nums.map((n, i) => {
              const val = String(n);
              const isSelected = selectedValue === val;
              return (
                <motion.div
                  key={n}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                >
                  <button
                    aria-label={`Pain level ${n}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelect(val)}
                    style={{
                      width: 44, height: 44,
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? scaleColor(n) : 'rgba(255,255,255,0.15)'}`,
                      background: isSelected ? `${scaleColor(n)}26` : 'transparent',
                      color: isSelected ? scaleColor(n) : 'var(--text-secondary)',
                      fontSize: 15,
                      fontWeight: isSelected ? 700 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    {n}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      );
    }

    if (node.questionType === 'single_select') {
      return (
        <div
          role="radiogroup"
          aria-label="Answer options"
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {(node.options ?? []).map((opt, i) => (
            <motion.div
              key={opt.value}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <GlassButton
                variant={selectedValue === opt.value ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </GlassButton>
            </motion.div>
          ))}
        </div>
      );
    }

    // mcq — vertical stack
    return (
      <div
        role="radiogroup"
        aria-label="Answer options"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {(node.options ?? []).map((opt, i) => (
          <motion.div
            key={opt.value}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <GlassButton
              variant={selectedValue === opt.value ? 'primary' : 'secondary'}
              size="md"
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </GlassButton>
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <>
      <FlashOverlay visible={flash} />

      <AnimatePresence mode="wait">
        <motion.div
          key={node.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%' }}
          aria-live="polite"
        >
          <GlassCard glow={glow} intensity="high">
            <div style={{ padding: '32px 36px' }}>
              {/* Header row */}
              <div style={{ marginBottom: 12 }}>
                <Caption>Question {currentIndex + 1} of {totalCount}</Caption>
              </div>
              <div style={{ marginBottom: 20 }}>
                <ScanLine color={scanColor} />
              </div>

              {/* Question text */}
              <div style={{ marginBottom: 32 }}>
                <Title glow>{node.question}</Title>
              </div>

              {/* Answer area */}
              {renderAnswers()}
            </div>
          </GlassCard>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
