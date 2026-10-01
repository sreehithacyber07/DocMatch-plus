import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GlassCard, Caption, DataText } from '@components/ui';
import { bodyRegions } from '@data/bodyRegions';
import { calculateRouting, getNodeById } from '@utils/questionEngine';
import useAppStore from '@stores/useAppStore';

export interface SymptomSummaryProps {
  selectedRegionIds: string[];
  answers: Record<string, string>;
}

export function SymptomSummary({ selectedRegionIds, answers }: SymptomSummaryProps) {
  const [collapsed, setCollapsed] = useState(false);
  const storeRegions = useAppStore((s) => s.selectedBodyRegions);

  // Routing preview — recomputed only when answers/regions change
  const routingPreview = useMemo(() => {
    const allRegions = [...new Set([...selectedRegionIds, ...storeRegions])];
    if (Object.keys(answers).length === 0) return null;
    const result = calculateRouting(answers, allRegions);
    return result.confidence >= 40 ? result : null;
  }, [answers, selectedRegionIds, storeRegions]);

  const answeredEntries = Object.entries(answers).filter(
    ([, v]) => v !== undefined && v !== ''
  );

  return (
    <motion.div
      animate={{ width: collapsed ? 48 : 280 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Collapse toggle */}
      <button
        aria-label={collapsed ? 'Expand symptom summary' : 'Collapse symptom summary'}
        onClick={() => setCollapsed((c) => !c)}
        style={{
          position: 'absolute',
          top: 20,
          right: collapsed ? 6 : 10,
          zIndex: 10,
          background: 'rgba(10,14,39,0.7)',
          border: '1px solid rgba(103,232,249,0.25)',
          borderRadius: 8,
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--cyan-neon)',
          padding: 0,
          transition: 'background 0.2s ease',
        }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100%', overflowY: 'auto', padding: '16px 12px' }}
          >
            <GlassCard intensity="high">
              <div style={{ padding: '16px 16px 20px' }}>

                {/* Header */}
                <div style={{ marginBottom: 16, paddingTop: 8 }}>
                  <Caption>Symptom Summary</Caption>
                </div>

                {/* Selected body regions */}
                {selectedRegionIds.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Caption>Selected regions</Caption>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedRegionIds.map((rId) => {
                        const region = bodyRegions.find((r) => r.id === rId);
                        if (!region) return null;
                        return (
                          <motion.div
                            key={rId}
                            layoutId={`region-${rId}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            <div
                              style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: region.color,
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                              {region.label}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Divider */}
                {selectedRegionIds.length > 0 && answeredEntries.length > 0 && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />
                )}

                {/* Answered questions */}
                {answeredEntries.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ marginBottom: 4 }}>
                      <Caption>Answers</Caption>
                    </div>
                    <AnimatePresence initial={false}>
                      {answeredEntries.map(([qId, val]) => {
                        const node = getNodeById(qId);
                        const shortQ = node
                          ? node.question.split('?')[0].replace(/^(How|Are|Do|Did|Have|What|On a scale).{0,8}/, '').trim()
                          : qId;
                        return (
                          <motion.div
                            key={qId}
                            layoutId={`answer-${qId}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            style={{ borderLeft: '2px solid rgba(103,232,249,0.2)', paddingLeft: 10 }}
                          >
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2, lineHeight: 1.3 }}>
                              {shortQ || qId}
                            </div>
                            <DataText>{val}</DataText>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}

                {/* Routing preview */}
                {routingPreview && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        <Caption>Likely specialist</Caption>
                      </div>
                      <DataText>{routingPreview.recommendedSpecialist}</DataText>
                      {/* Confidence mini-gauge */}
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          height: 4,
                          borderRadius: 2,
                          background: 'rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                        }}>
                          <motion.div
                            style={{ height: '100%', background: 'var(--cyan-neon)', borderRadius: 2 }}
                            initial={{ width: 0 }}
                            animate={{ width: `${routingPreview.confidence}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                          />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {routingPreview.confidence}% confidence
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
