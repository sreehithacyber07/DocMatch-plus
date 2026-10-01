import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, GlassButton, PulseRing, Body } from '@components/ui';
import useAppStore from '@stores/useAppStore';

export function UrgentAlertBanner() {
  const urgentWarnings          = useAppStore((s) => s.urgentWarnings);
  const showEmergency           = useAppStore((s) => s.showEmergency);
  const acknowledgedWarningSet  = useAppStore((s) => s.acknowledgedWarningSet);
  const acknowledgeWarnings     = useAppStore((s) => s.acknowledgeWarnings);

  const currentSetKey = useMemo(
    () => urgentWarnings.map((f) => f.id).join('|'),
    [urgentWarnings]
  );

  const shouldShow =
    urgentWarnings.length > 0 &&
    !showEmergency &&
    currentSetKey !== acknowledgedWarningSet;

  const primary   = urgentWarnings[0];
  const extraCount = urgentWarnings.length - 1;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{    y: -60, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0,
            zIndex: 100,
            padding: '0 24px',
          }}
        >
          <div style={{ maxWidth: 960, margin: '0 auto', paddingTop: 8 }}>
            <GlassCard glow="warning">
              <div style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>

                {/* Amber pulse ring */}
                <div style={{ flexShrink: 0 }}>
                  <PulseRing color="warning" size={36} />
                </div>

                {/* Warning text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {primary && (
                    <Body>
                      {primary.name}
                      {extraCount > 0 && ` (+${extraCount} more)`}
                      {' — '}
                      {primary.immediateAction}
                    </Body>
                  )}
                </div>

                {/* Dismiss */}
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={acknowledgeWarnings}
                  aria-label="Acknowledge warning and dismiss banner"
                >
                  I understand
                </GlassButton>

              </div>
            </GlassCard>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
