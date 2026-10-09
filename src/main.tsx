import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { EntryScreen } from './screens/entry/EntryScreen';
import { RouteErrorScreen } from './screens/not-found/RouteErrorScreen.tsx';
import { loadRouteScreen } from './screens/route/load-route-screen.ts';
import { DemoBanner } from './components/demo/DemoBanner.tsx';
import { isDemoBuild } from './features/persistence/config.ts';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found.');

// A direct load of /route starts its chunk now instead of after the router boots.
if (window.location.pathname === '/route') void loadRouteScreen();

/**
 * "/" is the cinematic entrance layered over the frozen R0 orientation screen.
 * "/route" is the R4 body and routing experience.
 * "/staff" is the care-team clinical workspace, a separate surface with its own
 * permanent Auth session; no patient path reaches it.
 * Any other path gets a plain way back instead of the router's error screen.
 *
 * Only the entrance is in the initial bundle. Lazy routes keep the current
 * screen in place until their chunk is ready, so navigation never flashes an
 * empty frame. If a chunk cannot load, or a screen throws while rendering,
 * every route falls back to RouteErrorScreen rather than the router's
 * developer error page.
 */
const errorElement = <RouteErrorScreen />;
const router = createBrowserRouter([
  { path: '/', element: <EntryScreen />, errorElement },
  { path: '/route', errorElement, lazy: () => loadRouteScreen().then((module) => ({ Component: module.RouteScreen })) },
  // The staff and not-found screens rely on shared rules (for example `.cta`)
  // that ship in the /route stylesheet, and on its cascade position before
  // their own. Loading that chunk first keeps them exactly as they were when
  // everything was one bundle. Neither is on the patient's path.
  { path: '/staff', errorElement, lazy: async () => {
    await loadRouteScreen();
    const { StaffRoute } = await import('./features/staff/StaffRoute.tsx');
    return { Component: StaffRoute };
  } },
  { path: '*', errorElement, lazy: async () => {
    await loadRouteScreen();
    const { NotFoundScreen } = await import('./screens/not-found/NotFoundScreen.tsx');
    return { Component: NotFoundScreen };
  } },
]);

createRoot(root).render(
  <StrictMode>
    {/* Every route of a demonstration build carries the research-prototype notice. */}
    {isDemoBuild(import.meta.env.VITE_DEMO_MODE) ? <DemoBanner /> : null}
    <RouterProvider router={router} />
  </StrictMode>,
);
