import type { ReactNode } from 'react';
import { SpineRail, type SpineRailProps } from './SpineRail';
import './layout.css';

export interface PageShellProps {
  children: ReactNode;
  stage: SpineRailProps['stage'];
  stagePosition?: SpineRailProps['stagePosition'];
  stages?: SpineRailProps['stages'];
  onSelectStage?: SpineRailProps['onSelectStage'];
  criticalIndex?: SpineRailProps['criticalIndex'];
  routeAnnouncement?: string;
  mainId?: string;
  /**
   * "document" keeps the reading measure for text-led screens.
   * "stage" releases it so a screen can own the full working area.
   */
  surface?: 'document' | 'stage';
}

export function PageShell({
  children,
  stage,
  stagePosition,
  stages,
  onSelectStage,
  criticalIndex,
  routeAnnouncement,
  mainId = 'main-content',
  surface = 'document',
}: PageShellProps) {
  return (
    <div className="page-shell" data-emission="foundation" data-surface={surface}>
      <a className="page-shell__skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <SpineRail
        stage={stage}
        stagePosition={stagePosition}
        stages={stages}
        onSelectStage={onSelectStage}
        criticalIndex={criticalIndex}
      />
      <main className="page-shell__main" id={mainId} tabIndex={-1}>
        <div className="page-shell__announcement" aria-live="polite" aria-atomic="true">
          {routeAnnouncement}
        </div>
        {children}
      </main>
    </div>
  );
}
