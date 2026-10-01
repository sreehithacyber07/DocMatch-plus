/**
 * Server copy of the SOAP builder's fixed Objective line.
 *
 * `src/features/routing-flow/soap-handoff.ts` cannot be imported on the server
 * today because it pulls in a React hook module for one laterality label. R9E
 * should move that label into a pure module and import the builder directly;
 * until then a test pins this copy to the frontend constant.
 */
export const NO_MEASUREMENTS_NOTE =
  'No vital signs, measurements or examination findings were captured by DocMatch+.';
