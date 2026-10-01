import { PhaseShell } from '@components/ui';
import { EmergencyOverlay } from './EmergencyOverlay';

export function EmergencyStage() {
  return (
    <PhaseShell phaseId="emergency" variant="zoom-in">
      <EmergencyOverlay />
    </PhaseShell>
  );
}
