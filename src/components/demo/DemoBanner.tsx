import { DEMO_BANNER_DETAIL, DEMO_BANNER_TITLE } from './demo-copy.ts';
import './demo-banner.css';

/**
 * The research-prototype notice, shown on every route of a demonstration
 * build (persistence/config.ts, isDemoBuild). It sits above the app in the
 * normal flow so it never covers a control. The notice is not the safeguard:
 * the same flag disables persistence and the clinical workspace in code.
 */
export function DemoBanner() {
  return (
    <aside className="demo-banner" role="note" aria-label="Research prototype notice">
      <p className="demo-banner__title">{DEMO_BANNER_TITLE}</p>
      <p className="demo-banner__detail">{DEMO_BANNER_DETAIL}</p>
    </aside>
  );
}
