/**
 * The internal routing view is a developer tool, never a patient one.
 *
 * The belief vector holds a number for every weighted specialty from the first
 * question, whatever the complaint, and its magnitudes are heuristic
 * demonstration values. Showing it to a patient implies a clinical confidence
 * that does not exist and surfaces services that have nothing to do with their
 * concern. It is available only in a development build started with
 * VITE_ROUTING_DEBUG=1. It is not read from the URL: nothing about a session
 * is placed in or taken from the address bar.
 */
export function isRoutingDebugEnabled(): boolean {
  return typeof import.meta.env !== 'undefined'
    && import.meta.env.DEV
    && import.meta.env.VITE_ROUTING_DEBUG === '1';
}
