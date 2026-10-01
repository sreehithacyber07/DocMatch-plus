/**
 * The /route bundle (body explorer, interview, engines, persistence) is the
 * largest part of the app and the entrance does not need it. One shared,
 * memoized loader lets the router and the entrance's intent prefetch request
 * the same chunk once.
 */
let pending: Promise<typeof import('./RouteScreen.tsx')> | null = null;

export function loadRouteScreen(): Promise<typeof import('./RouteScreen.tsx')> {
  if (!pending) {
    pending = import('./RouteScreen.tsx');
    // A failed fetch must not poison later attempts.
    pending.catch(() => { pending = null; });
  }
  return pending;
}
