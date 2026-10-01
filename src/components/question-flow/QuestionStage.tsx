import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhaseShell, GlassButton } from '@components/ui';
import useAppStore from '@stores/useAppStore';
import { getQuestionSequence, calculateRouting, getNodeById } from '@utils/questionEngine';
import { QuestionCard } from './QuestionCard';
import { ProgressIndicator } from './ProgressIndicator';
import { SymptomSummary } from './SymptomSummary';

// ── Completion particle burst ─────────────────────────────────────────────────
function CompletionBurst() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 300,
      }}
    >
      {Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const dx = Math.cos(angle) * 72;
        const dy = Math.sin(angle) * 72;
        return (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              width: 8, height: 8,
              borderRadius: '50%',
              background: 'var(--cyan-neon)',
              boxShadow: '0 0 8px var(--cyan-neon)',
            }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{ scale: [0, 1, 0], x: dx, y: dy, opacity: [1, 1, 0] }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.04 }}
          />
        );
      })}
    </div>
  );
}

// ── QuestionStage ─────────────────────────────────────────────────────────────
export function QuestionStage() {
  const selectedBodyRegions = useAppStore((s) => s.selectedBodyRegions);
  const answers             = useAppStore((s) => s.answers);
  const setAnswer           = useAppStore((s) => s.setAnswer);
  const setRouting          = useAppStore((s) => s.setRouting);
  const setPhase            = useAppStore((s) => s.setPhase);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBurst, setShowBurst] = useState(false);

  // Adaptive question sequence recomputed as answers arrive
  const sequence = useMemo(
    () => getQuestionSequence(selectedBodyRegions, answers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedBodyRegions, JSON.stringify(answers)]
  );

  const safeIndex = Math.min(currentIndex, sequence.length - 1);
  const currentNodeId = sequence[safeIndex] ?? '';
  const currentNode = getNodeById(currentNodeId);
  const selectedValue = answers[currentNodeId];
  const hasAnswer = selectedValue !== undefined && selectedValue !== '';
  const isLast = safeIndex >= sequence.length - 1;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAnswer = useCallback(
    (value: string) => setAnswer(currentNodeId, value),
    [currentNodeId, setAnswer]
  );

  const handleBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleContinue = useCallback(() => {
    if (!hasAnswer) return;

    if (isLast) {
      const result = calculateRouting(answers, selectedBodyRegions);
      setRouting(result);
      setShowBurst(true);
      setTimeout(() => {
        setShowBurst(false);
        setPhase('summary');
      }, 1200);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [hasAnswer, isLast, answers, selectedBodyRegions, setRouting, setPhase]);

  // ── Keyboard support ──────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!currentNode) return;

      if (e.key === 'ArrowLeft') { handleBack(); return; }
      if (e.key === 'Enter')     { handleContinue(); return; }

      const num = parseInt(e.key, 10);
      if (isNaN(num)) return;

      if (currentNode.questionType === 'scale') {
        // 0 maps to 10
        const val = num === 0 ? 10 : num;
        if (val >= 1 && val <= 10) setAnswer(currentNodeId, String(val));
        return;
      }

      if (currentNode.questionType === 'yes_no') {
        if (num === 1) setAnswer(currentNodeId, 'yes');
        if (num === 2) setAnswer(currentNodeId, 'no');
        return;
      }

      if (currentNode.options && num >= 1 && num <= currentNode.options.length) {
        setAnswer(currentNodeId, currentNode.options[num - 1].value);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentNode, currentNodeId, handleBack, handleContinue, setAnswer]);

  // ── Expose smoke tests on window in DEV ──────────────────────────────────
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    type DevWindow = Window & {
      __engineSmokeTest__?: () => void;
      __redFlagSmokeTest__?: () => { passed: number; failed: number; failures: string[] };
    };

    import('@utils/__tests__/questionEngine.test').then(({ runEngineSmokeTest }) => {
      (window as DevWindow).__engineSmokeTest__ = runEngineSmokeTest;
    });
    import('@utils/__tests__/redFlagEngine.test').then(({ runRedFlagSmokeTest }) => {
      (window as DevWindow).__redFlagSmokeTest__ = runRedFlagSmokeTest;
    });

    return () => {
      delete (window as DevWindow).__engineSmokeTest__;
      delete (window as DevWindow).__redFlagSmokeTest__;
    };
  }, []);

  return (
    <PhaseShell phaseId="questions" variant="slide-right">
      {showBurst && <CompletionBurst />}

      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        {/* ── Left: symptom summary panel ─────────────────────────────────── */}
        <SymptomSummary
          selectedRegionIds={selectedBodyRegions}
          answers={answers}
        />

        {/* ── Right: main question area ────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px 32px 32px',
            overflowY: 'auto',
          }}
        >
          <div style={{ width: '100%', maxWidth: 600 }}>
            {/* Progress */}
            <div style={{ marginBottom: 32 }}>
              <ProgressIndicator currentIndex={safeIndex} total={sequence.length} />
            </div>

            {/* Question card */}
            <AnimatePresence mode="wait">
              {currentNode ? (
                <QuestionCard
                  key={currentNodeId}
                  node={currentNode}
                  currentIndex={safeIndex}
                  totalCount={sequence.length}
                  selectedValue={selectedValue}
                  onAnswer={handleAnswer}
                />
              ) : (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ textAlign: 'center', color: 'var(--text-secondary)' }}
                >
                  Loading questions…
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 28,
              }}
            >
              <GlassButton
                variant="ghost"
                size="md"
                disabled={safeIndex === 0}
                onClick={handleBack}
                aria-label="Go to previous question"
              >
                ← Back
              </GlassButton>

              <GlassButton
                variant="primary"
                size="md"
                disabled={!hasAnswer}
                onClick={handleContinue}
                aria-label={isLast ? 'Complete questionnaire' : 'Go to next question'}
              >
                {isLast ? 'See Results →' : 'Continue →'}
              </GlassButton>
            </div>
          </div>
        </div>
      </div>
    </PhaseShell>
  );
}
