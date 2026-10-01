import { useState } from 'react';
import { PageShell } from '../../components/layout';
import { GuidancePanel } from './GuidancePanel';
import { StageTrack } from './StageTrack';
import { StageWell } from './StageWell';
import { stages } from './stages';
import './orientation.css';

const PANEL_ID = 'stage-panel';
const tabId = (id: string) => `stage-tab-${id}`;

export function OrientationScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stage = stages[activeIndex];
  const criticalIndex = stages.findIndex((item) => item.register === 'critical');

  return (
    <PageShell
      surface="stage"
      stage={stage.name}
      stagePosition={{ current: activeIndex + 1, total: stages.length }}
      stages={stages.map(({ name, pictogram }) => ({ name, pictogram }))}
      onSelectStage={setActiveIndex}
      criticalIndex={criticalIndex}
      routeAnnouncement={`Stage ${activeIndex + 1} of ${stages.length}, ${stage.name}`}
    >
      <div className="orientation">
        <header className="orientation__masthead">
          <h1 className="orientation__title type-heading-1">
            The route from where it hurts to who to see
          </h1>
          <p className="orientation__lede type-body">
            DocMatch takes a place on the body and a short set of questions, and returns the
            specialty to see. Move through the stages to see what each one asks for.
          </p>
        </header>

        <div className="orientation__stage">
          <StageWell
            stage={stage}
            index={activeIndex}
            total={stages.length}
            panelId={PANEL_ID}
            labelledBy={tabId(stage.id)}
          />
          <StageTrack
            stages={stages}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            panelId={PANEL_ID}
            tabId={tabId}
          />
        </div>

        <GuidancePanel stage={stage} index={activeIndex} />

        <footer className="orientation__status">
          <p className="orientation__status-note type-caption">
            Foundation review. No clinical logic is connected to this screen.
          </p>
          <p className="orientation__status-safety type-caption">
            DocMatch routes to a specialty. It does not diagnose.
          </p>
        </footer>
      </div>
    </PageShell>
  );
}
