import { Suspense, lazy } from 'react';

// The care-team workspace and its styles load only when /staff is opened, so
// patient surfaces never download or apply them.
const StaffScreen = lazy(() => import('./StaffScreen.tsx').then((module) => ({ default: module.StaffScreen })));

export function StaffRoute() {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <StaffScreen />
    </Suspense>
  );
}
